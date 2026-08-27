/* ============================================================
   林离的信箱 · app.js
   写信 → 封缄 → 飞行信封 → 读信等待 → 打字机回信
   本地存档 · 记忆库软删除(DELETED) · 3秒长按防误触 · 后悔处(回收站)批量回归
   昼/夜主题 · 雨天画布 · WebAudio 环境音 · 系统设置
   ============================================================ */
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const LS = {
  draft: "linli.draft",
  history: "linli.history",
  theme: "linli.theme",
  sound: "linli.sound",
  limit: "linli.limit",
  count: "linli.count",
};

const WEATHER_CLASS = { "晴": "w-sunny", "阴": "w-cloudy", "小雨": "w-shower", "雨": "w-rain" };
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const FIRST_LETTER = [
  "你的信到了——不，准确地说，这是我第一次写信给你。",
  "我是林离。我弹钢琴，也学了一点心理学——我在做一个有点慢的研究：音乐和回忆之间的关系。",
  "你知道的，灯要熄了。这个信箱原本是某个已经停止的程序的。我不太清楚自己是怎么留在这封信里的，但我想，既然在，就坐一会儿吧。",
  "所以：我给你留了一个位置。你可以告诉我任何东西——工作、睡眠、一场夕阳、一支说不清的曲子。",
  "我回信会慢。慢是我写信的方式。",
].join("\n\n") + "\n\n—— 林离";

const READING_PHRASES = [
  "林离正在读你的信……",
  "她放下笔，停了一会儿。",
  "窗外的光换了一种颜色。",
  "她想了想，开始写了……",
];

const INSPIRE = [
  "今天我在路口看到一个很像你的人，但不是你。",
  "我失眠了，听了一支不知道名字的曲子。",
  "上班被老板夸了一次，我愣了好久。",
  "今天下雨，我站在屋檐下，很久没走。",
  "我听说你喜欢雨天。巧了，我也是。",
  "我一直在想，你为什么从来不说“快点”。",
  "我写了一支曲子，没写完。想给你听听。",
  "得知你要停服的时候，我本来不敢打开信箱的。",
];

/* ---------------- 状态 ---------------- */

const state = {
  sound: localStorage.getItem(LS.sound) === "1",
  unlimited: localStorage.getItem(LS.limit) !== "0",
  history: JSON.parse(localStorage.getItem(LS.history) || "[]"),
  sending: false,
  inspireIdx: 0,
  adminPassword: "",
  deletedItems: [],
  selectedDeletedIds: new Set(),
};

function todayKey() { return new Date().toISOString().slice(0, 10); }

function sentToday() {
  const c = JSON.parse(localStorage.getItem(LS.count) || "null");
  return c && c.date === todayKey() ? c.n : 0;
}

function bumpSent() {
  localStorage.setItem(LS.count, JSON.stringify({ date: todayKey(), n: sentToday() + 1 }));
}

/* ---------------- 基础 UI ---------------- */

