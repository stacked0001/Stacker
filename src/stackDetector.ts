import * as fs from 'fs';
import * as path from 'path';

export interface DetectedStack {
  language: string;
  projectType: string;
  frontend: string[];
  backend: string[];
  databases: string[];
  styling: string[];
  testing: string[];
  buildTools: string[];
  packageManager: string | null;
  dependencies: string[];
  devDependencies: string[];
  hasDocker: boolean;
  hasCI: boolean;
  hasTypeScript: boolean;
}

export function detectStack(repoPath: string): DetectedStack {
  const stack: DetectedStack = {
    language: 'Unknown',
    projectType: 'Unknown',
    frontend: [],
    backend: [],
    databases: [],
    styling: [],
    testing: [],
    buildTools: [],
    packageManager: null,
    dependencies: [],
    devDependencies: [],
    hasDocker: false,
    hasCI: false,
    hasTypeScript: false
  };

  // Detect from package.json (Node.js / JS / TS)
  const pkgPath = path.join(repoPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      stack.language = 'JavaScript/TypeScript';
      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      stack.dependencies = deps;
      stack.devDependencies = devDeps;
      const allDeps = [...deps, ...devDeps];

      // TypeScript
      if (allDeps.includes('typescript') || fs.existsSync(path.join(repoPath, 'tsconfig.json'))) {
        stack.hasTypeScript = true;
        stack.language = 'TypeScript';
      }

      // Frontend frameworks
      if (allDeps.includes('next')) stack.frontend.push('Next.js');
      if (allDeps.includes('react') && !allDeps.includes('next')) stack.frontend.push('React');
      if (allDeps.includes('vue')) stack.frontend.push('Vue');
      if (allDeps.includes('@angular/core')) stack.frontend.push('Angular');
      if (allDeps.includes('svelte')) stack.frontend.push('Svelte');
      if (allDeps.includes('solid-js')) stack.frontend.push('SolidJS');
      if (allDeps.includes('remix')) stack.frontend.push('Remix');
      if (allDeps.includes('gatsby')) stack.frontend.push('Gatsby');

      // Backend frameworks
      if (allDeps.includes('express')) stack.backend.push('Express');
      if (allDeps.includes('fastify')) stack.backend.push('Fastify');
      if (allDeps.includes('@nestjs/core')) stack.backend.push('NestJS');
      if (allDeps.includes('koa')) stack.backend.push('Koa');
      if (allDeps.includes('hono')) stack.backend.push('Hono');
      if (allDeps.includes('@trpc/server')) stack.backend.push('tRPC');

      // Databases
      if (allDeps.includes('mongoose') || allDeps.includes('mongodb')) stack.databases.push('MongoDB');
      if (allDeps.includes('pg') || allDeps.includes('postgres') || allDeps.includes('@neondatabase/serverless')) stack.databases.push('PostgreSQL');
      if (allDeps.includes('mysql') || allDeps.includes('mysql2')) stack.databases.push('MySQL');
      if (allDeps.includes('ioredis') || allDeps.includes('redis')) stack.databases.push('Redis');
      if (allDeps.includes('better-sqlite3') || allDeps.includes('@libsql/client')) stack.databases.push('SQLite');

      // ORMs
      if (allDeps.includes('@prisma/client') || devDeps.includes('prisma')) stack.databases.push('Prisma ORM');
      if (allDeps.includes('drizzle-orm')) stack.databases.push('Drizzle ORM');
      if (allDeps.includes('typeorm')) stack.databases.push('TypeORM');
      if (allDeps.includes('sequelize')) stack.databases.push('Sequelize');

      // Styling
      if (allDeps.includes('tailwindcss') || devDeps.includes('tailwindcss')) stack.styling.push('Tailwind CSS');
      if (allDeps.includes('styled-components')) stack.styling.push('Styled Components');
      if (allDeps.includes('@emotion/react')) stack.styling.push('Emotion');
      if (allDeps.includes('sass') || allDeps.includes('node-sass')) stack.styling.push('SASS');
      if (allDeps.includes('@stitches/react')) stack.styling.push('Stitches');

      // Check for CSS modules (heuristic)
      if (!stack.styling.length) {
        const hasCSSModules = checkForCSSModules(repoPath);
        if (hasCSSModules) stack.styling.push('CSS Modules');
        else stack.styling.push('Plain CSS');
      }

      // Testing
      if (allDeps.includes('jest') || devDeps.includes('jest')) stack.testing.push('Jest');
      if (allDeps.includes('vitest') || devDeps.includes('vitest')) stack.testing.push('Vitest');
      if (allDeps.includes('@playwright/test') || devDeps.includes('@playwright/test')) stack.testing.push('Playwright');
      if (allDeps.includes('cypress') || devDeps.includes('cypress')) stack.testing.push('Cypress');

      // Build tools
      if (devDeps.includes('vite') || allDeps.includes('vite')) stack.buildTools.push('Vite');
      if (devDeps.includes('webpack') || allDeps.includes('webpack')) stack.buildTools.push('Webpack');
      if (devDeps.includes('esbuild') || allDeps.includes('esbuild')) stack.buildTools.push('esbuild');
      if (devDeps.includes('rollup') || allDeps.includes('rollup')) stack.buildTools.push('Rollup');
      if (devDeps.includes('turbo') || allDeps.includes('turbo')) stack.buildTools.push('Turborepo');

      // Package manager
      if (fs.existsSync(path.join(repoPath, 'pnpm-lock.yaml'))) stack.packageManager = 'pnpm';
      else if (fs.existsSync(path.join(repoPath, 'yarn.lock'))) stack.packageManager = 'yarn';
      else if (fs.existsSync(path.join(repoPath, 'bun.lockb'))) stack.packageManager = 'bun';
      else if (fs.existsSync(path.join(repoPath, 'package-lock.json'))) stack.packageManager = 'npm';

      // Specialized project type detection (checked before generic inference)
      const specializedType = detectSpecializedProjectType(repoPath, pkg, allDeps);
      if (specializedType) {
        stack.projectType = specializedType;
      } else {
        stack.projectType = inferProjectType(stack);
      }

    } catch {
      // ignore parse errors
    }
  }

  // Python detection
  if (fs.existsSync(path.join(repoPath, 'requirements.txt')) || fs.existsSync(path.join(repoPath, 'pyproject.toml'))) {
    stack.language = 'Python';
    detectPythonStack(repoPath, stack);
  }

  // Go detection
  if (fs.existsSync(path.join(repoPath, 'go.mod'))) {
    stack.language = 'Go';
    detectGoStack(repoPath, stack);
  }

  // Rust detection
  if (fs.existsSync(path.join(repoPath, 'Cargo.toml'))) {
    stack.language = 'Rust';
    try {
      const cargo = fs.readFileSync(path.join(repoPath, 'Cargo.toml'), 'utf-8');
      if (cargo.includes('actix-web')) stack.backend.push('Actix Web');
      if (cargo.includes('axum')) stack.backend.push('Axum');
      if (cargo.includes('rocket')) stack.backend.push('Rocket');
    } catch { /* ignore unreadable file */ }
    stack.projectType = 'Rust Application';
  }

  // Java detection
  if (fs.existsSync(path.join(repoPath, 'pom.xml'))) {
    stack.language = 'Java';
    try {
      const pom = fs.readFileSync(path.join(repoPath, 'pom.xml'), 'utf-8');
      if (pom.includes('spring-boot')) stack.backend.push('Spring Boot');
      if (pom.includes('spring-web')) stack.backend.push('Spring MVC');
      if (pom.includes('hibernate')) stack.databases.push('Hibernate ORM');
    } catch { /* ignore unreadable file */ }
    stack.projectType = 'Java Application';
  }

  // Docker / CI
  stack.hasDocker = fs.existsSync(path.join(repoPath, 'Dockerfile')) || fs.existsSync(path.join(repoPath, 'docker-compose.yml'));
  stack.hasCI =
    fs.existsSync(path.join(repoPath, '.github', 'workflows')) ||
    fs.existsSync(path.join(repoPath, '.gitlab-ci.yml')) ||
    fs.existsSync(path.join(repoPath, 'Jenkinsfile'));

  return stack;
}

