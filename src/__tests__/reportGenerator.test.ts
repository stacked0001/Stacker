import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exportReport, type StackerReport } from '../reportGenerator';

function makeReport(): StackerReport {
  return {
    repoName: 'demo',
    analyzedAt: '2026-05-05T00:00:00.000Z',
    stack: {
      language: 'TypeScript',
      projectType: 'CLI Tool',
      frontend: [],
      backend: [],
      databases: [],
      styling: [],
      testing: ['node:test'],
      buildTools: ['TypeScript'],
      packageManager: 'npm',
      dependencies: [],
      devDependencies: [],
      hasDocker: false,
      hasCI: true,
      hasTypeScript: true
    },
    stats: {
      fileCount: 1,
      componentCount: 0,
      apiRouteCount: 0,
      lineCount: 10,
      testFileCount: 1,
      configFileCount: 1,
      filesByExtension: { '.ts': 1 }
    },
    architecture: {
      patterns: ['CLI Tool'],
      hasMonorepoSetup: false,
      hasServerlessConfig: false,
      hasApiLayer: false,
      hasFrontendLayer: false,
      hasBackendLayer: false,
      hasDatabaseLayer: false,
      layerCount: 0,
      scalabilitySignals: [],
      complexitySignals: [],
      description: 'CLI Tool written in TypeScript'
    },
    ruleResults: {
      findings: [],
      totalFindings: 0,
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0
    },
    reasoning: null,
    merged: []
  };
}

describe('exportReport()', () => {
  it('rejects unsafe output extensions', () => {
    assert.throws(
      () => exportReport(makeReport(), 'json', 'stacker-report.exe'),
      /extension/i
    );
  });
});
