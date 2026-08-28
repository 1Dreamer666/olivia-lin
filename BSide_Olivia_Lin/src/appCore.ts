/**
 * 纯前端统一核心服务 (AppCore)
 * 完整替代所有 /api/* 服务端路由，实现零后端独立运行
 */

import { AppConfig, EngineStatus, LetterResponse } from './types';
import { loadAppConfig, saveAppConfig, resetAppConfig } from './config';
import { buildSystemPrompt } from './persona';
import { respond, metaFor } from './localEngine';
import {
  recordExchange,
  getSummary,
  softDeleteEpisode,
  softDeleteAll,
  restoreEpisodes,
  deletedEpisodes,
  loadMemory,
  verifyAdminPassword,
  renderMemoryContext,
  getMemoryEcho,
} from './memoryBank';
import { askModel, detectProtocol } from './modelClient';

export class AppCore {
  public static getConfig(): AppConfig {
    return loadAppConfig();
  }

  public static saveConfig(cfg: Partial<AppConfig>): AppConfig {
    return saveAppConfig(cfg);
  }

  public static resetConfig(): AppConfig {
    return resetAppConfig();
  }

  public static getStatus(): EngineStatus {
    const cfg = loadAppConfig();
    const activeProto = detectProtocol(cfg.model.protocol, cfg.model.endpoint, cfg.model.model);
    const hasEndpoint = Boolean(cfg.model.endpoint && cfg.model.endpoint.startsWith('http'));
    return {
      ok: true,
      protocol: cfg.model.protocol,
      active_protocol: activeProto,
      endpoint: cfg.model.endpoint,
      model: cfg.model.model,
      timeout: cfg.model.timeout,
      model_up: hasEndpoint,
      mode: hasEndpoint ? 'model' : 'local_engine',
      reply: {
        min_reading_ms: cfg.reply.min_reading_ms,
        max_letters_per_day: cfg.reply.max_letters_per_day,
      },
    };
  }

  public static getMemory() {
    return {
      ok: true,
      ...getSummary(),
    };
  }

  public static postMemory(action: string, payload: any = {}) {
    const { id, ids, password } = payload;
    if (action === 'delete' || action === 'soft_delete') {
      const ok = softDeleteEpisode(id);
      return { ok, message: ok ? '已移入后悔处' : '未找到条目' };
    }
    if (action === 'clear' || action === 'soft_delete_all') {
      const count = softDeleteAll();
      return { ok: true, deleted_count: count };
    }
    if (action === 'regret' || action === 'verify_pwd' || action === 'list_deleted') {
      if (!verifyAdminPassword(password)) {
        return { ok: false, error: '密码错误' };
      }
      const data = loadMemory();
      return { ok: true, deleted: deletedEpisodes(data), items: deletedEpisodes(data) };
    }
    if (action === 'restore') {
      const count = restoreEpisodes(ids || id);
      return { ok: true, restored: count, restored_count: count };
    }
    return { ok: false, error: '未知操作' };
  }

  public static async sendLetter(text: string, force?: string): Promise<LetterResponse> {
    const cfg = loadAppConfig();
    const cleanText = (text || '').trim();
    if (!cleanText) {
      return { ok: false, reply: '', weather: '晴', mood: '平静', engine: 'local', error: '信件内容为空' };
    }

    const memoryContext = renderMemoryContext();
    const timeHint = new Date().toLocaleString('zh-CN', { hour12: false });
    const memoryEcho = getMemoryEcho(cleanText);

    let replyText = '';
    let usedEngine: 'model' | 'local' = 'local';
    let weather = '晴';
    let mood = '平静';

    const hasEndpoint = Boolean(cfg.model.endpoint && cfg.model.endpoint.startsWith('http'));
    const tryModel = force === 'model' || (force !== 'local' && hasEndpoint);

    if (tryModel) {
      try {
        const sysPrompt = buildSystemPrompt({
          includeSamples: true,
          timeHint,
          memoryContext,
        });
        const modelOut = await askModel(cfg.model, sysPrompt, cleanText);
        if (modelOut) {
          replyText = modelOut.trim();
          usedEngine = 'model';
          const meta = metaFor(cleanText);
          weather = meta.weather;
          mood = meta.mood;
        }
      } catch (err) {
        console.warn('模型生成失败，降级至离线引擎:', err);
      }
    }

    if (!replyText) {
      const localOut = respond(cleanText, new Date(), memoryEcho);
      replyText = localOut.reply;
      weather = localOut.weather;
      mood = localOut.mood;
      usedEngine = 'local';
    }

    // 记录到分级记忆库
    try {
      recordExchange(cleanText, replyText, weather, mood, usedEngine);
    } catch (e) {
      console.warn('记忆记录失败:', e);
    }

    return {
      ok: true,
      reply: replyText,
      weather,
      mood,
      engine: usedEngine,
      model_attempted: tryModel,
    };
  }
}
