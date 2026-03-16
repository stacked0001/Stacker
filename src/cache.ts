import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const CACHE_VERSION = '1';
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry<T> {
  version: string;
  createdAt: number;
  ttlMs: number;
  data: T;
}

export class Cache {
  private cacheDir: string;
  private enabled: boolean;

  constructor(cacheDir: string, enabled = true) {
    this.cacheDir = cacheDir;
    this.enabled = enabled;

    if (enabled) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
      } catch {
        this.enabled = false;
      }
    }
  }

  get<T>(key: string): T | null {
    if (!this.enabled) return null;

    const filePath = this.keyToPath(key);
    try {
      if (!fs.existsSync(filePath)) return null;

      const raw = fs.readFileSync(filePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(raw);

      if (entry.version !== CACHE_VERSION) {
        this.delete(key);
        return null;
      }

      if (Date.now() - entry.createdAt > entry.ttlMs) {
        this.delete(key);
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  }

  set<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
    if (!this.enabled) return;

    const filePath = this.keyToPath(key);
    const entry: CacheEntry<T> = {
      version: CACHE_VERSION,
      createdAt: Date.now(),
      ttlMs,
      data
    };

    try {
      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    } catch {
      // non-fatal
    }
  }

  delete(key: string): void {
    const filePath = this.keyToPath(key);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // non-fatal
    }
  }

  clear(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
    } catch {
      // non-fatal
    }
  }

  private keyToPath(key: string): string {
    const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
    return path.join(this.cacheDir, `${hash}.json`);
  }

  static buildKey(...parts: string[]): string {
    return parts.join(':');
  }
}