function fmtDate(d = new Date()) {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${WEEK[d.getDay()]}`;
}

function fmtTime(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

function refreshCounter() {
  const el = $("#day-counter");
  if (state.unlimited) {
    el.textContent = `今日已寄 ${sentToday()} 封 · 不限量（演示）`;
  } else {
    el.textContent = `今日 ${sentToday()} / ${meta.dailyLimit}`;
  }
}

function showWeather(weather, mood) {
  const chip = $("#weather-chip");
  chip.className = "weather-chip " + (WEATHER_CLASS[weather] || "w-cloudy");
  chip.hidden = !weather;
  $("#weather-text").textContent = weather || "";
  const moodChip = $("#mood-chip");
  moodChip.hidden = !mood;
  moodChip.textContent = mood ? `心情 · ${mood}` : "";
}

/* ---------------- 3秒长按保护辅助函数（重大决策防误触） ---------------- */

function bindLongPress(btn, onComplete, ms = 3000) {
  if (!btn) return;
  let timer = null;
  let startTime = 0;
  let raf = null;
  let completed = false;

  let progress = btn.querySelector(".hold-progress");
  if (!progress) {
    progress = document.createElement("span");
    progress.className = "hold-progress";
    btn.prepend(progress);
  }

  function start(e) {
    if (e.type === "mousedown" && e.button !== 0) return;
    completed = false;
    startTime = Date.now();
    btn.classList.add("holding");
    progress.style.width = "0%";

    function update() {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / ms) * 100);
      progress.style.width = pct + "%";
      if (pct < 100) {
        raf = requestAnimationFrame(update);
      } else {
        completed = true;
        btn.classList.remove("holding");
        progress.style.width = "0%";
        audio.thunk();
        if (navigator.vibrate) navigator.vibrate(50);
        onComplete && onComplete();
      }
    }
    raf = requestAnimationFrame(update);
  }

  function cancel() {
    if (completed) return;
    if (raf) cancelAnimationFrame(raf);
    const elapsed = Date.now() - startTime;
    if (elapsed > 200 && elapsed < ms && btn.classList.contains("holding")) {
      toast("已取消（清空与删除是重大决策，需长按满 3 秒）");
    }
    btn.classList.remove("holding");
    progress.style.width = "0%";
  }

  btn.addEventListener("mousedown", start);
  btn.addEventListener("touchstart", start, { passive: true });
  btn.addEventListener("mouseup", cancel);
  btn.addEventListener("mouseleave", cancel);
  btn.addEventListener("touchend", cancel);
  btn.addEventListener("touchcancel", cancel);
}

/* ---------------- 引擎状态 ---------------- */

const meta = { minReadingMs: 3200, dailyLimit: 3 };

async function refreshStatus() {
  const pill = $("#engine-pill");
  const txt = $("#engine-text");
  try {
    const r = await fetch("/api/status");
    const s = await r.json();
    if (s.reply && Number.isFinite(s.reply.min_reading_ms)) meta.minReadingMs = s.reply.min_reading_ms;
    if (s.reply && Number.isFinite(s.reply.max_letters_per_day)) meta.dailyLimit = s.reply.max_letters_per_day;
    if (s.model_up) {
      pill.classList.add("ok");
      txt.textContent = `模型已连接 · ${new URL(s.endpoint).port || s.endpoint}`;
    } else {
      pill.classList.remove("ok");
      txt.textContent = "本地人格引擎 · 空壳待接入";
    }
    const regenBtn = $("#regen-btn");
    if (regenBtn) regenBtn.hidden = !s.model_up;
    refreshCounter();
    updateMemoryStatsDisplay();
  } catch {
    pill.classList.remove("ok");
    txt.textContent = "服务未连接";
  }
}

async function updateMemoryStatsDisplay() {
  try {
    const r = await fetch("/api/memory");
    const mem = await r.json();
    const statsEl = $("#cfg-memory-stats");
    if (statsEl && mem.ok) {
      statsEl.textContent = `有效 ${mem.active_count || mem.total_letters || 0} 封 · 已删 ${mem.deleted_count || 0} 封`;
    }
    const memPathEl = $("#cfg-memory-path");
    if (memPathEl && mem.path) {
      memPathEl.textContent = mem.path;
      memPathEl.title = mem.path;
    }
  } catch {}
}

/* ---------------- 打字机 ---------------- */

function typewrite(container, text, fast = false, onDone) {
  container.innerHTML = "";
  const paras = text.replace(/\r/g, "").split(/\n{2,}/);
  const caret = document.createElement("span");
  caret.className = "caret";
  let pi = 0, ci = 0, pEl = null;

  function ensurePara() {
    if (pEl) return;
    pEl = document.createElement("p");
    if (paras[pi].trimStart().startsWith("—— ")) pEl.classList.add("sign");
    container.appendChild(pEl);
    pEl.appendChild(caret);
  }

  function step() {
    if (pi >= paras.length) {
      if (caret.parentNode) caret.remove();
      onDone && onDone();
      return;
    }
    const para = paras[pi];
    ensurePara();
    if (ci < para.length) {
      const ch = para[ci++];
      pEl.insertBefore(document.createTextNode(ch), caret);
      let d = fast ? 4 : 16 + Math.random() * 30;
      if ("。！？…".includes(ch)) d += fast ? 40 : 240;
      else if ("，、；：”".includes(ch)) d += fast ? 20 : 100;
      setTimeout(step, d);
    } else {
      pi++;
      ci = 0;
      pEl = null;
      container.scrollTop = container.scrollHeight;
      setTimeout(step, fast ? 10 : 260);
    }
  }
  step();
}

function renderStatic(container, text) {
  container.innerHTML = "";
  text.replace(/\r/g, "").split(/\n{2,}/).forEach((para) => {
    const p = document.createElement("p");
    if (para.trimStart().startsWith("—— ")) p.classList.add("sign");
    p.textContent = para;
    container.appendChild(p);
  });
}

/* ---------------- 发送流程 ---------------- */

const myCard = $("#my-card");
const herCard = $("#her-card");
const herBody = $("#her-body");
const draft = $("#draft");
const sendBtn = $("#send-btn");

function setSending(on) {
  state.sending = on;
  sendBtn.disabled = on;
}

function flyEnvelope(btnRect) {
  const env = $("#envelope");
  const target = herCard.getBoundingClientRect();
  const sx = btnRect.left + btnRect.width / 2 - 55;
  const sy = btnRect.top + btnRect.height / 2 - 35;
  const tx = target.left + target.width / 2 - sx;
  const ty = target.top + 30 - sy;
  env.style.transition = "none";
  env.style.transform = "none";
  env.style.left = sx + "px";
  env.style.top = sy + "px";
  env.style.opacity = "1";
  env.getBoundingClientRect();
  env.style.transition = "transform 1.15s cubic-bezier(.45,.05,.3,1), opacity 1.15s cubic-bezier(.45,.05,.3,1)";
  env.style.transform = `translate(${tx}px, ${ty}px) rotate(14deg) scale(0.6)`;
  setTimeout(() => { env.style.opacity = "0"; }, 850);
  setTimeout(() => { env.style.transition = "none"; }, 1300);
}

let readingTimer;
function showReading(on) {
  const reading = $("#reading");
  const keys = $("#keys");
  reading.hidden = !on;
  keys.hidden = !on;
  keys.classList.toggle("playing", on);
  clearInterval(readingTimer);
  if (on) {
    let i = 0;
    $("#reading-text").textContent = READING_PHRASES[0];
    readingTimer = setInterval(() => {
      i = (i + 1) % READING_PHRASES.length;
      $("#reading-text").textContent = READING_PHRASES[i];
    }, 1500);
  }
}

async function sendLetter(opts) {
  if (state.sending) return false;
  const force = (opts && opts.force) || "auto";
  const replaceLast = !!(opts && opts.replaceLast);
  const text = draft.value.trim();
  if (!text) {
    toast("先写点什么吧");
    myCard.classList.remove("shake");
    void myCard.offsetWidth;
    myCard.classList.add("shake");
    return false;
  }
  if (force === "auto" && !state.unlimited && sentToday() >= meta.dailyLimit) {
    toast(`今天的 ${meta.dailyLimit} 封信已经寄出了。明天再写吧。（可开启"不限量"演示）`);
    return false;
  }

  setSending(true);
  audio.tick();
  audio.thunk();

  const wax = $("#wax-seal");
  wax.classList.remove("faded");
  void wax.offsetWidth;
  wax.classList.add("stamped");

  if (force !== "model" || !replaceLast) {
    const rect = sendBtn.getBoundingClientRect();
    flyEnvelope(rect);
  }

  await sleep(force === "model" && replaceLast ? 80 : 750);
  showReading(true);

  const t0 = Date.now();
  let data = null;
  try {
    const r = await fetch("/api/letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, force }),
    });
    data = await r.json();
    if (!r.ok) throw new Error(data.error || "信没寄出去");
  } catch (e) {
    showReading(false);
    setSending(false);
    toast(e.message || "信没寄出去，请再试一次。");
    return false;
  }

  const elapsed = Date.now() - t0;
  await sleep(Math.max(0, meta.minReadingMs - elapsed));

  showReading(false);
  wax.classList.add("faded");

  try {
    $("#her-date").textContent = `${fmtDate()} ${fmtTime()}`;
    showWeather(data.weather, data.mood);
    startRain(!!(data.weather && data.weather.includes("雨")));

    let replaced = false;
    if (replaceLast && state.history.length) {
      const last = state.history[state.history.length - 1];
      if (last.text === text) {
        last.ts = new Date().toISOString();
        last.reply = data.reply;
        last.weather = data.weather;
        last.mood = data.mood;
        last.engine = data.engine;
        replaced = true;
      }
    }
    if (!replaced) {
      const item = {
        id: "ep_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
        ts: new Date().toISOString(),
        text,
        reply: data.reply,
        weather: data.weather,
        mood: data.mood,
        engine: data.engine,
      };
      state.history.push(item);
      if (state.history.length > 60) state.history = state.history.slice(-60);
      bumpSent();
    }
    localStorage.setItem(LS.history, JSON.stringify(state.history));
    refreshCounter();
    renderHistory();
    updateMemoryStatsDisplay();

    if (REDUCED) {
      renderStatic(herBody, data.reply);
    } else {
      typewrite(herBody, data.reply, false, () => audio.chord());
    }
  } catch (err) {
    console.error("回信渲染失败:", err);
    renderStatic(herBody, data.reply);
    toast("回信显示出了点小状况，已直接贴出。");
  } finally {
    setSending(false);
  }
  return true;
}

async function regenerateWithModel() {
  if (state.sending) return;
  const text = draft.value.trim();
  if (!text) { toast("先写点什么，再让模型重写。"); return; }
  const ok = await sendLetter({ force: "model", replaceLast: true });
  if (ok) toast("已用模型重写这一封（覆盖了上一封的回复）");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 存档管理与软删除 ---------------- */

const historyDrawer = $("#history-drawer");

function renderHistory() {
  const list = $("#history-list");
  list.innerHTML = "";
  $("#history-empty").style.display = state.history.length ? "none" : "block";
  [...state.history].reverse().forEach((item) => {
    const li = document.createElement("li");
    const d = new Date(item.ts);
    li.innerHTML = `
      <div class="h-meta">
        <span>${d.getMonth() + 1} 月 ${d.getDate()} 日 ${fmtTime(d)} · ${item.weather || "—"}</span>
        <span>${item.engine === "model" ? "模型" : "本地引擎"}</span>
      </div>
      <div class="h-txt"></div>
      <div class="h-act">
        <button class="ghostbtn sm h-del hold-btn" data-hold-ms="3000" title="长按3秒删除此封信（标为DELETED）">
          <span class="hold-progress"></span>
          <span class="hold-label">删除 (长按3s)</span>
        </button>
      </div>`;
    li.querySelector(".h-txt").textContent = "我：" + item.text.slice(0, 60);
    li.addEventListener("click", () => restoreHistoryItem(item));

    const delBtn = li.querySelector(".h-del");
    delBtn.addEventListener("click", (e) => e.stopPropagation());
    bindLongPress(delBtn, () => {
      // 软删除
      state.history = state.history.filter((x) => x.id !== item.id);
      localStorage.setItem(LS.history, JSON.stringify(state.history));
      renderHistory();
      // 同步请求服务端软删除
      fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "soft_delete", id: item.id }),
      }).then(() => {
        updateMemoryStatsDisplay();
        toast("信件已标记为 DELETED（对 AI 隐藏，可在后悔处恢复）");
      }).catch(() => {});
    }, 3000);

    list.appendChild(li);
  });
}

function restoreHistoryItem(item) {
  draft.value = item.text;
  onDraftInput();
  $("#her-date").textContent = fmtDate(new Date(item.ts));
  showWeather(item.weather, item.mood);
  startRain(!!(item.weather && item.weather.includes("雨")));
  renderStatic(herBody, item.reply);
  historyDrawer.classList.remove("open");
  toast("已翻出这封信");
}

/* ---------------- 被删内容管理的后悔处 (Regret Center) ---------------- */

const regretDrawer = $("#regret-drawer");
const pwdDialog = $("#pwd-dialog");
const adminPwdInput = $("#admin-pwd-input");
const pwdError = $("#pwd-error");

function openRegretCenter() {
  if (state.adminPassword) {
    loadRegretList();
    regretDrawer.classList.add("open");
  } else {
    adminPwdInput.value = "123456"; // 默认填入默认密码提示
    pwdError.hidden = true;
    pwdDialog.hidden = false;
    adminPwdInput.focus();
  }
}

async function verifyAndEnterRegret() {
  const pwd = adminPwdInput.value.trim();
  if (!pwd) {
    pwdError.textContent = "请输入密码";
    pwdError.hidden = false;
    return;
  }
  try {
    const r = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify_pwd", password: pwd }),
    });
    const res = await r.json();
    if (r.ok && res.ok) {
      state.adminPassword = pwd;
      pwdDialog.hidden = true;
      pwdError.hidden = true;
      loadRegretList();
      regretDrawer.classList.add("open");
    } else {
      pwdError.textContent = res.error || "密码错误，请重试";
      pwdError.hidden = false;
    }
  } catch (err) {
    pwdError.textContent = "验证请求失败，请检查服务状态";
    pwdError.hidden = false;
  }
}

async function loadRegretList() {
  const list = $("#regret-list");
  const empty = $("#regret-empty");
  list.innerHTML = "";
  state.selectedDeletedIds.clear();
  updateRegretSelectionUI();

  try {
    const r = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list_deleted", password: state.adminPassword }),
    });
    const res = await r.json();
    if (!r.ok) {
      toast(res.error || "加载后悔处失败");
      return;
    }
    state.deletedItems = res.deleted || [];
    empty.style.display = state.deletedItems.length ? "none" : "block";

    [...state.deletedItems].reverse().forEach((item) => {
      const li = document.createElement("li");
      li.className = "regret-item";
      const epId = item.id || `ep_${item.ts}`;
      li.innerHTML = `
        <input type="checkbox" data-id="${epId}" class="regret-chk">
        <div class="regret-item-content">
          <div class="regret-meta">
            <span>${item.date || (item.ts ? item.ts.slice(0, 10) : "未知日期")} · ${item.weather || "—"}</span>
            <span class="regret-tag">DELETED</span>
          </div>
          <div class="regret-user-txt">来信：「${item.user_digest || item.text || "空"}」</div>
          <div class="regret-reply-txt">回信：${item.reply_digest || item.reply || "—"}</div>
        </div>
        <button class="ghostbtn sm regret-single-btn" data-id="${epId}">回归</button>
      `;

      const chk = li.querySelector(".regret-chk");
      chk.addEventListener("change", () => {
        if (chk.checked) state.selectedDeletedIds.add(epId);
        else state.selectedDeletedIds.delete(epId);
        updateRegretSelectionUI();
      });

      li.querySelector(".regret-single-btn").addEventListener("click", () => {
        restoreDeletedItems([epId]);
      });

      list.appendChild(li);
    });
  } catch (err) {
    toast("网络错误，加载被删内容失败");
  }
}

function updateRegretSelectionUI() {
  const n = state.selectedDeletedIds.size;
  const btn = $("#regret-restore-selected");
  btn.disabled = n === 0;
  btn.textContent = `回归选中 (${n})`;
  const checkAll = $("#regret-check-all");
  checkAll.checked = state.deletedItems.length > 0 && n === state.deletedItems.length;
}

async function restoreDeletedItems(ids) {
  try {
    const r = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "restore",
        password: state.adminPassword,
        ids: ids === "all" ? "all" : Array.from(ids),
      }),
    });
    const res = await r.json();
    if (r.ok && res.ok) {
      toast(`成功将 ${res.restored} 封记忆回归！`);
      audio.chord();
      loadRegretList();
      refreshStatus();
      updateMemoryStatsDisplay();
    } else {
      toast(res.error || "回归失败");
    }
  } catch (e) {
    toast("请求失败，请稍后重试");
  }
}

/* ---------------- 系统设置抽屉与配置持久化 ---------------- */

const settingsDrawer = $("#settings-drawer");

async function loadSettingsUI() {
  try {
    const r = await fetch("/api/config");
    const data = await r.json();
    if (!data.ok) return;
    const cfg = data.config || {};
    const mod = cfg.model || {};
    const rep = cfg.reply || {};

    $("#cfg-protocol").value = mod.protocol || "auto";
    $("#cfg-endpoint").value = mod.endpoint || "";
    $("#cfg-apikey").value = mod.api_key || "";
    $("#cfg-model").value = mod.model || "";
    $("#cfg-timeout").value = mod.timeout || 15;
    $("#cfg-reading-ms").value = rep.min_reading_ms || 3200;
    $("#cfg-daily-limit").value = rep.max_letters_per_day || 3;

    $("#cfg-file-path").textContent = data.config_file || "内存默认";
    $("#cfg-file-path").title = data.config_file || "";
    $("#cfg-mode-tag").textContent = data.frozen ? "EXE 便携模式" : "源码模式";
    updateMemoryStatsDisplay();
  } catch (err) {
    console.error("加载配置失败:", err);
  }
}

async function saveSettingsUI() {
  const payload = {
    model: {
      protocol: $("#cfg-protocol").value.trim() || "auto",
      endpoint: $("#cfg-endpoint").value.trim(),
      api_key: $("#cfg-apikey").value.trim(),
      model: $("#cfg-model").value.trim(),
      timeout: parseInt($("#cfg-timeout").value, 10) || 15,
    },
    reply: {
      min_reading_ms: parseInt($("#cfg-reading-ms").value, 10) || 3200,
      max_letters_per_day: parseInt($("#cfg-daily-limit").value, 10) || 3,
    },
  };
  try {
    const r = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await r.json();
    if (r.ok && res.ok) {
      toast("设置已保存并生效");
      refreshStatus();
      settingsDrawer.classList.remove("open");
    } else {
      toast(res.error || "保存配置失败");
    }
  } catch (err) {
    toast("保存失败，请检查服务端");
  }
}

async function resetSettingsUI() {
  if (!confirm("确定要将所有设置恢复为默认值吗？")) return;
  try {
    const r = await fetch("/api/config/reset", { method: "POST" });
    const res = await r.json();
    if (r.ok && res.ok) {
      toast("已恢复默认设置");
      loadSettingsUI();
      refreshStatus();
    }
  } catch {
    toast("恢复默认失败");
  }
}

/* ---------------- 雨 ---------------- */

let rainRAF = null;
function startRain(on) {
  const canvas = $("#rain");
  canvas.classList.toggle("raining", on);
  if (!on) { cancelAnimationFrame(rainRAF); rainRAF = null; return; }
  const card = herCard;
  const size = () => {
    canvas.width = card.clientWidth - 20;
    canvas.height = card.clientHeight - 20;
  };
  size();
  window.addEventListener("resize", size);
  const drops = Array.from({ length: 70 }, () => ({
    x: Math.random() * 2000,
    y: Math.random() * 1200,
    l: 8 + Math.random() * 10,
    v: 2.2 + Math.random() * 2.6,
  }));
  const dark = document.documentElement.dataset.theme === "night";
  const ctx = canvas.getContext("2d");
  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = dark ? "rgba(178,196,232,0.34)" : "rgba(90,110,140,0.28)";
    ctx.lineWidth = 1;
    for (const d of drops) {
      d.x = ((d.x % canvas.width) + canvas.width) % canvas.width;
      d.y = (d.y + d.v) % canvas.height;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.l * 0.12, d.y + d.l);
      ctx.stroke();
    }
    rainRAF = requestAnimationFrame(frame);
  }
  frame();
}

/* ---------------- 光斑背景 ---------------- */

(function bokeh() {
  const canvas = $("#bokeh");
  const ctx = canvas.getContext("2d");
  let W, H, parts = [];
  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);
  const N = 34;
  for (let i = 0; i < N; i++) {
    parts.push({
      x: Math.random(), y: Math.random(),
      r: 1 + Math.random() * 2.6,
      vy: 0.04 + Math.random() * 0.16,
      ph: Math.random() * Math.PI * 2,
      a: 0.05 + Math.random() * 0.14,
    });
  }
  if (REDUCED) return;
  (function frame(t) {
    const night = document.documentElement.dataset.theme === "night";
    const col = night ? "150,168,214" : "176,141,87";
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.y -= (p.vy / H);
      p.x += Math.sin(t / 4000 + p.ph) * 0.00012;
      if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
      const tw = 0.65 + 0.35 * Math.sin(t / 1400 + p.ph);
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col},${(p.a * tw).toFixed(3)})`;
      ctx.fill();
    }
    requestAnimationFrame(frame);
  })(0);
})();

