/**
 * Client-side rate limiter for Groq free-tier API limits.
 *
 * Tracks requests per-model in a shared file under ~/.cache/stacker/
 * so limits are respected across concurrent invocations on the same machine.
 *
 * Groq free-tier limits (as of 2025):
 *   RPM = requests per minute (all models: 30)
 *   RPD = requests per day
 *
 * Sources:
 *   https://console.groq.com/docs/rate-limits
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Model limit registry ──────────────────────────────────────────

interface ModelLimits {
  rpm: number;   // requests per minute
  rpd: number;   // requests per day
  label: string; // human-friendly name
}

const MODEL_LIMITS: Record<string, ModelLimits> = {
  // ── Primary analysis model ────────────────────────────────────
  'qwen/qwen3-32b':                       { rpm: 30, rpd: 1000,  label: 'Qwen3 32B' },

  // ── Reasoning / fallback ──────────────────────────────────────
  'llama-3.3-70b-versatile':              { rpm: 30, rpd: 1000,  label: 'LLaMA 3.3 70B Versatile' },
  'llama-3.1-8b-instant':                 { rpm: 30, rpd: 14400, label: 'LLaMA 3.1 8B Instant' },

  // ── Other available models ────────────────────────────────────
  'meta-llama/llama-4-scout-17b-16e-instruct': { rpm: 30, rpd: 500,   label: 'LLaMA 4 Scout 17B' },
  'moonshotai/kimi-k2-instruct':          { rpm: 30, rpd: 1000,  label: 'Kimi K2' },
  'openai/gpt-oss-120b':                  { rpm: 30, rpd: 500,   label: 'GPT OSS 120B' },
  'openai/gpt-oss-20b':                   { rpm: 30, rpd: 1000,  label: 'GPT OSS 20B' },
};

// Conservative fallback for any unlisted model
const DEFAULT_LIMITS: ModelLimits = { rpm: 30, rpd: 500, label: 'Unknown model' };

// ── Persistent counter storage ────────────────────────────────────

interface CounterBucket {
  minute: { windowStart: number; count: number };
  day:    { windowStart: number; count: number };
}

type CounterStore = Record<string, CounterBucket>;

const COUNTER_FILE_VERSION = '1';

interface CounterFile {
  version: string;
  counters: CounterStore;
}

function getCounterPath(): string {
  const dir = path.join(os.homedir(), '.cache', 'stacker');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return path.join(dir, 'rate-counters.json');
}

function loadCounters(): CounterStore {
  const filePath = getCounterPath();
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed: CounterFile = JSON.parse(raw);
    if (parsed.version !== COUNTER_FILE_VERSION) return {};
    return parsed.counters || {};
  } catch {
    return {};
  }
}

function saveCounters(counters: CounterStore): void {
  const filePath = getCounterPath();
  try {
    const data: CounterFile = { version: COUNTER_FILE_VERSION, counters };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  } catch {
    // non-fatal — best-effort
  }
}

function getOrCreateBucket(counters: CounterStore, modelId: string, now: number): CounterBucket {
  const minuteStart = now - (now % 60000);
  const dayStart    = now - (now % 86400000);

  const existing = counters[modelId];

  const minute = existing?.minute.windowStart === minuteStart
    ? existing.minute
    : { windowStart: minuteStart, count: 0 };

  const day = existing?.day.windowStart === dayStart
    ? existing.day
    : { windowStart: dayStart, count: 0 };

  return { minute, day };
}

// ── Public API ────────────────────────────────────────────────────

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
    public readonly limitType: 'rpm' | 'rpd'
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function getLimits(modelId: string): ModelLimits {
  return MODEL_LIMITS[modelId] ?? DEFAULT_LIMITS;
}

/**
 * Check if a request to `modelId` is allowed.
 * Records the request if allowed.
 * Throws `RateLimitError` with a user-friendly message if not.
 */
