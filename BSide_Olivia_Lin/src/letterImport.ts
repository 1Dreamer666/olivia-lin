/**
 * 批量导入信件解析器 (Letter Import Parser)
 *
 * 支持两种输入：
 * 1. JSON：`[{"text":"…","reply":"…","ts":"…"}]`、`{"letters"|"episodes"|"history"|"items"|"data":[…]}`、
 *    记忆文件结构（episodes 数组）、或单封信对象；字段名宽松（user_text/content/body… 均可）。
 * 2. 纯文本：多封用一行 `---` 分隔（分隔符为 3 个及以上的 -、=、*、_、~ 字符）；
 *    每封内可用 `【林离】`/`【回信】` 分割你的信与她的回信（标记行剩余内容算回信正文）。
 *
 * 与 Python 侧 distill_letters 的数据契约保持一致：输出 {text, reply?, ts?, weather?, mood?, engine?, id?}。
 */

import { LetterImportItem, LetterImportResult } from './types';

const TEXT_KEYS = ['text', 'content', 'letter', 'user_text', 'userText', 'user', 'body', 'message'];
const REPLY_KEYS = ['reply', 'reply_text', 'replyText', 'answer', 'response', 'her_reply', 'her'];
const TS_KEYS = ['ts', 'time', 'date', 'timestamp', 'created_at', 'createdAt'];
const CONTAINER_KEYS = ['episodes', 'letters', 'history', 'items', 'data', 'list'];
const REPLY_MARKER = /^\s*【\s*(?:林离|回信|她的回信|回信内容)\s*】\s*(.*)$/;
const SEPARATOR = /^\s*[-=*_~]{3,}\s*$/;

function pickString(obj: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** 宽松归一化一个 JSON 对象为导入条目；无有效正文返回 null */
function normalizeItem(raw: any): LetterImportItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const text = pickString(raw, TEXT_KEYS);
  if (!text) return null;
  const item: LetterImportItem = { text };
  const reply = pickString(raw, REPLY_KEYS);
  if (reply) item.reply = reply;
  const ts = pickString(raw, TS_KEYS);
  if (ts) item.ts = ts;
  for (const key of ['weather', 'mood', 'engine', 'id'] as const) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) item[key] = v.trim();
  }
  return item;
}

/** 从解析出的 JSON 中取出信件数组（数组本体 / 常见容器字段 / 单封信对象） */
function extractJsonItems(parsed: any): any[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    for (const k of CONTAINER_KEYS) {
      if (Array.isArray(parsed[k])) return parsed[k];
    }
    return [parsed];
  }
  return [];
}

/** 纯文本解析：--- 分隔多封，【林离】/【回信】分割回信 */
function parsePlainText(input: string): LetterImportItem[] {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (SEPARATOR.test(line)) {
      blocks.push(cur);
      cur = [];
    } else {
      cur.push(line);
    }
  }
  blocks.push(cur);

  const items: LetterImportItem[] = [];
  for (const block of blocks) {
    let replyIdx = -1;
    let replyFirst = '';
    for (let i = 0; i < block.length; i++) {
      const m = block[i].match(REPLY_MARKER);
      if (m) {
        replyIdx = i;
        replyFirst = (m[1] || '').trim();
        break;
      }
    }
    const textLines = replyIdx >= 0 ? block.slice(0, replyIdx) : block;
    const replyLines = replyIdx >= 0
      ? (replyFirst ? [replyFirst] : []).concat(block.slice(replyIdx + 1))
      : [];
    const text = textLines.join('\n').trim();
    if (!text) continue;
    const item: LetterImportItem = { text };
    const reply = replyLines.join('\n').trim();
    if (reply) item.reply = reply;
    items.push(item);
  }
  return items;
}

export function parseLetterImport(input: string): LetterImportResult {
  const raw = input || '';
  if (!raw.trim()) {
    return { ok: false, format: 'none', letters: [], error: '内容是空的，先粘贴或选择一个文件。' };
  }

  const head = raw.trim()[0];
  if (head === '[' || head === '{') {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      return { ok: false, format: 'json', letters: [], error: `JSON 解析失败：${err?.message || err}` };
    }
    const letters = extractJsonItems(parsed)
      .map(normalizeItem)
      .filter((it): it is LetterImportItem => it !== null);
    if (letters.length === 0) {
      return {
        ok: false,
        format: 'json',
        letters: [],
        error: '没从 JSON 里找到信件。支持 [{"text":"…"}]、{"letters"/"episodes"/"history":[…]} 或单封信对象。',
      };
    }
    return { ok: true, format: 'json', letters };
  }

  const letters = parsePlainText(raw);
  if (letters.length === 0) {
    return { ok: false, format: 'text', letters: [], error: '没有解析到有效信件（多封请用一行 --- 分隔）。' };
  }
  return { ok: true, format: 'text', letters };
}
