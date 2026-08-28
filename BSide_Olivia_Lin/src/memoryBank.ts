/**
 * 分级记忆系统 (Tiered Memory Bank - TypeScript Port)
 * 100% 完整复刻 Python 版 memory_bank.py
 * 基于浏览器 LocalStorage 持久化存储与软删除/后悔处系统
 */

import { Episode, MemoryData } from './types';
import { analyzeText } from './localEngine';

export const MAX_EPISODES = 30;
export const RECENT_IN_PROMPT = 5;
export const TOPICS_IN_PROMPT = 3;
export const DEFAULT_ADMIN_PASSWORD = '123456';
const LS_MEMORY_KEY = 'olivia_memory_bank_v2';
const LS_PASSWORD_KEY = 'olivia_admin_password';

export const TOPIC_ZH: Record<string, string> = {
  sad: "难过", anxiety: "焦虑", work: "工作", study: "学业", love: "心动",
  thanks: "感谢", music: "音乐", weather: "天气", dream: "方向", ill: "身体",
  family: "家人", friend: "朋友", food: "吃食", daily: "日常",
};

export const ECHO_BANK: Record<string, string> = {
  music: "你上次写的那支曲子，我后来还想了想。真的，有些曲子要过很久才对上锁。",
  work: "你上次说的工作，后来好些了吗？休止就是休止，不用急着把音补上。",
  sad: "你上次写的那种感觉，应该退了一些吧。情绪像潮水，自己会退，不用追。",
  anxiety: "上次你说脑子停不下来。这阵子，夜里安静一点了吗？",
  love: "你上封信里那个人，后来怎么样了。我没催你，现在也不催。",
  study: "你上次说在弄的那件事，还卡着吗？没首演的曲子不算失败，只是还没轮到。",
  food: "你上次写的那顿饭，吃得饱吗？好吃的味道，是日子最可靠的证据。",
  weather: "你上次写天气以后，我也开始常看天了。",
  ill: "上次你说身体不舒服，现在好了吗？身体有自己的速度，慢一点没关系。",
  daily: "你上次写的那件小事，我记在本子上了。小事攒起来，就是日子。",
};
export const ECHO_DEFAULT = "信写了几封了。我慢慢习惯了这个节奏——你写，我回。";

function emptyMemory(): MemoryData {
  return { episodes: [], total_letters: 0, first_letter: null, notables: {} };
}

export function loadMemory(): MemoryData {
  try {
    const raw = localStorage.getItem(LS_MEMORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.episodes)) {
        parsed.total_letters = parsed.total_letters || 0;
        parsed.notables = parsed.notables || {};
        return parsed;
      }
    }
  } catch (e) {
    console.warn('读取 LocalStorage 记忆失败:', e);
  }
  return emptyMemory();
}