export function checkAndRecord(modelId: string): void {
  const now     = Date.now();
  const limits  = getLimits(modelId);
  const counters = loadCounters();
  const bucket  = getOrCreateBucket(counters, modelId, now);

  // ── RPM check ────────────────────────────────────────────────
  if (bucket.minute.count >= limits.rpm) {
    const msUntilNextMinute = (bucket.minute.windowStart + 60000) - now;
    const secsLeft = Math.ceil(msUntilNextMinute / 1000);
    throw new RateLimitError(
      [
        `⏱  Rate limit reached for ${limits.label}.`,
        ``,
        `   The free Groq tier allows ${limits.rpm} requests per minute.`,
        `   Stacker is a shared service and the current minute's quota is full.`,
        ``,
        `   Please wait ${secsLeft} second${secsLeft !== 1 ? 's' : ''} and try again.`,
        ``,
        `   To avoid this, set STACKER_ANALYSIS_MODEL=llama-3.1-8b-instant`,
        `   (14,400 requests/day, higher throughput).`
      ].join('\n'),
      msUntilNextMinute,
      'rpm'
    );
  }

  // ── RPD check ────────────────────────────────────────────────
  if (bucket.day.count >= limits.rpd) {
    const msUntilNextDay = (bucket.day.windowStart + 86400000) - now;
    const hoursLeft = Math.ceil(msUntilNextDay / 3600000);
    throw new RateLimitError(
      [
        `📅  Daily request limit reached for ${limits.label}.`,
        ``,
        `   The free Groq tier allows ${limits.rpd.toLocaleString()} requests/day for this model.`,
        `   Today's quota has been exhausted.`,
        ``,
        `   The limit resets in approximately ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}.`,
        ``,
        `   Alternatives:`,
        `   • Run with --skip-ai for rule-based analysis (no API calls)`,
        `   • Switch to a higher-limit model:`,
        `       STACKER_ANALYSIS_MODEL=llama-3.1-8b-instant  (14,400 req/day)`,
        `   • Upgrade your Groq plan at https://console.groq.com`
      ].join('\n'),
      msUntilNextDay,
      'rpd'
    );
  }

  // ── Record the request ────────────────────────────────────────
  bucket.minute.count++;
  bucket.day.count++;
  counters[modelId] = bucket;
  saveCounters(counters);
}

/**
 * Handle a 429 response from the Groq API (server-side rate limit).
 * Parses the Retry-After header if present and throws RateLimitError.
 */
export function handleGroq429(modelId: string, retryAfterHeader?: string): never {
  const limits = getLimits(modelId);
  const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 60000;
  const secsLeft = Math.ceil(retryAfterMs / 1000);

  throw new RateLimitError(
    [
      `🚦  Groq API rate limit exceeded for ${limits.label}.`,
      ``,
      `   The service is temporarily unavailable because the free-tier`,
      `   request quota (${limits.rpm} req/min or ${limits.rpd.toLocaleString()} req/day) has been reached`,
      `   across all users of this Stacker installation.`,
      ``,
      `   Please try again in ${secsLeft} second${secsLeft !== 1 ? 's' : ''}.`,
      ``,
      `   In the meantime, you can run:`,
      `     stacker analyze . --skip-ai   (instant, no API calls)`,
    ].join('\n'),
    retryAfterMs,
    'rpm'
  );
}

/**
 * Return a summary of current usage for all models.
 */
export function getUsageSummary(): Array<{ model: string; label: string; minuteUsed: number; minuteLimit: number; dayUsed: number; dayLimit: number }> {
  const now = Date.now();
  const counters = loadCounters();
  const results = [];

  for (const [modelId, limits] of Object.entries(MODEL_LIMITS)) {
    const bucket = getOrCreateBucket(counters, modelId, now);
    results.push({
      model: modelId,
      label: limits.label,
      minuteUsed: bucket.minute.count,
      minuteLimit: limits.rpm,
      dayUsed: bucket.day.count,
      dayLimit: limits.rpd
    });
  }

  return results;
}
