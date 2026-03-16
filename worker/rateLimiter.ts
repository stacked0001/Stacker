import type { Env } from './index';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 60;

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export async function checkRateLimit(token: string, env: Env): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - WINDOW_SECONDS;
  const key = `rl:${token}`;

  const raw = await env.TOKENS.get(key, { type: 'json' }) as { timestamps: number[] } | null;
  const timestamps: number[] = (raw?.timestamps ?? []).filter((t: number) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = timestamps[0];
    const retryAfter = oldest + WINDOW_SECONDS - now;
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  timestamps.push(now);
  await env.TOKENS.put(key, JSON.stringify({ timestamps }), {
    expirationTtl: WINDOW_SECONDS + 10
  });

  return { allowed: true };
}
