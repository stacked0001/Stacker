import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { scanSecrets, SecretScanResult } from './secretScanner';
import { analyzeComplexity, ComplexityMetrics } from './complexityAnalyzer';

export interface VulnerabilityAdvisory {
  name: string;
  severity: string;
  title: string;
  url: string;
}

export interface VulnerabilityStats {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  total: number;
  advisories: VulnerabilityAdvisory[];
}

export interface AnalyzerStats {
  fileCount: number;
  componentCount: number;
  apiRouteCount: number;
  lineCount: number;
  testFileCount: number;
  configFileCount: number;
  filesByExtension: Record<string, number>;
  vulnerabilities?: VulnerabilityStats;
  secretFindings?: SecretScanResult;
  complexity?: ComplexityMetrics;
}

// Non-global patterns for component detection (no lastIndex state issues)
const COMPONENT_PATTERNS = [
  /export\s+(?:default\s+)?function\s+[A-Z][a-zA-Z]+/gm,
  /export\s+(?:default\s+)?const\s+[A-Z][a-zA-Z]+\s*[=:]/gm,
  /class\s+[A-Z][a-zA-Z]+\s+extends\s+(?:React\.Component|Component|PureComponent)/gm
];

// Fixed route patterns — non-backtracking, no catastrophic ReDoS risk
const ROUTE_PATTERNS = [
  /\.(?:get|post|put|patch|delete|all)\s*\(\s*['"` ]/gi,  // Express/Fastify/Koa
  /\bRoute\s*\(/g,                                          // React Router
  /@(?:Get|Post|Put|Patch|Delete)\s*\(/g                    // NestJS decorators
];

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.pytest_cache', 'target', 'vendor', '.venv',
  'venv', 'env', 'coverage', '.nyc_output', 'out'
]);

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.cs',
  '.rb', '.php', '.swift', '.vue', '.svelte'
]);

const CONFIG_EXTENSIONS = new Set([
  '.json', '.yaml', '.yml', '.toml', '.ini'
]);

const MAX_FILE_SIZE = 512 * 1024; // 512KB
const MAX_DEPTH = 15;

function parseNpmAudit(audit: Record<string, unknown>): VulnerabilityStats {
  const result: VulnerabilityStats = {
    critical: 0, high: 0, moderate: 0, low: 0, total: 0, advisories: []
  };

  // npm audit v7+ format: vulnerabilities object
  if (audit.vulnerabilities && typeof audit.vulnerabilities === 'object') {
    const vulns = audit.vulnerabilities as Record<string, Record<string, unknown>>;
    for (const [name, vuln] of Object.entries(vulns)) {
      const severity = (vuln.severity as string) || 'low';
      if (severity === 'critical') result.critical++;
      else if (severity === 'high') result.high++;
      else if (severity === 'moderate') result.moderate++;
      else result.low++;
      result.total++;

      // Extract advisory info
      const via = Array.isArray(vuln.via) ? vuln.via : [];
      for (const v of via) {
        if (typeof v === 'object' && v !== null) {
          const advisory = v as Record<string, unknown>;
          result.advisories.push({
            name,
            severity,
            title: (advisory.title as string) || name,
            url: (advisory.url as string) || ''
          });
          break; // one advisory per package is enough
        }
      }
    }
    return result;
  }

  // npm audit v6 format: advisories object
  if (audit.advisories && typeof audit.advisories === 'object') {
    const advisories = audit.advisories as Record<string, Record<string, unknown>>;
    for (const [, adv] of Object.entries(advisories)) {
      const severity = (adv.severity as string) || 'low';
      if (severity === 'critical') result.critical++;
      else if (severity === 'high') result.high++;
      else if (severity === 'moderate') result.moderate++;
      else result.low++;
      result.total++;

      result.advisories.push({
        name: (adv.module_name as string) || '',
        severity,
        title: (adv.title as string) || '',
        url: (adv.url as string) || ''
      });
    }
  }

  return result;
}

export async function analyzeRepository(repoPath: string): Promise<AnalyzerStats> {
  const stats: AnalyzerStats = {
    fileCount: 0,
    componentCount: 0,
    apiRouteCount: 0,
    lineCount: 0,
    testFileCount: 0,
    configFileCount: 0,
    filesByExtension: {}
  };

  // Collect file list during walk for complexity analysis
  const scannedFiles: string[] = [];
  walkDirectory(repoPath, stats, 0, scannedFiles);

  // npm audit (Feature 1)
  if (fs.existsSync(path.join(repoPath, 'package.json'))) {
    try {
      const auditOutput = execSync('npm audit --json', {
        cwd: repoPath,
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).toString();
      const audit = JSON.parse(auditOutput) as Record<string, unknown>;
      stats.vulnerabilities = parseNpmAudit(audit);
    } catch (err: unknown) {
      // npm audit exits with non-zero when vulnerabilities found — still parse stdout
      try {
        const e = err as { stdout?: Buffer | string };
        const audit = JSON.parse((e.stdout?.toString()) ?? '{}') as Record<string, unknown>;
        stats.vulnerabilities = parseNpmAudit(audit);
      } catch { /* no package-lock, skip */ }
    }
  }

  // Secret scan (Feature 2)
  stats.secretFindings = scanSecrets(repoPath);

  // Complexity analysis (Feature 3)
  stats.complexity = analyzeComplexity(repoPath, scannedFiles);

  return stats;
}

function walkDirectory(currentPath: string, stats: AnalyzerStats, depth = 0, scannedFiles: string[] = []): void {
  if (depth > MAX_DEPTH) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    // Skip hidden dirs (but not hidden files we care about)
    if (entry.isDirectory() && entry.name.startsWith('.')) continue;
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(fullPath, stats, depth + 1, scannedFiles);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    stats.fileCount++;
    stats.filesByExtension[ext] = (stats.filesByExtension[ext] || 0) + 1;

    const isTest =
      entry.name.includes('.test.') ||
      entry.name.includes('.spec.') ||
      currentPath.includes('__tests__') ||
      currentPath.includes(`${path.sep}test${path.sep}`) ||
      currentPath.includes(`${path.sep}tests${path.sep}`);

    if (isTest) stats.testFileCount++;
    if (CONFIG_EXTENSIONS.has(ext)) stats.configFileCount++;
    if (!CODE_EXTENSIONS.has(ext)) continue;

    scannedFiles.push(fullPath);

    let content: string;
    try {
      const fileStat = fs.statSync(fullPath);
      if (fileStat.size > MAX_FILE_SIZE) {
        if (process.env.STACKER_VERBOSE === 'true') {
          process.stderr.write(`[stacker] Skipping large file (${(fileStat.size / 1024).toFixed(0)}KB): ${fullPath}\n`);
        }
        continue;
      }
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    stats.lineCount += content.split('\n').length;

    // Count React/Vue components — create fresh regex each time to reset lastIndex
    if (['.tsx', '.jsx', '.vue'].includes(ext)) {
      for (const pattern of COMPONENT_PATTERNS) {
        const re = new RegExp(pattern.source, pattern.flags);
        const matches = content.match(re);
        if (matches) stats.componentCount += matches.length;
      }
    }

    // Count API routes — reset lastIndex between files by using string.match (non-sticky)
    for (const pattern of ROUTE_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      const matches = content.match(re);
      if (matches) stats.apiRouteCount += matches.length;
    }
  }
}
