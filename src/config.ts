import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface StackerConfig {
  provider: string;
  analysisModel: string;
  reasoningModel: string;
  cacheEnabled: boolean;
  cacheDir: string;
  outputFormat: 'terminal' | 'json' | 'markdown';
  verbose: boolean;
  skipAI: boolean;
  retries: number;
  timeout: number;
}

// Only these keys are allowed from .env to prevent injection
const ALLOWED_ENV_KEYS = new Set([
  'STACKER_PROVIDER',
  'STACKER_ANALYSIS_MODEL',
  'STACKER_REASONING_MODEL',
  'STACKER_SKIP_AI',
  'STACKER_CACHE',
  'STACKER_CACHE_DIR',
  'STACKER_FORMAT',
  'STACKER_VERBOSE',
  'STACKER_RETRIES',
  'STACKER_TIMEOUT'
]);

// .env search order: CWD → global config dir → home dir
const DOTENV_PATHS = [
  path.join(process.cwd(), '.env'),
  path.join(os.homedir(), '.config', 'stacker', '.env'),
  path.join(os.homedir(), '.stacker.env')
];

const CONFIG_PATHS = [
  path.join(process.cwd(), '.stackerrc'),
  path.join(process.cwd(), 'stacker.config.json'),
  path.join(os.homedir(), '.config', 'stacker', 'config.json'),
  path.join(os.homedir(), '.stackerrc')
];

export function loadConfig(): StackerConfig {
  // Load all .env files in order (first value wins)
  for (const envPath of DOTENV_PATHS) {
    loadDotenv(envPath);
  }

  let fileConfig: Partial<StackerConfig> = {};
  for (const configPath of CONFIG_PATHS) {
    if (fs.existsSync(configPath)) {
      try {
        fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        break;
      } catch {
        // ignore parse errors
      }
    }
  }

  const cacheDir = path.join(os.homedir(), '.cache', 'stacker');

  const retriesRaw = Number(process.env.STACKER_RETRIES ?? fileConfig.retries);
  const timeoutRaw = Number(process.env.STACKER_TIMEOUT ?? fileConfig.timeout);

  const retries = Number.isNaN(retriesRaw) || retriesRaw < 0 ? 2 : Math.min(retriesRaw, 10);
  const timeout = Number.isNaN(timeoutRaw) || timeoutRaw <= 0 ? 30000 : Math.min(timeoutRaw, 300000);

  return {
    provider: process.env.STACKER_PROVIDER || fileConfig.provider || 'groq',
    analysisModel: process.env.STACKER_ANALYSIS_MODEL || fileConfig.analysisModel || 'moonshotai/kimi-k2-instruct',
    reasoningModel: process.env.STACKER_REASONING_MODEL || fileConfig.reasoningModel || 'openai/gpt-oss-120b',
    cacheEnabled: process.env.STACKER_CACHE !== 'false' && fileConfig.cacheEnabled !== false,
    cacheDir: process.env.STACKER_CACHE_DIR || fileConfig.cacheDir || cacheDir,
    outputFormat: (process.env.STACKER_FORMAT as StackerConfig['outputFormat']) || fileConfig.outputFormat || 'terminal',
    verbose: process.env.STACKER_VERBOSE === 'true' || fileConfig.verbose || false,
    skipAI: process.env.STACKER_SKIP_AI === 'true' || fileConfig.skipAI || false,
    retries,
    timeout
  };
}

function loadDotenv(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');

      // Security: only allow whitelisted keys, block prototype pollution
      if (!key || !ALLOWED_ENV_KEYS.has(key)) continue;
      if (/^(__proto__|constructor|prototype)$/i.test(key)) continue;

      // First value wins — don't overwrite already-set vars
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // non-fatal
  }
}

export function validateConfig(config: StackerConfig): string[] {
  const errors: string[] = [];

  if (!['groq'].includes(config.provider)) {
    errors.push(`Unknown provider: ${config.provider}. Supported: groq`);
  }

  return errors;
}
