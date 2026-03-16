/**
 * NIST SP 800-53 Rev 5 Security Controls
 *
 * Applicable controls implemented for this CLI tool:
 *
 *  AC-3   Access Enforcement           — API key validation, no credential exposure
 *  AU-2   Event Logging                — Structured audit log, no PII
 *  AU-3   Content of Audit Records     — Timestamp, action, model, outcome, source IP omitted (CLI)
 *  AU-9   Protection of Audit Info     — Audit log written mode 0o600
 *  CM-6   Configuration Settings       — Secure defaults, validated config values
 *  CM-7   Least Functionality          — Only HTTPS to Groq, no outbound except explicit targets
 *  IA-5   Authenticator Management     — API key masking in all output and logs
 *  SC-8   Transmission Confidentiality — HTTPS-only enforcement for all API calls
 *  SC-28  Protection of Info at Rest   — No secrets in cache files, 0o600 on sensitive files
 *  SI-10  Information Input Validation — URL/path/model-name validation
 *  SI-12  Information Management       — Cache TTL enforcement, audit log rotation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ── AU-2 / AU-3 / AU-9: Audit Logging ────────────────────────────

export type AuditAction =
  | 'analysis_start'
  | 'analysis_complete'
  | 'analysis_failed'
  | 'rate_limit_hit'
  | 'repo_cloned'
  | 'repo_resolved'
  | 'report_exported'
  | 'cache_hit'
  | 'cache_miss'
  | 'config_loaded'
  | 'api_call'
  | 'api_error';

export interface AuditRecord {
  timestamp: string;       // ISO-8601
  sessionId: string;       // random per-process ID, no PII
  action: AuditAction;
  model?: string;
  outcome: 'success' | 'failure' | 'warning';
  durationMs?: number;
  detail?: string;         // never contains secrets
}

const SESSION_ID = crypto.randomBytes(8).toString('hex');
const MAX_AUDIT_LOG_BYTES = 5 * 1024 * 1024; // 5 MB rotation threshold

function getAuditLogPath(): string {
  const dir = path.join(os.homedir(), '.cache', 'stacker');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return path.join(dir, 'audit.log');
}

export function auditLog(record: Omit<AuditRecord, 'timestamp' | 'sessionId'>): void {
  const entry: AuditRecord = {
    timestamp: new Date().toISOString(),
    sessionId: SESSION_ID,
    ...record
  };

  const logPath = getAuditLogPath();

  try {
    // SI-12: Rotate log if it exceeds max size
    try {
      const stat = fs.statSync(logPath);
      if (stat.size > MAX_AUDIT_LOG_BYTES) {
        fs.renameSync(logPath, `${logPath}.1`);
      }
    } catch { /* file doesn't exist yet */ }

    // AU-9: Write with restricted permissions (owner read/write only)
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', { encoding: 'utf-8', mode: 0o600 });
  } catch {
    // Non-fatal — audit failure must not interrupt primary function
  }
}

// ── IA-5: Authenticator Management — API key masking ─────────────

/**
 * Mask an API key for safe display in logs or error messages.
 * Shows only the first 7 and last 4 characters.
 * e.g. "gsk_abc...xyz1"
 */
export function maskSecret(secret: string): string {
  if (!secret || secret.length < 12) return '[REDACTED]';
  return `${secret.slice(0, 7)}...${secret.slice(-4)}`;
}

/**
 * Scrub any known secrets from a string before logging or displaying it.
 * Matches common API key patterns (gsk_, sk-, Bearer ...).
 */