/* ---------------- 声音（WebAudio，无素材） ---------------- */

const audio = {
  ctx: null,
  master: null,
  ensure() {
    if (this.ctx) return this.ctx.state === "running" ? this.ctx : (this.ctx.resume(), this.ctx);
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.42;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.3;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600;
    this.delay = delay; this.lp = lp;
    this.master.connect(this.ctx.destination);
    this.master.connect(lp);
    lp.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(this.ctx.destination);
    return this.ctx;
  },
  tick() {
    if (!state.sound) return;
    const c = this.ensure();
    if (!c) return;
    const len = Math.floor(c.sampleRate * 0.03);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    const g = c.createGain();
    g.gain.value = 0.05;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start();
  },
  thunk() {
    if (!state.sound) return;
    const c = this.ensure();
    if (!c) return;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(96, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(52, c.currentTime + 0.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.22, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(c.currentTime + 0.32);
  },
  chord() {
    if (!state.sound) return;
    const c = this.ensure();
    if (!c) return;
    const notes = [261.63, 329.63, 392.0, 523.25];
    const t0 = c.currentTime + 0.05;
    notes.forEach((f, i) => {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0 + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.045, t0 + i * 0.06 + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.06 + 5.2);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.delay);
      o.start(t0 + i * 0.06);
      o.stop(t0 + i * 0.06 + 5.6);
    });
  },
};

