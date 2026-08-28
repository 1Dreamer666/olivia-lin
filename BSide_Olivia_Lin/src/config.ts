/**
 * 配置存储管理器 (Config Store)
 */

import { AppConfig } from './types';

const LS_CONFIG_KEY = 'olivia_config_v2';

export const DEFAULT_CONFIG: AppConfig = {
  model: {
    protocol: 'auto',
    endpoint: '',
    api_key: '',
    model: 'gemini-2.5-flash',
    timeout: 15,
  },
  reply: {
    min_reading_ms: 3200,
    max_letters_per_day: 3,
  },
  memory: {
    path: 'LocalStorage',
    admin_password: '123456',
  },
};

export function loadAppConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        model: { ...DEFAULT_CONFIG.model, ...(parsed.model || {}) },
        reply: { ...DEFAULT_CONFIG.reply, ...(parsed.reply || {}) },
        memory: { ...DEFAULT_CONFIG.memory, ...(parsed.memory || {}) },
      };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function saveAppConfig(cfg: Partial<AppConfig>): AppConfig {
  const current = loadAppConfig();
  const merged: AppConfig = {
    model: { ...current.model, ...(cfg.model || {}) },
    reply: { ...current.reply, ...(cfg.reply || {}) },
    memory: { ...current.memory, ...(cfg.memory || {}) },
  };
  try {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(merged));
  } catch {}
  return merged;
}

export function resetAppConfig(): AppConfig {
  localStorage.removeItem(LS_CONFIG_KEY);
  return { ...DEFAULT_CONFIG };
}
