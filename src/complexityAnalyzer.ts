import * as fs from 'fs';
import * as path from 'path';

// Decision points that contribute to cyclomatic complexity
const DECISION_POINT_PATTERN = /\bif\b|\belse\s+if\b|\bfor\b|\bwhile\b|\bdo\b|\bswitch\b|\bcase\b|\bcatch\b|&&|\|\||\?\?|\s\?\s/g;

// Function approximation: count function keywords, arrow functions, async keywords
const FUNCTION_PATTERN = /\bfunction\b|=>|\basync\b/g;

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.cs',
  '.rb', '.php', '.swift', '.vue', '.svelte'
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.pytest_cache', 'target', 'vendor', '.venv',
  'venv', 'env', 'coverage', '.nyc_output', 'out'
]);

const MAX_FILE_SIZE = 512 * 1024;

interface FileComplexity {
  file: string;
  complexity: number;
  functions: number;
  lines: number;
}

function analyzeFile(filePath: string, repoPath: string): FileComplexity | null {
  let content: string;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) return null;
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const decisionMatches = content.match(DECISION_POINT_PATTERN);
  const functionMatches = content.match(FUNCTION_PATTERN);

  const decisionCount = decisionMatches ? decisionMatches.length : 0;
  const functionCount = functionMatches ? functionMatches.length : 0;
  const complexity = 1 + decisionCount;
  const lines = content.split('\n').length;

  return {
    file: path.relative(repoPath, filePath).replace(/\\/g, '/'),
    complexity,
    functions: functionCount,
    lines
  };
}

function collectFiles(dirPath: string, fileList: string[], depth = 0): void {
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
      collectFiles(path.join(dirPath, entry.name), fileList, depth + 1);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_EXTENSIONS.has(ext)) {
        fileList.push(path.join(dirPath, entry.name));
      }
    }
  }
}

const isTestFile = (filePath: string): boolean =>
  /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(filePath) ||
  /\/__tests__\//.test(filePath) ||
  /\/test\//.test(filePath) ||
  /\/tests\//.test(filePath);

export interface ComplexityMetrics {
  averageComplexity: number;
  maxComplexity: number;
  highComplexityFiles: Array<{ file: string; complexity: number; functions: number }>;
  totalFunctions: number;
  linesPerFunction: number;
  duplicationRisk: 'low' | 'medium' | 'high';
  testFilesExcluded?: number;
}

export function analyzeComplexity(repoPath: string, fileList: string[]): ComplexityMetrics {
  // If an explicit file list is provided and non-empty, use it; otherwise walk the repo
  let filePaths = fileList.length > 0 ? fileList : [];
  if (filePaths.length === 0) {
    collectFiles(repoPath, filePaths);
  }

  const analyzed: FileComplexity[] = [];
  const testAnalyzed: FileComplexity[] = [];

  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase();
    if (!CODE_EXTENSIONS.has(ext)) continue;

    const result = analyzeFile(filePath, repoPath);
    if (!result) continue;

    if (isTestFile(filePath) || isTestFile(result.file)) {
      testAnalyzed.push(result);
    } else {
      analyzed.push(result);
    }
  }

  if (analyzed.length === 0) {
    return {
      averageComplexity: 0,
      maxComplexity: 0,
      highComplexityFiles: [],
      totalFunctions: 0,
      linesPerFunction: 0,
      duplicationRisk: 'low',
      testFilesExcluded: testAnalyzed.length
    };
  }

  const totalComplexity = analyzed.reduce((sum, f) => sum + f.complexity, 0);
  const averageComplexity = totalComplexity / analyzed.length;
  const maxComplexity = Math.max(...analyzed.map(f => f.complexity));
  const totalFunctions = analyzed.reduce((sum, f) => sum + f.functions, 0);
  const totalLines = analyzed.reduce((sum, f) => sum + f.lines, 0);
  const linesPerFunction = totalFunctions > 0 ? Math.round(totalLines / totalFunctions) : 0;

  // High complexity files: complexity > 15 (test files excluded)
  const highComplexityFiles = analyzed
    .filter(f => f.complexity > 15)
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 10)
    .map(f => ({ file: f.file, complexity: f.complexity, functions: f.functions }));

  // Duplication risk: check if >30% of files have similar line counts and sizes
  // Group files by size buckets (rounded to nearest 50 lines)
  const buckets: Record<number, number> = {};
  for (const f of analyzed) {
    const bucket = Math.round(f.lines / 50) * 50;
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }
  const maxBucketCount = Math.max(...Object.values(buckets));
  const duplicationRatio = maxBucketCount / analyzed.length;

  let duplicationRisk: 'low' | 'medium' | 'high';
  if (duplicationRatio > 0.3) {
    duplicationRisk = 'high';
  } else if (duplicationRatio > 0.15) {
    duplicationRisk = 'medium';
  } else {
    duplicationRisk = 'low';
  }

  return {
    averageComplexity: Math.round(averageComplexity * 10) / 10,
    maxComplexity,
    highComplexityFiles,
    totalFunctions,
    linesPerFunction,
    duplicationRisk,
    testFilesExcluded: testAnalyzed.length
  };
}
