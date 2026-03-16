import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, validateConfig } from '../config';

describe('loadConfig()', () => {
  const originalEnv: Record<string, string | undefined> = {};

  before(() => {
    // Save relevant env vars before each test group
    for (const key of [
      'STACKER_PROVIDER', 'STACKER_ANALYSIS_MODEL', 'STACKER_REASONING_MODEL',
      'STACKER_SKIP_AI', 'STACKER_CACHE', 'STACKER_RETRIES', 'STACKER_TIMEOUT',
      'STACKER_VERBOSE', 'STACKER_FORMAT', 'STACKER_CACHE_DIR'
    ]) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  after(() => {
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('returns defaults when no env vars are set', () => {
    const config = loadConfig();
    assert.equal(config.provider, 'groq');
    assert.equal(config.cacheEnabled, true);
    assert.equal(config.skipAI, false);
    assert.equal(config.verbose, false);
    assert.equal(config.outputFormat, 'terminal');
    assert.equal(config.retries, 2);
    assert.equal(config.timeout, 30000);
  });

  it('respects STACKER_RETRIES env var', () => {
    process.env.STACKER_RETRIES = '5';
    const config = loadConfig();
    assert.equal(config.retries, 5);
    delete process.env.STACKER_RETRIES;
  });

  it('clamps STACKER_RETRIES to max of 10', () => {
    process.env.STACKER_RETRIES = '999';
    const config = loadConfig();
    assert.equal(config.retries, 10);
    delete process.env.STACKER_RETRIES;
  });

  it('falls back to default retries for invalid STACKER_RETRIES', () => {
    process.env.STACKER_RETRIES = 'not-a-number';
    const config = loadConfig();
    assert.equal(config.retries, 2);
    delete process.env.STACKER_RETRIES;
  });

  it('clamps STACKER_TIMEOUT to max of 300000', () => {
    process.env.STACKER_TIMEOUT = '999999';
    const config = loadConfig();
    assert.equal(config.timeout, 300000);
    delete process.env.STACKER_TIMEOUT;
  });

  it('falls back to default timeout for invalid STACKER_TIMEOUT', () => {
    process.env.STACKER_TIMEOUT = 'bad';
    const config = loadConfig();
    assert.equal(config.timeout, 30000);
    delete process.env.STACKER_TIMEOUT;
  });

  it('respects STACKER_SKIP_AI=true', () => {
    process.env.STACKER_SKIP_AI = 'true';
    const config = loadConfig();
    assert.equal(config.skipAI, true);
    delete process.env.STACKER_SKIP_AI;
  });

  it('respects STACKER_CACHE=false', () => {
    process.env.STACKER_CACHE = 'false';
    const config = loadConfig();
    assert.equal(config.cacheEnabled, false);
    delete process.env.STACKER_CACHE;
  });
});

describe('validateConfig()', () => {
  it('returns no errors for a valid config', () => {
    const config = loadConfig();
    const errors = validateConfig(config);
    assert.equal(errors.length, 0);
  });

  it('returns error for unknown provider', () => {
    const config = loadConfig();
    config.provider = 'openai';
    const errors = validateConfig(config);
    assert.ok(errors.length > 0);
    assert.ok(errors[0].includes('openai'));
  });
});
