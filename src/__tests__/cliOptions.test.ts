import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getArgValue, getCommandOption, hasArgFlag } from '../cliOptions';

describe('getCommandOption()', () => {
  it('reads commander options from opts()', () => {
    const command = {
      opts: () => ({ format: 'json', skipAi: true })
    };

    assert.equal(getCommandOption<string>(command, 'format'), 'json');
    assert.equal(getCommandOption<boolean>(command, 'skipAi'), true);
  });

  it('falls back to direct option properties', () => {
    assert.equal(getCommandOption<string>({ output: 'report.md' }, 'output'), 'report.md');
  });

  it('reads string flags from raw argv', () => {
    assert.equal(getArgValue(['demo', '--format', 'json'], '--format'), 'json');
    assert.equal(getArgValue(['demo', '--format=markdown'], '--format'), 'markdown');
  });

  it('detects boolean flags from raw argv', () => {
    assert.equal(hasArgFlag(['codebase', '.', '--skip-ai'], '--skip-ai'), true);
    assert.equal(hasArgFlag(['codebase', '.'], '--skip-ai'), false);
  });
});
