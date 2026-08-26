/* ============================================================
   林离的信箱 · app.js
   写信 → 封缄 → 飞行信封 → 读信等待 → 打字机回信
   本地存档 · 昼/夜 · 雨天画布 · WebAudio 环境音
   ============================================================ */
"use strict";

const $ = (s) => document.querySelector(s);

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
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function refreshCounter() {
  const el = $("#day-counter");
  if (state.unlimited) {
    el.textContent = `今日已寄 ${sentToday()} 封 · 不限量（演示）`;
  } else {
    el.textContent = `今日 ${sentToday()} / 3`;
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

/* ---------------- 引擎状态 ---------------- */

async function refreshStatus() {
  const pill = $("#engine-pill");
  const txt = $("#engine-text");
  try {
    const r = await fetch("/api/status");
    const s = await r.json();
    if (s.model_up) {
      pill.classList.add("ok");
      txt.textContent = `模型已连接 · ${new URL(s.endpoint).port || s.endpoint}`;
    } else {
      pill.classList.remove("ok");
      txt.textContent = "本地人格引擎 · 空壳待接入";
    }
  } catch {
    pill.classList.remove("ok");
    txt.textContent = "服务未连接";
  }
}

/* ---------------- 打字机 ---------------- */

function typewrite(container, text, fast = false, onDone) {
  container.innerHTML = "";
  const paras = text.replace(/\r/g, "").split(/\n{2,}/);
  let pi = 0, ci = 0, pEl = null, caret = null;

  const ensureCaret = () => {
    if (!caret) {
      caret = document.createElement("span");
      caret.className = "caret";
    }
    if (caret.parentNode !== pEl || caret.nextSibling) pEl.appendChild(caret);
  };

  function step() {
    if (pi >= paras.length) {
      if (caret) caret.remove();
      onDone && onDone();
      return;
    }
    const para = paras[pi];
    if (!pEl || pi !== pEl._pi) {
      pEl = document.createElement("p");
      pEl._pi = pi;
      if (para.trimStart().startsWith("—— ")) pEl.classList.add("sign");
      container.appendChild(pEl);
    }
    if (ci < para.length) {
      const ch = para[ci];
      caret && pEl.insertBefore(document.createTextNode(ch), caret);
      ci++;
      let d = fast ? 4 : 16 + Math.random() * 30;
      if ("。！？…".includes(ch)) d += fast ? 40 : 240;
      else if ("，、；：”".includes(ch)) d += fast ? 20 : 100;
      ensureCaret();
      setTimeout(step, d);
    } else {
      pi++;
      ci = 0;
      pEl = null;
      container.scrollTop = container.scrollHeight;
      setTimeout(step, fast ? 10 : 260);
    }
  }
  ensureCaret();
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
  env.getBoundingClientRect(); // reflow
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

async function sendLetter() {
  if (state.sending) return;
  const text = draft.value.trim();
  if (!text) {
    toast("先写点什么吧");
    myCard.classList.remove("shake");
    void myCard.offsetWidth;
    myCard.classList.add("shake");
    return;
  }
  if (!state.unlimited && sentToday() >= 3) {
    toast("今天的三封信已经寄出了。明天再写吧。（可开启“不限量”演示）");
    return;
  }

  setSending(true);
  audio.tick();
  audio.thunk();

  // 火漆
  const wax = $("#wax-seal");
  wax.classList.remove("faded");
  void wax.offsetWidth;
  wax.classList.add("stamped");

  const rect = sendBtn.getBoundingClientRect();
  flyEnvelope(rect);

  // 等火漆 + 信封起飞的一部分时间，再开始"读信"
  await sleep(750);
  showReading(true);

  const t0 = Date.now();
  let data = null;
  try {
    const r = await fetch("/api/letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    data = await r.json();
    if (!r.ok) throw new Error(data.error || "信没寄出去");
  } catch (e) {
    showReading(false);
    setSending(false);
    toast(e.message || "信没寄出去，请再试一次。");
    return;
  }

  // 保留"书信的节奏感"：至少 3.2 秒的读信时间（游戏内是两三分钟）
  const elapsed = Date.now() - t0;
  await sleep(Math.max(0, 3200 - elapsed));

  showReading(false);
  wax.classList.add("faded");

  // 她的信
  $("#her-date").textContent = `${fmtDate()} ${fmtTime()}`;
  showWeather(data.weather, data.mood);
  startRain(!!(data.weather && data.weather.includes("雨")));

  const item = {
    id: Date.now().toString(36),
    ts: new Date().toISOString(),
    text,
    reply: data.reply,
    weather: data.weather,
    mood: data.mood,
    engine: data.engine,
  };
  state.history.push(item);
  if (state.history.length > 60) state.history = state.history.slice(-60);
  localStorage.setItem(LS.history, JSON.stringify(state.history));
  bumpSent();
  refreshCounter();
  renderHistory();

  if (REDUCED) {
    renderStatic(herBody, data.reply);
    setSending(false);
    audio.chord();
  } else {
    typewrite(herBody, data.reply, false, () => {
      setSending(false);
      audio.chord();
    });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 存档 ---------------- */

const drawer = $("#history-drawer");

function renderHistory() {
  const list = $("#history-list");
  list.innerHTML = "";
  $("#history-empty").style.display = state.history.length ? "none" : "block";
  [...state.history].reverse().forEach((item) => {
    const li = document.createElement("li");
    const d = new Date(item.ts);
    li.innerHTML = `
      <div class="h-meta"><span>${d.getMonth() + 1} 月 ${d.getDate()} 日 ${fmtTime(d)} · ${item.weather || "—"}</span><span>${item.engine === "model" ? "模型" : "本地引擎"}</span></div>
      <div class="h-txt"></div>
      <div class="h-act"><button class="ghostbtn sm h-del">删除</button></div>`;
    li.querySelector(".h-txt").textContent = "我：" + item.text.slice(0, 60);
    li.addEventListener("click", () => restoreItem(item));
    li.querySelector(".h-del").addEventListener("click", (e) => {
      e.stopPropagation();
      state.history = state.history.filter((x) => x.id !== item.id);
      localStorage.setItem(LS.history, JSON.stringify(state.history));
      renderHistory();
    });
    list.appendChild(li);
  });
}

function restoreItem(item) {
  draft.value = item.text;
  onDraftInput();
  $("#her-date").textContent = fmtDate(new Date(item.ts));
  showWeather(item.weather, item.mood);
  startRain(!!(item.weather && item.weather.includes("雨")));
  renderStatic(herBody, item.reply);
  drawer.classList.remove("open");
  toast("已翻出这封信");
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
    // 空间：feedback delay
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

  // 事件
  sendBtn.addEventListener("click", sendLetter);
  draft.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); sendLetter(); }
  });
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
  $("#history-toggle").addEventListener("click", () => drawer.classList.toggle("open"));
  $("#history-close").addEventListener("click", () => drawer.classList.remove("open"));
  $("#history-clear").addEventListener("click", () => {
    state.history = [];
    localStorage.removeItem(LS.history);
    renderHistory();
    toast("存档已清空");
  });
  $("#print-btn").addEventListener("click", () => window.print());
  $("#inspire-btn").addEventListener("click", () => {
    const line = INSPIRE[state.inspireIdx % INSPIRE.length];
    state.inspireIdx++;
    if (!draft.value.trim()) draft.value = line;
    else draft.value += "\n\n" + line;
    draft.focus();
    onDraftInput();
  });
  document.addEventListener("click", (e) => {
    if (!drawer.classList.contains("open")) return;
    if (!drawer.contains(e.target) && e.target !== $("#history-toggle") && !$("#history-toggle").contains(e.target)) {
      drawer.classList.remove("open");
    }
  });
}

init();
