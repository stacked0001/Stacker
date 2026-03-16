import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectStack } from '../stackDetector';

function makeTempRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stacker-test-'));
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return dir;
}

function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe('detectStack()', () => {
  it('detects TypeScript from tsconfig.json', () => {
    const dir = makeTempRepo({
      'package.json': JSON.stringify({ dependencies: {}, devDependencies: {} }),
      'tsconfig.json': '{}'
    });
    try {
      const stack = detectStack(dir);
      assert.equal(stack.hasTypeScript, true);
      assert.equal(stack.language, 'TypeScript');
    } finally { cleanup(dir); }
  });

  it('detects React frontend', () => {
    const dir = makeTempRepo({
      'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' }, devDependencies: {} })
    });
    try {
      const stack = detectStack(dir);
      assert.ok(stack.frontend.includes('React'));
    } finally { cleanup(dir); }
  });

  it('detects Next.js and does NOT also add plain React', () => {
    const dir = makeTempRepo({
      'package.json': JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' }, devDependencies: {} })
    });
    try {
      const stack = detectStack(dir);
      assert.ok(stack.frontend.includes('Next.js'));
      assert.ok(!stack.frontend.includes('React'), 'React should not be duplicated when Next.js is present');
    } finally { cleanup(dir); }
  });

  it('detects Express backend', () => {
    const dir = makeTempRepo({
      'package.json': JSON.stringify({ dependencies: { express: '^4.18.0' }, devDependencies: {} })
    });
    try {
      const stack = detectStack(dir);
      assert.ok(stack.backend.includes('Express'));
    } finally { cleanup(dir); }
  });

  it('detects Prisma ORM', () => {
    const dir = makeTempRepo({
      'package.json': JSON.stringify({
        dependencies: { '@prisma/client': '^5.0.0' },
        devDependencies: { prisma: '^5.0.0' }
      })
    });
    try {
      const stack = detectStack(dir);
      assert.ok(stack.databases.includes('Prisma ORM'));
    } finally { cleanup(dir); }
  });

  it('detects pnpm package manager', () => {
    const dir = makeTempRepo({
      'package.json': JSON.stringify({ dependencies: {}, devDependencies: {} }),
      'pnpm-lock.yaml': ''
    });
    try {
      const stack = detectStack(dir);
      assert.equal(stack.packageManager, 'pnpm');
    } finally { cleanup(dir); }
  });

  it('detects Docker', () => {
    const dir = makeTempRepo({
      'package.json': JSON.stringify({ dependencies: {}, devDependencies: {} }),
      'Dockerfile': 'FROM node:20'
    });
    try {
      const stack = detectStack(dir);
      assert.equal(stack.hasDocker, true);
    } finally { cleanup(dir); }
  });

  it('detects CI from .github/workflows directory', () => {
    const dir = makeTempRepo({
      'package.json': JSON.stringify({ dependencies: {}, devDependencies: {} }),
      '.github/workflows/ci.yml': 'name: CI'
    });
    try {
      const stack = detectStack(dir);
      assert.equal(stack.hasCI, true);
    } finally { cleanup(dir); }
  });

  it('detectSpecializedProjectType: returns CLI Tool for bin-only package', () => {
    const dir = makeTempRepo({
      'package.json': JSON.stringify({
        bin: { mycli: './bin/mycli' },
        dependencies: {},
        devDependencies: {}
      })
    });
    try {
      const stack = detectStack(dir);
      assert.equal(stack.projectType, 'CLI Tool');
    } finally { cleanup(dir); }
  });

  it('detectSpecializedProjectType: does NOT return CLI Tool when frontend framework present', () => {
    const dir = makeTempRepo({
      'package.json': JSON.stringify({
        bin: { myapp: './bin/myapp' },
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
        devDependencies: {}
      })
    });
    try {
      const stack = detectStack(dir);
      assert.notEqual(stack.projectType, 'CLI Tool');
    } finally { cleanup(dir); }
  });

  it('detectSpecializedProjectType: detects Cloudflare Worker from wrangler.toml', () => {
    const dir = makeTempRepo({
      'package.json': JSON.stringify({ dependencies: {}, devDependencies: {} }),
      'wrangler.toml': '[workers]'
    });
    try {
      const stack = detectStack(dir);
      assert.equal(stack.projectType, 'Cloudflare Worker');
    } finally { cleanup(dir); }
  });

  it('detects Python stack from requirements.txt', () => {
    const dir = makeTempRepo({
      'requirements.txt': 'flask==2.3.0\nrequests==2.28.0\n'
    });
    try {
      const stack = detectStack(dir);
      assert.equal(stack.language, 'Python');
      assert.ok(stack.backend.includes('Flask'));
    } finally { cleanup(dir); }
  });

  it('returns Unknown language for empty repo', () => {
    const dir = makeTempRepo({});
    try {
      const stack = detectStack(dir);
      assert.equal(stack.language, 'Unknown');
    } finally { cleanup(dir); }
  });
});
