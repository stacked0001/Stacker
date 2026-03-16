import * as fs from 'fs';
import * as path from 'path';
import { DetectedStack } from './stackDetector';
import { AnalyzerStats } from './analyzer';

export type ArchitecturePattern =
  | 'Monolith'
  | 'Monorepo'
  | 'Microservices'
  | 'Serverless'
  | 'JAMstack'
  | 'MVC'
  | 'Clean Architecture'
  | 'Feature-Sliced Design'
  | 'API-First'
  | 'Full-Stack SSR'
  | 'SPA'
  | 'Library/Package'
  | 'CLI Tool';

export interface ArchitectureMap {
  patterns: ArchitecturePattern[];
  hasMonorepoSetup: boolean;
  hasServerlessConfig: boolean;
  hasApiLayer: boolean;
  hasFrontendLayer: boolean;
  hasBackendLayer: boolean;
  hasDatabaseLayer: boolean;
  layerCount: number;
  scalabilitySignals: string[];
  complexitySignals: string[];
  description: string;
}

export function mapArchitecture(stack: DetectedStack, stats: AnalyzerStats, repoPath: string): ArchitectureMap {
  const patterns: ArchitecturePattern[] = [];
  const scalabilitySignals: string[] = [];
  const complexitySignals: string[] = [];

  const hasFrontendLayer = stack.frontend.length > 0;
  const hasBackendLayer = stack.backend.length > 0;
  const hasDatabaseLayer = stack.databases.length > 0;
  const hasApiLayer = stats.apiRouteCount > 0;

  // Monorepo detection
  const hasMonorepoSetup =
    hasFile(repoPath, 'pnpm-workspace.yaml') ||
    hasFile(repoPath, 'lerna.json') ||
    hasFile(repoPath, 'nx.json') ||
    hasFile(repoPath, 'turbo.json') ||
    hasDir(repoPath, 'packages') ||
    hasDir(repoPath, 'apps');

  // Serverless detection
  const hasServerlessConfig =
    hasFile(repoPath, 'serverless.yml') ||
    hasFile(repoPath, 'serverless.yaml') ||
    hasFile(repoPath, 'netlify.toml') ||
    hasFile(repoPath, 'vercel.json') ||
    hasFile(repoPath, 'amplify.yml');

  // Determine patterns
  if (hasMonorepoSetup) patterns.push('Monorepo');
  if (hasServerlessConfig) patterns.push('Serverless');

  if (stack.frontend.includes('Next.js') || stack.frontend.includes('Remix')) {
    patterns.push('Full-Stack SSR');
  } else if (hasFrontendLayer && !hasBackendLayer) {
    if (hasServerlessConfig) patterns.push('JAMstack');
    else patterns.push('SPA');
  } else if (!hasFrontendLayer && hasBackendLayer) {
    patterns.push('API-First');
  } else if (hasFrontendLayer && hasBackendLayer) {
    if (hasDir(repoPath, 'src') && hasDir(repoPath, 'src/modules')) {
      patterns.push('Clean Architecture');
    } else {
      patterns.push('Monolith');
    }
  }

  if (patterns.length === 0) {
    if (stack.language === 'Go' || stack.language === 'Rust') patterns.push('CLI Tool');
    else patterns.push('Library/Package');
  }

  // Scalability signals
  if (stack.hasDocker) scalabilitySignals.push('Docker containerization');
  if (hasMonorepoSetup) scalabilitySignals.push('Monorepo structure');
  if (stack.databases.includes('Redis')) scalabilitySignals.push('Redis caching layer');
  if (hasServerlessConfig) scalabilitySignals.push('Serverless deployment');
  if (stack.backend.includes('NestJS')) scalabilitySignals.push('Modular NestJS architecture');
  if (stack.buildTools.includes('Turborepo')) scalabilitySignals.push('Turborepo build caching');

  // Complexity signals
  if (stats.fileCount > 500) complexitySignals.push(`Large codebase (${stats.fileCount} files)`);
  if (stats.apiRouteCount > 100) complexitySignals.push(`High API surface (${stats.apiRouteCount} routes)`);
  if (stack.dependencies.length > 50) complexitySignals.push(`Many dependencies (${stack.dependencies.length})`);
  if (stats.testFileCount === 0) complexitySignals.push('No test coverage detected');
  if (!stack.hasCI) complexitySignals.push('No CI/CD pipeline');

  const layerCount = [hasFrontendLayer, hasBackendLayer, hasDatabaseLayer].filter(Boolean).length;

  const description = buildDescription(patterns, stack, stats);

  return {
    patterns,
    hasMonorepoSetup,
    hasServerlessConfig,
    hasApiLayer,
    hasFrontendLayer,
    hasBackendLayer,
    hasDatabaseLayer,
    layerCount,
    scalabilitySignals,
    complexitySignals,
    description
  };
}

function hasFile(repoPath: string, filename: string): boolean {
  try {
    return fs.existsSync(path.join(repoPath, filename));
  } catch { return false; }
}

function hasDir(repoPath: string, dirname: string): boolean {
  try {
    const p = path.join(repoPath, dirname);
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch { return false; }
}

function buildDescription(patterns: ArchitecturePattern[], stack: DetectedStack, stats: AnalyzerStats): string {
  const parts: string[] = [];
  if (patterns.length > 0) parts.push(patterns.join(' + '));
  if (stack.language !== 'Unknown') parts.push(`written in ${stack.language}`);
  if (stats.lineCount > 0) parts.push(`with ~${stats.lineCount.toLocaleString()} lines of code`);
  return parts.join(', ');
}