function checkForCSSModules(repoPath: string): boolean {
  try {
    const walkDir = (dir: string, depth = 0): boolean => {
      if (depth > 3) return false;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        if (entry.isFile() && entry.name.endsWith('.module.css')) return true;
        if (entry.isDirectory()) {
          if (walkDir(path.join(dir, entry.name), depth + 1)) return true;
        }
      }
      return false;
    };
    return walkDir(repoPath);
  } catch {
    return false;
  }
}

function detectPythonStack(repoPath: string, stack: DetectedStack): void {
  const reqPath = path.join(repoPath, 'requirements.txt');
  let requirements = '';
  if (fs.existsSync(reqPath)) {
    requirements = fs.readFileSync(reqPath, 'utf-8').toLowerCase();
  }

  if (requirements.includes('django')) stack.backend.push('Django');
  if (requirements.includes('flask')) stack.backend.push('Flask');
  if (requirements.includes('fastapi')) stack.backend.push('FastAPI');
  if (requirements.includes('tornado')) stack.backend.push('Tornado');
  if (requirements.includes('aiohttp')) stack.backend.push('aiohttp');
  if (requirements.includes('sqlalchemy')) stack.databases.push('SQLAlchemy');
  if (requirements.includes('psycopg2') || requirements.includes('asyncpg')) stack.databases.push('PostgreSQL');
  if (requirements.includes('pymongo')) stack.databases.push('MongoDB');
  if (requirements.includes('redis')) stack.databases.push('Redis');
  if (requirements.includes('pytest')) stack.testing.push('pytest');
  if (requirements.includes('celery')) stack.backend.push('Celery');

  stack.projectType = stack.backend.length ? 'Python Web App' : 'Python Application';
}

