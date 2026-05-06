import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldPrintTerminalOutput } from '../pipeline';

describe('shouldPrintTerminalOutput()', () => {
  it('prints only for terminal format', () => {
    assert.equal(shouldPrintTerminalOutput('terminal', undefined), true);
    assert.equal(shouldPrintTerminalOutput('json', undefined), false);
    assert.equal(shouldPrintTerminalOutput('markdown', undefined), false);
  });

  it('does not print terminal output when saving to a file', () => {
    assert.equal(shouldPrintTerminalOutput('terminal', 'report.md'), false);
    assert.equal(shouldPrintTerminalOutput('json', 'report.json'), false);
  });
});
