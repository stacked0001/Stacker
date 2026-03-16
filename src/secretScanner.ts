import * as fs from 'fs';
import * as path from 'path';

export interface SecretFinding {
  file: string;
  line: number;
  type: string;
  severity: 'critical' | 'high' | 'medium';
  match: string; // redacted, e.g. "sk-...REDACTED"
}

export interface SecretScanResult {
  findings: SecretFinding[];
  filesScanned: number;
}

const SECRET_PATTERNS: Array<{ type: string; regex: RegExp; severity: 'critical' | 'high' | 'medium' }> = [
  { type: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/, severity: 'critical' },
  { type: 'AWS Secret Key', regex: /aws_secret_access_key\s*=\s*['"]\S{40}['"]/i, severity: 'critical' },
  { type: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{20,}/, severity: 'critical' },
  { type: 'Anthropic API Key', regex: /sk-ant-[a-zA-Z0-9\-]{20,}/, severity: 'critical' },
  { type: 'GitHub Token', regex: /ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}/, severity: 'critical' },
  { type: 'Stripe Secret Key', regex: /sk_live_[a-zA-Z0-9]{24,}/, severity: 'critical' },
  { type: 'Private Key', regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, severity: 'critical' },
  { type: 'Hardcoded Password', regex: /password\s*[=:]\s*['"][^'"]{8,}['"]/i, severity: 'high' },
  { type: 'Hardcoded Secret', regex: /secret\s*[=:]\s*['"][^'"]{8,}['"]/i, severity: 'high' },
  { type: 'JWT Token', regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, severity: 'high' },
  { type: 'eval() usage', regex: /\beval\s*\(/, severity: 'medium' },
  { type: 'dangerouslySetInnerHTML', regex: /dangerouslySetInnerHTML/, severity: 'medium' },
  { type: 'document.write', regex: /document\.write\s*\(/, severity: 'medium' },
  { type: 'innerHTML assignment', regex: /\.innerHTML\s*=/, severity: 'medium' },
  { type: 'SQL string concat', regex: /["'`]\s*SELECT\s+.+\s+WHERE\s+.+["'`]\s*\+/i, severity: 'high' },
  { type: 'Shell command injection risk', regex: /exec\s*\(\s*[`"'].*\$\{/, severity: 'high' },
];

const SCAN_EXTENSIONS = new Set([
  '.ts', '.js', '.tsx', '.jsx', '.py', '.go',
  '.env', '.yml', '.yaml', '.json'
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.pytest_cache', 'target', 'vendor', '.venv',
  'venv', 'env', 'coverage', '.nyc_output', 'out'
]);

const MAX_FILE_SIZE = 500 * 1024; // 500KB

function redactMatch(match: string): string {
  if (match.length <= 4) return '...REDACTED';
  return match.slice(0, 4) + '...REDACTED';
}

function isBinaryFile(buffer: Buffer): boolean {
  // Check first 8000 bytes for null bytes — heuristic for binary
  const checkLength = Math.min(buffer.length, 8000);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function scanFile(filePath: string, repoPath: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return findings;
  }

  if (stat.size > MAX_FILE_SIZE) return findings;

  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch {
    return findings;
  }

  if (isBinaryFile(buffer)) return findings;

  const content = buffer.toString('utf-8');
  const lines = content.split('\n');
  const relPath = path.relative(repoPath, filePath).replace(/\\/g, '/');

  for (const [lineIdx, line] of lines.entries()) {
    // Skip pure comment lines (JS/TS/Python style)
    const trimmed = line.trim();
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*')
    ) {
      continue;
    }

    for (const { type, regex, severity } of SECRET_PATTERNS) {
      const re = new RegExp(regex.source, regex.flags);
      const m = re.exec(line);
      if (m) {
        findings.push({
          file: relPath,
          line: lineIdx + 1,
          type,
          severity,
          match: redactMatch(m[0])
        });
      }
    }
  }

  return findings;
}

function walkDirectory(dirPath: string, repoPath: string, result: SecretScanResult, depth = 0): void {
  if (depth > 15) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      walkDirectory(path.join(dirPath, entry.name), repoPath, result, depth + 1);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      // Also scan .env files (no extension matching needed — match by name)
      const isEnvFile = entry.name === '.env' || entry.name.startsWith('.env.');
      if (!SCAN_EXTENSIONS.has(ext) && !isEnvFile) continue;

      result.filesScanned++;
      const findings = scanFile(path.join(dirPath, entry.name), repoPath);
      result.findings.push(...findings);
    }
  }
}

export function scanSecrets(repoPath: string): SecretScanResult {
  const result: SecretScanResult = {
    findings: [],
    filesScanned: 0
  };

  walkDirectory(repoPath, repoPath, result);
  return result;
}