function detectGoStack(repoPath: string, stack: DetectedStack): void {
  try {
    const goMod = fs.readFileSync(path.join(repoPath, 'go.mod'), 'utf-8');
    if (goMod.includes('gin-gonic/gin')) stack.backend.push('Gin');
    if (goMod.includes('gofiber/fiber')) stack.backend.push('Fiber');
    if (goMod.includes('labstack/echo')) stack.backend.push('Echo');
    if (goMod.includes('go-chi/chi')) stack.backend.push('Chi');
    if (goMod.includes('jackc/pgx') || goMod.includes('lib/pq')) stack.databases.push('PostgreSQL');
    if (goMod.includes('go-redis')) stack.databases.push('Redis');
    if (goMod.includes('gorm.io')) stack.databases.push('GORM');
    stack.projectType = 'Go Application';
  } catch {
    // ignore
  }
}

function detectSpecializedProjectType(repoPath: string, pkg: Record<string, unknown>, allDeps: string[]): string | null {
  // Claude Code Plugin
  if (
    fs.existsSync(path.join(repoPath, '.claude')) ||
    fs.existsSync(path.join(repoPath, 'CLAUDE.md')) ||
    allDeps.includes('@anthropic-ai/claude-code')
  ) {
    return 'Claude Code Plugin';
  }

  // VS Code Extension
  const engines = pkg.engines as Record<string, unknown> | undefined;
  if (
    (engines && typeof engines.vscode === 'string') ||
    allDeps.includes('vsce') ||
    allDeps.includes('@vscode/vsce')
  ) {
    return 'VS Code Extension';
  }

  // GitHub Action
  if (
    fs.existsSync(path.join(repoPath, 'action.yml')) ||
    fs.existsSync(path.join(repoPath, 'action.yaml'))
  ) {
    return 'GitHub Action';
  }

  // Cloudflare Worker
  if (
    fs.existsSync(path.join(repoPath, 'wrangler.toml')) ||
    allDeps.includes('@cloudflare/workers-types') ||
    allDeps.includes('wrangler')
  ) {
    return 'Cloudflare Worker';
  }

  // Browser Extension
  const manifestPath = path.join(repoPath, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (typeof manifest.manifest_version === 'number') {
        return 'Browser Extension';
      }
    } catch { /* ignore */ }
  }

  // CLI Tool (has bin field but no frontend framework and no backend web framework)
  const hasFrontend = allDeps.some(d => ['react', 'vue', '@angular/core', 'svelte', 'next', 'remix', 'gatsby', 'solid-js'].includes(d));
  const hasBackendWeb = allDeps.some(d => ['express', 'fastify', '@nestjs/core', 'koa', 'hono'].includes(d));
  if (pkg.bin && !hasFrontend && !hasBackendWeb) {
    return 'CLI Tool';
  }

  return null;
}

function inferProjectType(stack: DetectedStack): string {
  if (stack.frontend.includes('Next.js')) return 'Full-Stack Web App (Next.js)';
  if (stack.frontend.length > 0 && stack.backend.length > 0) return 'Full-Stack Web App';
  if (stack.frontend.length > 0) return 'Frontend Web App';
  if (stack.backend.length > 0) return 'Backend API';
  return 'Node.js Application';
}