export function scrubSecrets(text: string): string {
  return text
    .replace(/gsk_[A-Za-z0-9]{20,}/g, '[GROQ_KEY_REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]{20,}/g, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9]{20,}/g, '[API_KEY_REDACTED]');
}

// ── SC-8: Transmission Confidentiality — HTTPS enforcement ───────

const ALLOWED_API_HOSTS = new Set([
  'api.groq.com'
]);

/**
 * SC-8 / CM-7: Validate that the target URL uses HTTPS and is an allowed host.
 * Throws if the URL is not HTTPS or points to an unexpected host.
 */
export function enforceHttps(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`[SC-8] Invalid URL: ${url}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`[SC-8] Insecure protocol rejected: ${parsed.protocol}. Only HTTPS is allowed.`);
  }

  if (!ALLOWED_API_HOSTS.has(parsed.hostname)) {
    throw new Error(`[SC-8] Unexpected API host: ${parsed.hostname}. Allowed: ${[...ALLOWED_API_HOSTS].join(', ')}`);
  }
}

// ── SI-10: Information Input Validation ──────────────────────────

const SAFE_GIT_URL = /^https:\/\/[a-zA-Z0-9._\-\/]+(?:\.git)?$|^git@[a-zA-Z0-9._\-]+:[a-zA-Z0-9._\-\/]+(?:\.git)?$/;
const SAFE_MODEL_ID = /^[a-zA-Z0-9._\-\/]{3,80}$/;

// Shell metacharacters that must never appear in a local path target
const SHELL_METACHAR_RE = /[;&|`$<>(){}'"\\\n\r]/;

/**
 * SI-10: Validate a repository URL or local path.
 * - Remote URLs must be HTTPS or SSH git format.
 * - Local paths must not contain traversal sequences or shell metacharacters.
 */
export function validateRepoTarget(target: string): void {
  if (!target || target.trim() === '') {
    throw new Error('[SI-10] Repository target cannot be empty.');
  }

  if (target.includes('\0')) {
    throw new Error('[SI-10] Repository target contains null bytes.');
  }

  if (target.startsWith('http://')) {
    throw new Error('[SI-10] HTTP repository URLs are not allowed. Use HTTPS.');
  }

  if (target.startsWith('https://') || target.startsWith('git@') || target.startsWith('git://')) {
    if (!SAFE_GIT_URL.test(target)) {
      throw new Error(`[SI-10] Repository URL contains invalid characters: ${scrubSecrets(target)}`);
    }
    return;
  }

  // Local path — block shell injection and traversal attacks
  if (SHELL_METACHAR_RE.test(target)) {
    throw new Error('[SI-10] Repository path contains disallowed characters.');
  }

  // Block path traversal sequences (e.g. ../../etc/passwd)
  const normalized = target.replace(/\\/g, '/');
  if (normalized.split('/').some(segment => segment === '..')) {
    throw new Error('[SI-10] Repository path contains disallowed characters.');
  }

  const resolved = path.resolve(target);

  // Block attempts to escape to sensitive system directories
  const BLOCKED_PREFIXES = ['/etc', '/usr', '/bin', '/sbin', '/boot', '/proc', '/sys',
    'C:\\Windows', 'C:\\System32', 'C:\\Program Files'];
  if (BLOCKED_PREFIXES.some(p => resolved.startsWith(p))) {
    throw new Error('[SI-10] Repository path points to a restricted system directory.');
  }
}

/**
 * SI-10: Validate a Groq model ID.
 */
export function validateModelId(modelId: string): void {
  if (!SAFE_MODEL_ID.test(modelId)) {
    throw new Error(`[SI-10] Invalid model ID format: "${modelId}". Model IDs must be 3-80 alphanumeric characters.`);
  }
}

/**
 * SI-10: Validate an output file path to prevent directory traversal.
 * Returns the resolved absolute path.
 */
export function validateOutputPath(outputPath: string): string {
  if (!outputPath || outputPath.trim() === '') {
    throw new Error('[SI-10] Output path cannot be empty.');
  }
  if (outputPath.includes('\0')) {
    throw new Error('[SI-10] Output path contains null bytes.');
  }

  const resolved = path.resolve(outputPath);
  const ext = path.extname(resolved).toLowerCase();

  if (ext !== '' && !['.json', '.md', '.txt'].includes(ext)) {
    throw new Error(`[SI-10] Output file extension "${ext}" is not allowed. Use .json or .md`);
  }

  return resolved;
}

// ── AC-3: Access Enforcement ──────────────────────────────────────

/**
 * AC-3: Verify the API key is present and looks structurally valid
 * before making any requests.
 * Does NOT make any network call.
 */
export function validateApiKey(apiKey: string | undefined): void {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('AI service is not configured.');
  }

  if (!apiKey.startsWith('gsk_') || apiKey.length < 40) {
    throw new Error('AI service credential is invalid.');
  }
}

// ── SC-28: Protection of Information at Rest ─────────────────────

/**
 * SC-28: Verify that the cache directory has restrictive permissions.
 * Emits a warning if readable by group/other.
 */
export function checkCachePermissions(cacheDir: string): void {
  try {
    const stat = fs.statSync(cacheDir);
    const mode = stat.mode & 0o777;
    if (mode & 0o077) {
      // Group or other read/write/execute bits set — tighten them
      try {
        fs.chmodSync(cacheDir, 0o700);
      } catch {
        // Non-fatal — warn instead
        process.stderr.write(
          `[SC-28] Warning: cache directory ${cacheDir} has permissive permissions (${(mode).toString(8)}). ` +
          `Consider running: chmod 700 ${cacheDir}\n`
        );
      }
    }
  } catch {
    // Directory doesn't exist yet — will be created by Cache constructor
  }
}

// ── CM-6: Configuration Settings ─────────────────────────────────

/**
 * CM-6: Validate all configuration values are within acceptable bounds.
 * Returns a list of validation errors (empty = all good).
 */
export function validateSecureConfig(config: {
  provider: string;
  analysisModel: string;
  reasoningModel: string;
  retries: number;
  timeout: number;
  cacheDir: string;
}): string[] {
  const errors: string[] = [];
  const allowed_providers = ['groq'];

  if (!allowed_providers.includes(config.provider)) {
    errors.push(`[CM-6] Unknown provider "${config.provider}". Allowed: ${allowed_providers.join(', ')}`);
  }

  try {
    validateModelId(config.analysisModel);
  } catch (e) {
    errors.push((e as Error).message);
  }

  try {
    validateModelId(config.reasoningModel);
  } catch (e) {
    errors.push((e as Error).message);
  }

  if (config.retries < 0 || config.retries > 10) {
    errors.push(`[CM-6] retries must be 0–10, got ${config.retries}`);
  }

  if (config.timeout < 1000 || config.timeout > 300000) {
    errors.push(`[CM-6] timeout must be 1,000–300,000 ms, got ${config.timeout}`);
  }

  // SC-28: Check cache dir is not a system path
  const dangerous = ['/etc', '/usr', '/bin', '/sbin', '/boot', 'C:\\Windows', 'C:\\System32'];
  if (dangerous.some(d => config.cacheDir.startsWith(d))) {
    errors.push(`[CM-6/SC-28] Cache directory "${config.cacheDir}" points to a system path.`);
  }

  return errors;
}
