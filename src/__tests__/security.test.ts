import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateRepoTarget, maskSecret, scrubSecrets, validateOutputPath, validateModelId } from '../security';

describe('validateRepoTarget()', () => {
  it('accepts a valid GitHub HTTPS URL', () => {
    assert.doesNotThrow(() => validateRepoTarget('https://github.com/user/repo'));
  });

  it('accepts a valid GitHub HTTPS URL with .git suffix', () => {
    assert.doesNotThrow(() => validateRepoTarget('https://github.com/user/repo.git'));
  });

  it('accepts a valid SSH git URL', () => {
    assert.doesNotThrow(() => validateRepoTarget('git@github.com:user/repo.git'));
  });

  it('accepts a local relative path like "."', () => {
    assert.doesNotThrow(() => validateRepoTarget('.'));
  });

  it('blocks HTTP URLs', () => {
    assert.throws(
      () => validateRepoTarget('http://github.com/user/repo'),
      /HTTP.*not allowed/i
    );
  });

  it('blocks path traversal: ../../etc/passwd', () => {
    assert.throws(
      () => validateRepoTarget('../../etc/passwd'),
      /disallowed characters|restricted system/i
    );
  });

  it('blocks shell injection: ; rm -rf /', () => {
    assert.throws(
      () => validateRepoTarget('; rm -rf /'),
      /disallowed characters/i
    );
  });

  it('blocks shell injection with backtick', () => {
    assert.throws(
      () => validateRepoTarget('`whoami`'),
      /disallowed characters/i
    );
  });

  it('blocks shell injection with pipe', () => {
    assert.throws(
      () => validateRepoTarget('repo | cat /etc/passwd'),
      /disallowed characters/i
    );
  });

  it('blocks null bytes in path', () => {
    assert.throws(
      () => validateRepoTarget('repo\0evil'),
      /null bytes/i
    );
  });

  it('blocks empty target', () => {
    assert.throws(
      () => validateRepoTarget(''),
      /empty/i
    );
  });

  it('blocks HTTPS URL with invalid characters', () => {
    assert.throws(
      () => validateRepoTarget('https://github.com/user/repo?foo=<script>'),
      /invalid characters/i
    );
  });
});

describe('maskSecret()', () => {
  it('masks a long secret keeping prefix and suffix', () => {
    const masked = maskSecret('gsk_abc123defghijklmnopqrstuvwxyz');
    assert.ok(masked.startsWith('gsk_abc'));
    assert.ok(masked.endsWith('wxyz'));
    assert.ok(masked.includes('...'));
  });

  it('returns [REDACTED] for short secrets', () => {
    assert.equal(maskSecret('short'), '[REDACTED]');
    assert.equal(maskSecret(''), '[REDACTED]');
  });
});

describe('scrubSecrets()', () => {
  it('redacts groq API keys', () => {
    const result = scrubSecrets('key=gsk_abc123defghijklmnopqrstuvwxyz123');
    assert.ok(!result.includes('gsk_abc'));
    assert.ok(result.includes('[GROQ_KEY_REDACTED]'));
  });

  it('redacts Bearer tokens', () => {
    const result = scrubSecrets('Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9abc');
    assert.ok(!result.includes('eyJhbGci'));
    assert.ok(result.includes('[REDACTED]'));
  });

  it('does not modify text with no secrets', () => {
    const clean = 'Hello world, no secrets here';
    assert.equal(scrubSecrets(clean), clean);
  });
});

describe('validateOutputPath()', () => {
  it('accepts .json extension', () => {
    assert.doesNotThrow(() => validateOutputPath('report.json'));
  });

  it('accepts .md extension', () => {
    assert.doesNotThrow(() => validateOutputPath('report.md'));
  });

  it('blocks .exe extension', () => {
    assert.throws(() => validateOutputPath('report.exe'), /not allowed/i);
  });

  it('blocks .sh extension', () => {
    assert.throws(() => validateOutputPath('report.sh'), /not allowed/i);
  });

  it('blocks empty path', () => {
    assert.throws(() => validateOutputPath(''), /empty/i);
  });

  it('blocks null bytes', () => {
    assert.throws(() => validateOutputPath('report\0.json'), /null bytes/i);
  });

  it('returns absolute path', () => {
    const result = validateOutputPath('report.json');
    assert.ok(result.startsWith('/') || /^[A-Za-z]:\\/.test(result));
  });
});

