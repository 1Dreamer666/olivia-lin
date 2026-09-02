/**
 * 浏览器端多协议兼容模型客户端 (Browser Model Client)
 * 纯前端 Fetch 直连 OpenAI 兼容 / Gemini / Anthropic / Auto 端点
 * 升级：支持 SSE 流式心跳活跃超时（Sliding Inactivity Timeout）
 */

import { ModelConfig } from './types';

export function detectProtocol(proto: string, endpoint: string, modelName: string): 'openai' | 'gemini' | 'anthropic' {
  const p = (proto || 'auto').trim().toLowerCase();
  if (p === 'openai' || p === 'gemini' || p === 'anthropic') return p;

  const ep = (endpoint || '').toLowerCase();
  const m = (modelName || '').toLowerCase();

  if (ep.includes('anthropic') || m.includes('claude')) return 'anthropic';
  if (ep.includes('googleapis') || (m.startsWith('gemini') && !ep.includes('v1/chat'))) return 'gemini';
  if (ep.includes('chat/completions') || ep.includes('openai') || ep.includes('deepseek') || m.includes('qwen') || m.includes('gpt')) {
    return 'openai';
  }
  return 'openai';
}

/**
 * 通用带活跃心跳重置的 SSE 流式读取器
 */
async function readSSEStreamWithInactivityTimeout(
  response: Response,
  inactivityTimeoutMs: number,
  onChunk: (text: string) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body stream is not available');

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    let timer: any = null;
    const timeoutPromise = new Promise<{ done: boolean; value: undefined }>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Inactivity timeout after ${inactivityTimeoutMs}ms`));
      }, inactivityTimeoutMs);
    });

    try {
      const result = await Promise.race([reader.read(), timeoutPromise]);
      clearTimeout(timer);

      if (result.done) {
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') return;
          try {
            const parsed = JSON.parse(dataStr);
            // 兼容 OpenAI 格式
            const openaiDelta = parsed?.choices?.[0]?.delta?.content;
            if (openaiDelta) onChunk(openaiDelta);

            // 兼容 Anthropic 格式
            if (parsed?.type === 'content_block_delta' && parsed?.delta?.type === 'text_delta') {
              onChunk(parsed.delta.text || '');
            }

            // 兼容 Gemini 格式
            const geminiParts = parsed?.candidates?.[0]?.content?.parts;
            if (Array.isArray(geminiParts)) {
              for (const part of geminiParts) {
                if (part?.text) onChunk(part.text);
              }
            }
          } catch {
            // 忽略非 JSON 块
          }
        }
      }
    } catch (err) {
      clearTimeout(timer);
      try { reader.cancel(); } catch {}
      throw err;
    }
  }
}

async function callOpenAI(config: ModelConfig, system: string, userText: string): Promise<string | null> {
  let base = (config.endpoint || '').trim().replace(/\/+$/, '');
  let url: string;
  if (base.endsWith('/chat/completions')) {
    url = base;
  } else if (base.endsWith('/v1')) {
    url = `${base}/chat/completions`;
  } else {
    url = `${base}/v1/chat/completions`;
  }

  const timeoutMs = (config.timeout || 15) * 1000;
  const initialController = new AbortController();
  const initialTimer = setTimeout(() => initialController.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key || 'test'}`,
        'Accept': 'text/event-stream, application/json',
      },
      body: JSON.stringify({
        model: config.model || 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText },
        ],
        temperature: 0.7,
        stream: true,
      }),
      signal: initialController.signal,
    });
    clearTimeout(initialTimer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const parts: string[] = [];
    await readSSEStreamWithInactivityTimeout(res, timeoutMs, (chunk) => {
      parts.push(chunk);
    });

    if (parts.length > 0) return parts.join('').trim();
  } catch (err) {
    clearTimeout(initialTimer);
    // 非流式降级尝试
    try {
      const res2 = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.api_key || 'test'}`,
        },
        body: JSON.stringify({
          model: config.model || 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userText },
          ],
          temperature: 0.7,
          stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res2.ok) {
        const data = await res2.json();
        const text = data?.choices?.[0]?.message?.content;
        return typeof text === 'string' ? text.trim() : null;
      }
    } catch {}
  }
  return null;
}

async function callAnthropic(config: ModelConfig, system: string, userText: string): Promise<string | null> {
  let base = (config.endpoint || '').trim().replace(/\/+$/, '');
  let url = base.endsWith('/messages') ? base : (base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`);
  const timeoutMs = (config.timeout || 15) * 1000;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.api_key || 'test',
        'anthropic-version': '2023-06-01',
        'Accept': 'text/event-stream, application/json',
      },
      body: JSON.stringify({
        model: config.model || 'claude-3-5-sonnet-latest',
        system,
        messages: [{ role: 'user', content: userText }],
        max_tokens: 2048,
        temperature: 0.7,
        stream: true,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const parts: string[] = [];
    await readSSEStreamWithInactivityTimeout(res, timeoutMs, (chunk) => {
      parts.push(chunk);
    });

    if (parts.length > 0) return parts.join('').trim();
  } catch {
    try {
      const res2 = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.api_key || 'test',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model || 'claude-3-5-sonnet-latest',
          system,
          messages: [{ role: 'user', content: userText }],
          max_tokens: 2048,
          temperature: 0.7,
          stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res2.ok) {
        const data = await res2.json();
        const texts = (data?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text);
        return texts.length > 0 ? texts.join('').trim() : null;
      }
    } catch {}
  }
  return null;
}

async function callGemini(config: ModelConfig, system: string, userText: string): Promise<string | null> {
  let base = (config.endpoint || '').trim().replace(/\/+$/, '');
  const timeoutMs = (config.timeout || 15) * 1000;
  const isSSE = !base.includes('generateContent');
  let url = isSSE
    ? `${base}/v1beta/models/${config.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.api_key || 'test')}`
    : `${base}/v1beta/models/${config.model}:generateContent?key=${encodeURIComponent(config.api_key || 'test')}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if (isSSE) {
      const parts: string[] = [];
      await readSSEStreamWithInactivityTimeout(res, timeoutMs, (chunk) => {
        parts.push(chunk);
      });
      if (parts.length > 0) return parts.join('').trim();
    } else {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return typeof text === 'string' ? text.trim() : null;
    }
  } catch {}
  return null;
}

export async function askModel(config: ModelConfig, system: string, userText: string): Promise<string | null> {
  if (!config.endpoint || !config.endpoint.startsWith('http')) {
    return null;
  }
  const proto = detectProtocol(config.protocol, config.endpoint, config.model);
  try {
    if (proto === 'openai') {
      return await callOpenAI(config, system, userText);
    } else if (proto === 'anthropic') {
      return await callAnthropic(config, system, userText);
    } else if (proto === 'gemini') {
      return await callGemini(config, system, userText);
    }
  } catch (err) {
    console.warn('模型请求失败，将自动降级至离线人格引擎:', err);
  }
  return null;
}