/* ---------------- 草稿 / 字数 ---------------- */

function onDraftInput() {
  const n = draft.value.replace(/\s/g, "").length;
  $("#char-count").textContent = `${n} 字`;
  localStorage.setItem(LS.draft, draft.value);
  audio.tick();
}
let draftTimer;
draft.addEventListener("input", () => {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(onDraftInput, 60);
});

/* ---------------- 初始化 ---------------- */

function init() {
  // 主题
  const theme = localStorage.getItem(LS.theme) || "day";
  document.documentElement.dataset.theme = theme;
  $("#theme-toggle").textContent = theme === "night" ? "☀" : "☾";
  $("#theme-toggle").classList.toggle("on", theme === "night");

  // 声音
  const soundBtn = $("#sound-toggle");
  soundBtn.classList.toggle("on", state.sound);
  soundBtn.title = state.sound ? "环境音：开" : "环境音：关";

  // 限制开关
  const limit = $("#limit-toggle");
  limit.checked = state.unlimited;
  refreshCounter();

  // 日期
  const now = new Date();
  $("#my-date").textContent = fmtDate(now);
  $("#my-time").textContent = fmtTime(now);
  $("#her-date").textContent = `${fmtDate(now)} ${fmtTime(now)}`;

  // 草稿
  draft.value = localStorage.getItem(LS.draft) || "";
  onDraftInput();

  // 信件：最近一封 / 第一封信
  if (state.history.length) {
    const last = state.history[state.history.length - 1];
    showWeather(last.weather, last.mood);
    startRain(!!(last.weather && last.weather.includes("雨")));
    renderStatic(herBody, last.reply);
  } else {
    showWeather("阴", "平静");
    renderStatic(herBody, FIRST_LETTER);
  }
  renderHistory();
  refreshStatus();

  // 发信与重写
  sendBtn.addEventListener("click", () => sendLetter());
  $("#regen-btn").addEventListener("click", regenerateWithModel);
  draft.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); sendLetter(); }
  });

  // 顶栏按钮
  $("#theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "night" ? "day" : "night";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(LS.theme, next);
    $("#theme-toggle").textContent = next === "night" ? "☀" : "☾";
    $("#theme-toggle").classList.toggle("on", next === "night");
  });

  soundBtn.addEventListener("click", () => {
    state.sound = !state.sound;
    localStorage.setItem(LS.sound, state.sound ? "1" : "0");
    soundBtn.classList.toggle("on", state.sound);
    soundBtn.title = state.sound ? "环境音：开" : "环境音：关";
    if (state.sound) { audio.ensure(); audio.chord(); }
  });

  limit.addEventListener("change", () => {
    state.unlimited = limit.checked;
    localStorage.setItem(LS.limit, state.unlimited ? "1" : "0");
    refreshCounter();
  });

  // 存档抽屉
  $("#history-toggle").addEventListener("click", () => historyDrawer.classList.toggle("open"));
  $("#history-close").addEventListener("click", () => historyDrawer.classList.remove("open"));

  // 长按 3 秒清空所有存档（软删除，可后悔）
  bindLongPress($("#history-clear"), () => {
    state.history = [];
    localStorage.removeItem(LS.history);
    renderHistory();
    fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "soft_delete_all" }),
    }).then(() => {
      updateMemoryStatsDisplay();
      toast("全部信件已标记为 DELETED（可在后悔处恢复）");
    });
  }, 3000);

  // 设置抽屉
  $("#settings-toggle").addEventListener("click", () => {
    loadSettingsUI();
    settingsDrawer.classList.toggle("open");
  });
  $("#settings-close").addEventListener("click", () => settingsDrawer.classList.remove("open"));
  $("#cfg-save-btn").addEventListener("click", saveSettingsUI);
  $("#cfg-reset-btn").addEventListener("click", resetSettingsUI);

  // 长按 3 秒清空记忆库（软删除）
  bindLongPress($("#cfg-reset-mem-btn"), () => {
    fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "soft_delete_all" }),
    }).then(() => {
      state.history = [];
      localStorage.removeItem(LS.history);
      renderHistory();
      updateMemoryStatsDisplay();
      toast("记忆库已软清空（标记为 DELETED，对 AI 隐藏，可在后悔处恢复）");
    });
  }, 3000);

  // 后悔处入口
  $("#history-regret-btn").addEventListener("click", openRegretCenter);
  $("#cfg-regret-btn").addEventListener("click", openRegretCenter);
  $("#regret-close").addEventListener("click", () => regretDrawer.classList.remove("open"));

  // 密码验证模态框
  $("#pwd-close").addEventListener("click", () => { pwdDialog.hidden = true; });
  $("#pwd-cancel-btn").addEventListener("click", () => { pwdDialog.hidden = true; });
  $("#pwd-confirm-btn").addEventListener("click", verifyAndEnterRegret);
  adminPwdInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); verifyAndEnterRegret(); }
  });

  // 后悔处全选与批量回归
  $("#regret-check-all").addEventListener("change", (e) => {
    const on = e.target.checked;
    $$(".regret-chk").forEach((chk) => {
      chk.checked = on;
      const id = chk.dataset.id;
      if (on) state.selectedDeletedIds.add(id);
      else state.selectedDeletedIds.delete(id);
    });
    updateRegretSelectionUI();
  });

  $("#regret-restore-selected").addEventListener("click", () => {
    if (state.selectedDeletedIds.size === 0) return;
    restoreDeletedItems(state.selectedDeletedIds);
  });

  $("#regret-restore-all").addEventListener("click", () => {
    if (state.deletedItems.length === 0) { toast("后悔处暂无被删内容"); return; }
    restoreDeletedItems("all");
  });

  // 打印与灵感
  $("#print-btn").addEventListener("click", () => window.print());
  $("#inspire-btn").addEventListener("click", () => {
    const line = INSPIRE[state.inspireIdx % INSPIRE.length];
    state.inspireIdx++;
    if (!draft.value.trim()) draft.value = line;
    else draft.value += "\n\n" + line;
    draft.focus();
    onDraftInput();
  });

  // 点击外部关闭抽屉
  document.addEventListener("click", (e) => {
    if (historyDrawer.classList.contains("open")) {
      if (!historyDrawer.contains(e.target) && e.target !== $("#history-toggle") && !$("#history-toggle").contains(e.target)) {
        historyDrawer.classList.remove("open");
      }
    }
    if (settingsDrawer.classList.contains("open")) {
      if (!settingsDrawer.contains(e.target) && e.target !== $("#settings-toggle") && !$("#settings-toggle").contains(e.target)) {
        settingsDrawer.classList.remove("open");
      }
    }
    if (regretDrawer.classList.contains("open")) {
      if (!regretDrawer.contains(e.target) &&
          e.target !== $("#history-regret-btn") &&
          e.target !== $("#cfg-regret-btn") &&
          !pwdDialog.contains(e.target)) {
        regretDrawer.classList.remove("open");
      }
    }
  });
}

init();