describe('validateModelId()', () => {
  it('accepts valid model IDs', () => {
    assert.doesNotThrow(() => validateModelId('moonshotai/kimi-k2-instruct'));
    assert.doesNotThrow(() => validateModelId('openai/gpt-4o'));
    assert.doesNotThrow(() => validateModelId('llama3-8b-8192'));
  });

  it('rejects model IDs that are too short', () => {
    assert.throws(() => validateModelId('ab'), /Invalid model ID/i);
  });

  it('rejects model IDs with special characters', () => {
    assert.throws(() => validateModelId('model; rm -rf /'), /Invalid model ID/i);
    assert.throws(() => validateModelId('model<script>'), /Invalid model ID/i);
  });
});

// ── scanSecrets tests ──────────────────────────────────────────────
import { scanSecrets } from '../secretScanner';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

describe('scanSecrets()', () => {
  function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'stacker-test-'));
  }

  it('detects a fake AWS Access Key in a source file', () => {
    const dir = makeTempDir();
    try {
      fs.writeFileSync(path.join(dir, 'config.ts'), `const key = "AKIAIOSFODNN7EXAMPLE";\n`);
      const result = scanSecrets(dir);
      assert.ok(result.filesScanned >= 1, 'should have scanned at least 1 file');
      const awsFinding = result.findings.find(f => f.type === 'AWS Access Key');
      assert.ok(awsFinding, 'should find AWS Access Key');
      assert.ok(awsFinding!.match.includes('REDACTED'), 'match should be redacted');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does NOT flag a commented-out AWS key', () => {
    const dir = makeTempDir();
    try {
      fs.writeFileSync(path.join(dir, 'config.ts'), `// const key = "AKIAIOSFODNN7EXAMPLE";\n`);
      const result = scanSecrets(dir);
      const awsFinding = result.findings.find(f => f.type === 'AWS Access Key');
      assert.ok(!awsFinding, 'should NOT find AWS Access Key in a comment line');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects a fake OpenAI API key', () => {
    const dir = makeTempDir();
    try {
      fs.writeFileSync(path.join(dir, 'env.js'), `const apiKey = "sk-abcdefghijklmnopqrstuvwxyz12345";\n`);
      const result = scanSecrets(dir);
      const finding = result.findings.find(f => f.type === 'OpenAI API Key');
      assert.ok(finding, 'should find OpenAI API Key');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does NOT flag a commented-out OpenAI key (# style)', () => {
    const dir = makeTempDir();
    try {
      fs.writeFileSync(path.join(dir, 'config.py'), `# api_key = "sk-abcdefghijklmnopqrstuvwxyz12345"\n`);
      const result = scanSecrets(dir);
      const finding = result.findings.find(f => f.type === 'OpenAI API Key');
      assert.ok(!finding, 'should NOT find OpenAI key in a Python comment');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does NOT flag credential-looking fixtures in test files', () => {
    const dir = makeTempDir();
    try {
      const testDir = path.join(dir, '__tests__');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'fixtures.test.ts'), `const key = "AKIAIOSFODNN7EXAMPLE";\n`);
      const result = scanSecrets(dir);
      assert.equal(result.findings.length, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does NOT flag scanner regex definitions as live risky code', () => {
    const dir = makeTempDir();
    try {
      fs.writeFileSync(
        path.join(dir, 'scanner.ts'),
        `const patterns = [{ type: "eval() usage", regex: /\\beval\\s*\\(/ }];\n`
      );
      const result = scanSecrets(dir);
      assert.equal(result.findings.length, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
