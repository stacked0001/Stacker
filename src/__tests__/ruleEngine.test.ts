import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runRuleEngine } from '../ruleEngine';
import type { DetectedStack } from '../stackDetector';

function makeStack(overrides: Partial<DetectedStack> = {}): DetectedStack {
  return {
    language: 'TypeScript',
    projectType: 'Backend API',
    frontend: [],
    backend: [],
    databases: [],
    styling: [],
    testing: [],
    buildTools: [],
    packageManager: 'npm',
    dependencies: [],
    devDependencies: [],
    hasDocker: true,
    hasCI: true,
    hasTypeScript: true,
    ...overrides
  };
}

describe('runRuleEngine()', () => {
  it('returns empty findings for a well-configured stack', () => {
    const stack = makeStack({
      testing: ['Vitest'],
      hasDocker: true,
      hasCI: true
    });
    const result = runRuleEngine(stack, 0, 0, 10, 5);
    assert.equal(result.findings.length, 0);
  });

  it('TESTING_001: fires when testing is empty AND testFileCount === 0', () => {
    const stack = makeStack({ testing: [] });
    const result = runRuleEngine(stack, 0, 0, 10, 0);
    const finding = result.findings.find(f => f.ruleId === 'TESTING_001');
    assert.ok(finding, 'TESTING_001 should fire');
    assert.equal(finding?.severity, 'critical');
  });

  it('TESTING_001: does NOT fire when testFileCount > 0 even if no framework in deps', () => {
    const stack = makeStack({ testing: [] });
    const result = runRuleEngine(stack, 0, 0, 10, 3);
    const finding = result.findings.find(f => f.ruleId === 'TESTING_001');
    assert.equal(finding, undefined, 'TESTING_001 should NOT fire when test files exist');
  });

  it('TESTING_001: does NOT fire when testing framework is detected', () => {
    const stack = makeStack({ testing: ['Jest'] });
    const result = runRuleEngine(stack, 0, 0, 10, 0);
    const finding = result.findings.find(f => f.ruleId === 'TESTING_001');
    assert.equal(finding, undefined, 'TESTING_001 should NOT fire when framework detected');
  });

  it('INFRA_002: fires when hasCI is false', () => {
    const stack = makeStack({ hasCI: false });
    const result = runRuleEngine(stack, 0, 0, 10, 1);
    const finding = result.findings.find(f => f.ruleId === 'INFRA_002');
    assert.ok(finding, 'INFRA_002 should fire');
    assert.equal(finding?.severity, 'critical');
  });

  it('INFRA_001: fires when hasDocker is false and backend exists', () => {
    const stack = makeStack({ hasDocker: false, backend: ['Express'] });
    const result = runRuleEngine(stack, 0, 0, 10, 1);
    const finding = result.findings.find(f => f.ruleId === 'INFRA_001');
    assert.ok(finding, 'INFRA_001 should fire');
  });

  it('BACKEND_001: fires for Express with > 150 API routes', () => {
    const stack = makeStack({ backend: ['Express'] });
    const result = runRuleEngine(stack, 0, 151, 10, 1);
    const finding = result.findings.find(f => f.ruleId === 'BACKEND_001');
    assert.ok(finding, 'BACKEND_001 should fire');
  });

  it('BACKEND_001: does NOT fire for Express with <= 150 routes', () => {
    const stack = makeStack({ backend: ['Express'] });
    const result = runRuleEngine(stack, 0, 150, 10, 1);
    const finding = result.findings.find(f => f.ruleId === 'BACKEND_001');
    assert.equal(finding, undefined);
  });

  it('DATABASE_001: fires when PostgreSQL used without ORM', () => {
    const stack = makeStack({ databases: ['PostgreSQL'] });
    const result = runRuleEngine(stack, 0, 0, 10, 1);
    const finding = result.findings.find(f => f.ruleId === 'DATABASE_001');
    assert.ok(finding, 'DATABASE_001 should fire');
  });

  it('DATABASE_001: does NOT fire when Prisma ORM is present', () => {
    const stack = makeStack({ databases: ['PostgreSQL', 'Prisma ORM'] });
    const result = runRuleEngine(stack, 0, 0, 10, 1);
    const finding = result.findings.find(f => f.ruleId === 'DATABASE_001');
    assert.equal(finding, undefined);
  });

  it('results are sorted by severity (critical first)', () => {
    const stack = makeStack({ hasCI: false, hasDocker: false, backend: ['Express'], testing: [] });
    const result = runRuleEngine(stack, 0, 0, 10, 0);
    const severities = result.findings.map(f => f.severity);
    const order = { critical: 0, warning: 1, info: 2 };
    for (let i = 1; i < severities.length; i++) {
      assert.ok(order[severities[i]] >= order[severities[i - 1]], 'findings should be sorted by severity');
    }
  });

  it('counts match findings array', () => {
    const stack = makeStack({ hasCI: false, testing: [] });
    const result = runRuleEngine(stack, 0, 0, 10, 0);
    const manual = {
      critical: result.findings.filter(f => f.severity === 'critical').length,
      warning: result.findings.filter(f => f.severity === 'warning').length,
      info: result.findings.filter(f => f.severity === 'info').length
    };
    assert.equal(result.criticalCount, manual.critical);
    assert.equal(result.warningCount, manual.warning);
    assert.equal(result.infoCount, manual.info);
    assert.equal(result.totalFindings, result.findings.length);
  });
});
