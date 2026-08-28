/**
 * 林离信箱核心数据类型定义 (BSide Letters TypeScript Core)
 */

export interface ModelConfig {
  protocol: 'auto' | 'openai' | 'gemini' | 'anthropic';
  endpoint: string;
  api_key: string;
  model: string;
  timeout: number;
}

export interface AppConfig {
  model: ModelConfig;
  reply: {
    min_reading_ms: number;
    max_letters_per_day: number;
    force_engine?: string;
  };
  memory: {
    path: string;
    admin_password?: string;
  };
}

export interface Episode {
  id: string;
  ts: string;
  date: string;
  topics: string[];
  weather: string;
  mood: string;
  engine: string;
  user_digest: string;
  reply_digest: string;
  farewell: boolean;
  status: 'ACTIVE' | 'DELETED';
  deleted: boolean;
  deleted_at?: string;
}

export interface MemoryData {
  episodes: Episode[];
  total_letters: number;
  first_letter: string | null;
  notables: Record<string, string>;
}

export interface LetterResponse {
  ok: boolean;
  reply: string;
  weather: string;
  mood: string;
  engine: 'model' | 'local';
  model_attempted?: boolean;
  error?: string;
}

export interface EngineStatus {
  ok: boolean;
  protocol: string;
  active_protocol: string;
  endpoint: string;
  model: string;
  timeout: number;
  model_up: boolean;
  mode: string;
  reply: {
    min_reading_ms: number;
    max_letters_per_day: number;
  };
}
