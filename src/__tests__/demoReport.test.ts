import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoReport } from '../demoReport';

describe('createDemoReport()', () => {
  it('returns a realistic codebase report with actionable findings', () => {
    const report = createDemoReport();

    assert.equal(report.repoName, 'demo-saas-app');
    assert.equal(report.mode, 'codebase');
    assert.ok(report.merged.length >= 2);
    assert.ok(report.merged.every(item => item.evidence && item.evidence.length > 0));
  });
});
