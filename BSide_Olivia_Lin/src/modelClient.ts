/**
 * 浏览器端多协议兼容模型客户端 (Browser Model Client)
 * 纯前端 Fetch 直连 OpenAI 兼容 / Gemini / Anthropic / Auto 端点
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

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.api_key || 'test'}`,
    },
    body: JSON.stringify({
      model: config.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userText },
      ],
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(config.timeout * 1000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === 'string' ? text.trim() : null;
}

async function callAnthropic(config: ModelConfig, system: string, userText: string): Promise<string | null> {
  let base = (config.endpoint || '').trim().replace(/\/+$/, '');
  let url = base.endsWith('/messages') ? base : (base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`);

  const res = await fetch(url, {
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
    }),
    signal: AbortSignal.timeout(config.timeout * 1000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const texts = (data?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text);
  return texts.length > 0 ? texts.join('').trim() : null;
}

async function callGemini(config: ModelConfig, system: string, userText: string): Promise<string | null> {
  let base = (config.endpoint || '').trim().replace(/\/+$/, '');
  let url = base.includes('generateContent')
    ? base
    : `${base}/v1beta/models/${config.model}:generateContent?key=${encodeURIComponent(config.api_key || 'test')}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.7 },
    }),
    signal: AbortSignal.timeout(config.timeout * 1000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === 'string' ? text.trim() : null;
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