export function saveMemory(data: MemoryData): void {
  try {
    localStorage.setItem(LS_MEMORY_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('保存 LocalStorage 记忆失败:', e);
  }
}

export function activeEpisodes(data: MemoryData): Episode[] {
  return data.episodes.filter(e => !e.deleted && e.status !== 'DELETED');
}

export function deletedEpisodes(data: MemoryData): Episode[] {
  return data.episodes.filter(e => e.deleted || e.status === 'DELETED');
}

export function getAdminPassword(): string {
  return localStorage.getItem(LS_PASSWORD_KEY) || DEFAULT_ADMIN_PASSWORD;
}

export function verifyAdminPassword(pwd: string): boolean {
  return (pwd || '').trim() === getAdminPassword();
}

export function setAdminPassword(pwd: string): void {
  localStorage.setItem(LS_PASSWORD_KEY, (pwd || '').trim() || DEFAULT_ADMIN_PASSWORD);
}

export function recordExchange(
  userText: string,
  reply: string,
  weather: string,
  mood: string,
  engine: string,
  nowDate?: Date
): Episode {
  const d = nowDate || new Date();
  const a = analyzeText(userText);
  const data = loadMemory();

  const id = `ep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const ep: Episode = {
    id,
    ts: d.toISOString(),
    date: d.toISOString().slice(0, 10),
    topics: a.topics.slice(0, 5),
    weather,
    mood,
    engine,
    user_digest: (userText || '').trim().replace(/\n/g, ' ').slice(0, 40),
    reply_digest: (reply || '').trim().split('\n\n')[0].slice(0, 80),
    farewell: Boolean(a.farewell),
    status: 'ACTIVE',
    deleted: false,
  };

  data.episodes.push(ep);

  if (data.episodes.length > 200) {
    data.episodes = data.episodes.slice(-200);
  }

  const actives = activeEpisodes(data);
  data.total_letters = actives.length;
  if (!data.first_letter && actives.length > 0) {
    data.first_letter = actives[0].ts;
  }

  // L3 晋升
  if (a.farewell && !data.notables.farewell) data.notables.farewell = ep.date;
  if (a.topics.includes('love') && !data.notables.love) data.notables.love = ep.date;

  saveMemory(data);
  return ep;
}

export function softDeleteEpisode(epId: string): boolean {
  const data = loadMemory();
  let changed = false;
  const nowIso = new Date().toISOString();
  for (const e of data.episodes) {
    if (e.id === epId) {
      e.status = 'DELETED';
      e.deleted = true;
      e.deleted_at = nowIso;
      changed = true;
      break;
    }
  }
  if (changed) {
    data.total_letters = activeEpisodes(data).length;
    saveMemory(data);
  }
  return changed;
}

export function softDeleteAll(): number {
  const data = loadMemory();
  let count = 0;
  const nowIso = new Date().toISOString();
  for (const e of data.episodes) {
    if (!e.deleted && e.status !== 'DELETED') {
      e.status = 'DELETED';
      e.deleted = true;
      e.deleted_at = nowIso;
      count++;
    }
  }
  if (count > 0) {
    data.total_letters = 0;
    saveMemory(data);
  }
  return count;
}

export function restoreEpisodes(epIds?: string[] | string): number {
  const data = loadMemory();
  let restored = 0;
  const isAll = !epIds || epIds === 'all' || (Array.isArray(epIds) && epIds.includes('all'));
  const targetSet = Array.isArray(epIds) ? new Set(epIds) : new Set(typeof epIds === 'string' ? [epIds] : []);

  for (const e of data.episodes) {
    if (e.deleted || e.status === 'DELETED') {
      if (isAll || targetSet.has(e.id)) {
        e.status = 'ACTIVE';
        e.deleted = false;
        delete e.deleted_at;
        restored++;
      }
    }
  }

  if (restored > 0) {
    const actives = activeEpisodes(data);
    data.total_letters = actives.length;
    if (actives.length > 0 && !data.first_letter) {
      data.first_letter = actives[0].ts;
    }
    saveMemory(data);
  }
  return restored;
}

export function getSummary() {
  const data = loadMemory();
  const actives = activeEpisodes(data);
  const deleteds = deletedEpisodes(data);
  return {
    path: '浏览器 LocalStorage (纯静态运行)',
    total_letters: actives.length,
    active_count: actives.length,
    deleted_count: deleteds.length,
    recent_episodes: actives.slice(-10),
  };
}

export function renderMemoryContext(): string {
  const data = loadMemory();
  const eps = activeEpisodes(data);
  if (eps.length === 0) return '';

  const lines = ['【长期记忆 · 她记得什么】'];
  const first = (eps[0].ts || '').slice(0, 10);
  lines.push(`- 第一封信：${first}；累计 ${eps.length} 封。`);

  const counts: Record<string, number> = {};
  for (const e of eps) {
    for (const t of e.topics) {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  const topTopics = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, TOPICS_IN_PROMPT);
  if (topTopics.length > 0) {
    const tops = topTopics.map(([t, n]) => `${TOPIC_ZH[t] || t}×${n}`).join('、');
    lines.push(`- 你常写的主题：${tops}。`);
  }

  lines.push('');
  lines.push('【近期情景记忆】（只有这些，不得编造其外的记忆）');
  for (const e of eps.slice(-RECENT_IN_PROMPT)) {
    const topics = e.topics.slice(0, 3).map(t => TOPIC_ZH[t] || t).join('、') || '日常';
    lines.push(`- ${e.date}（${topics}，她的回复：${e.mood || '平静'}）：你写了「${e.user_digest}」`);
  }
  return lines.join('\n');
}

export function getMemoryEcho(excludeDigest?: string): string | null {
  const data = loadMemory();
  const eps = activeEpisodes(data);
  const cleanExclude = (excludeDigest || '').trim().replace(/\n/g, ' ').slice(0, 40);

  for (let i = eps.length - 1; i >= 0; i--) {
    const e = eps[i];
    if (cleanExclude && e.user_digest === cleanExclude) continue;
    for (const t of e.topics) {
      if (ECHO_BANK[t]) return ECHO_BANK[t];
    }
    if (eps.length >= 2) return ECHO_DEFAULT;
    return null;
  }
  return null;
}
