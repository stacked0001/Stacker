import { DetectedStack } from './stackDetector';

export interface RuleFinding {
  ruleId: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  evidence: string[];
  current: string;
  suggested: string;
  reason: string;
  benefit: string;
  effort: 'low' | 'medium' | 'high';
  priority: 'low' | 'medium' | 'high';
  tags: string[];
}

export interface RuleEngineResult {
  findings: RuleFinding[];
  totalFindings: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
}

interface RuleContext {
  stack: DetectedStack;
  componentCount: number;
  apiRouteCount: number;
  fileCount: number;
  testFileCount: number;
}

type RawRuleFinding = Omit<RuleFinding, 'evidence'> & { evidence?: string[] };
type Rule = (ctx: RuleContext) => RawRuleFinding | null;

const RULES: Rule[] = [
  // --- Backend rules ---
  ({ stack, apiRouteCount }) => {
    if (stack.backend.includes('Express') && apiRouteCount > 150) {
      return {
        ruleId: 'BACKEND_001',
        category: 'Backend Framework',
        severity: 'warning',
        current: 'Express',
        suggested: 'Fastify',
        reason: `Express is handling ${apiRouteCount} API routes. Fastify has significantly lower overhead and built-in schema validation.`,
        benefit: 'Up to 2x throughput improvement and automatic request/response validation.',
        effort: 'medium',
        priority: 'high',
        tags: ['performance', 'scalability']
      };
    }
    return null;
  },

  ({ stack }) => {
    if (stack.backend.includes('Express') && stack.hasTypeScript) {
      return {
        ruleId: 'BACKEND_002',
        category: 'Backend Framework',
        severity: 'info',
        current: 'Express',
        suggested: 'Hono or Fastify',
        reason: 'Express has limited TypeScript-native support. Hono and Fastify provide first-class TypeScript integration.',
        benefit: 'Better type safety, autocomplete, and reduced runtime errors.',
        effort: 'medium',
        priority: 'medium',
        tags: ['developer-experience', 'typescript']
      };
    }
    return null;
  },

  ({ stack }) => {
    const hasNoOrm =
      (stack.databases.includes('PostgreSQL') || stack.databases.includes('MySQL')) &&
      !stack.databases.some(d => ['Prisma ORM', 'Drizzle ORM', 'TypeORM', 'Sequelize', 'GORM', 'SQLAlchemy', 'Hibernate ORM'].includes(d));

    if (hasNoOrm) {
      return {
        ruleId: 'DATABASE_001',
        category: 'Database Access',
        severity: 'warning',
        current: 'Raw SQL queries',
        suggested: 'Prisma or Drizzle ORM',
        reason: 'No ORM detected with a relational database. Raw SQL increases risk of injection vulnerabilities and reduces maintainability.',
        benefit: 'Type-safe queries, auto migrations, injection prevention, and faster development.',
        effort: 'medium',
        priority: 'high',
        tags: ['security', 'maintainability', 'developer-experience']
      };
    }
    return null;
  },

  // --- Frontend / Styling rules ---
  ({ stack, componentCount }) => {
    if (stack.styling.includes('CSS Modules') && componentCount > 100) {
      return {
        ruleId: 'STYLING_001',
        category: 'Styling System',
        severity: 'warning',
        current: 'CSS Modules',
        suggested: 'Tailwind CSS',
        reason: `${componentCount} components with CSS Modules creates a large number of separate stylesheets and increased maintenance overhead.`,
        benefit: 'Faster UI development, consistent design tokens, and drastically reduced CSS bundle size.',
        effort: 'high',
        priority: 'medium',
        tags: ['developer-experience', 'performance', 'maintainability']
      };
    }
    return null;
  },

  ({ stack, componentCount }) => {
    if (stack.styling.includes('Plain CSS') && componentCount > 50) {
      return {
        ruleId: 'STYLING_002',
        category: 'Styling System',
        severity: 'warning',
        current: 'Plain CSS',
        suggested: 'Tailwind CSS or CSS Modules',
        reason: `Global CSS with ${componentCount} components leads to specificity conflicts and hard-to-maintain stylesheets.`,
        benefit: 'Scoped styles prevent conflicts; utility classes reduce stylesheet size.',
        effort: 'medium',
        priority: 'medium',
        tags: ['maintainability', 'scalability']
      };
    }
    return null;
  },

  // --- Testing rules ---
  ({ stack, testFileCount }) => {
    // Only flag missing tests if BOTH: no test framework in deps AND no test files found
    if (stack.testing.length === 0 && testFileCount === 0) {
      return {
        ruleId: 'TESTING_001',
        category: 'Testing',
        severity: 'critical',
        current: 'No test framework detected',
        suggested: 'Vitest (frontend) + Supertest (backend)',
        reason: 'No testing framework found in dependencies and no test files detected. This is a critical risk for production systems.',
        benefit: 'Catch regressions early, ship with confidence, and enable safe refactoring.',
        effort: 'medium',
        priority: 'high',
        tags: ['quality', 'reliability']
      };
    }
    return null;
  },

  ({ stack }) => {
    if (stack.testing.includes('Jest') && (stack.frontend.includes('Next.js') || stack.buildTools.includes('Vite'))) {
      return {
        ruleId: 'TESTING_002',
        category: 'Testing',
        severity: 'info',
        current: 'Jest',
        suggested: 'Vitest',
        reason: 'Vitest is a native Vite/ESM test runner with much faster startup and identical API to Jest.',
        benefit: '10x faster test runs in Vite/Next.js projects with zero config migration.',
        effort: 'low',
        priority: 'medium',
        tags: ['developer-experience', 'performance']
      };
    }
    return null;
  },

  // --- Build tool rules ---
  ({ stack }) => {
    if (stack.buildTools.includes('Webpack') && !stack.buildTools.includes('Vite')) {
      return {
        ruleId: 'BUILD_001',
        category: 'Build Tool',
        severity: 'warning',
        current: 'Webpack',
        suggested: 'Vite',
        reason: 'Webpack has significantly slower dev server startup and HMR compared to Vite\'s native ESM approach.',
        benefit: 'Near-instant dev server startup, faster HMR, and simpler configuration.',
        effort: 'medium',
        priority: 'medium',
        tags: ['developer-experience', 'performance']
      };
    }
    return null;
  },

  // --- Package manager rules ---
  ({ stack }) => {
    if (stack.packageManager === 'npm' && stack.devDependencies.length > 20) {
      return {
        ruleId: 'PKG_001',
        category: 'Package Manager',
        severity: 'info',
        current: 'npm',
        suggested: 'pnpm',
        reason: 'pnpm uses a content-addressable store, reducing disk usage by up to 70% and install times significantly.',
        benefit: 'Faster installs, reduced disk space, and stricter dependency isolation.',
        effort: 'low',
        priority: 'low',
        tags: ['developer-experience', 'performance']
      };
    }
    return null;
  },

  // --- Architecture rules ---
  ({ stack }) => {
    if (!stack.hasDocker && (stack.backend.length > 0 || stack.databases.length > 0)) {
      return {
        ruleId: 'INFRA_001',
        category: 'Infrastructure',
        severity: 'warning',
        current: 'No Docker configuration',
        suggested: 'Docker + Docker Compose',
        reason: 'No Dockerfile or docker-compose.yml found. Containerization is essential for consistent dev/prod environments.',
        benefit: 'Reproducible environments, easier onboarding, and deployment flexibility.',
        effort: 'low',
        priority: 'medium',
        tags: ['devops', 'reliability']
      };
    }
    return null;
  },

  ({ stack }) => {
    if (!stack.hasCI) {
      return {
        ruleId: 'INFRA_002',
        category: 'CI/CD',
        severity: 'critical',
        current: 'No CI/CD pipeline detected',
        suggested: 'GitHub Actions or GitLab CI',
        reason: 'No continuous integration configuration found. Manual deployments are error-prone and slow.',
        benefit: 'Automated testing, linting, and deployment on every commit.',
        effort: 'low',
        priority: 'high',
        tags: ['devops', 'quality', 'reliability']
      };
    }
    return null;
  },

  // --- React specific ---
  ({ stack }) => {
    if (stack.frontend.includes('React') && !stack.frontend.includes('Next.js')) {
      const hasCRA =
        stack.devDependencies.includes('react-scripts') ||
        stack.dependencies.includes('react-scripts');
      if (hasCRA) {
        return {
          ruleId: 'FRONTEND_001',
          category: 'Frontend Framework',
          severity: 'critical',
          current: 'Create React App (CRA)',
          suggested: 'Vite + React or Next.js',
          reason: 'Create React App is no longer maintained and has significantly slower build times.',
          benefit: 'Active maintenance, faster builds, modern tooling, and better DX.',
          effort: 'medium',
          priority: 'high',
          tags: ['maintainability', 'performance', 'developer-experience']
        };
      }
    }
    return null;
  },

  // --- Python specific ---
  ({ stack }) => {
    if (stack.backend.includes('Flask') && stack.language === 'Python') {
      return {
        ruleId: 'PYTHON_001',
        category: 'Backend Framework',
        severity: 'info',
        current: 'Flask',
        suggested: 'FastAPI',
        reason: 'FastAPI provides async support, automatic OpenAPI docs, and Pydantic validation out of the box.',
        benefit: 'Better performance, automatic API documentation, and type-safe request handling.',
        effort: 'medium',
        priority: 'medium',
        tags: ['performance', 'developer-experience', 'scalability']
      };
    }
    return null;
  },

  // --- TypeScript rules ---
  ({ stack, fileCount }) => {
    if (stack.language === 'JavaScript/TypeScript' && !stack.hasTypeScript && fileCount > 50) {
      return {
        ruleId: 'LANG_001',
        category: 'Language',
        severity: 'warning',
        current: 'JavaScript',
        suggested: 'TypeScript',
        reason: `Large JavaScript project (${fileCount}+ files) without TypeScript. Type errors are caught at runtime instead of compile time.`,
        benefit: 'Catch bugs at compile time, better IDE support, safer refactoring.',
        effort: 'high',
        priority: 'high',
        tags: ['quality', 'maintainability', 'developer-experience']
      };
    }
    return null;
  }
];

export function runRuleEngine(
  stack: DetectedStack,
  componentCount: number,
  apiRouteCount: number,
  fileCount: number,
  testFileCount = 0
): RuleEngineResult {
  const ctx: RuleContext = { stack, componentCount, apiRouteCount, fileCount, testFileCount };
  const findings: RuleFinding[] = [];

  for (const rule of RULES) {
    const finding = rule(ctx);
    if (finding) {
      findings.push({
        ...finding,
        evidence: finding.evidence?.length ? finding.evidence : buildEvidence(ctx, finding)
      });
    }
  }

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  const infoCount = findings.filter(f => f.severity === 'info').length;

  // Sort by severity priority
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { findings, totalFindings: findings.length, criticalCount, warningCount, infoCount };
}

export function formatRuleFindingsForLLM(result: RuleEngineResult): string {
  if (result.findings.length === 0) return 'No rule-based findings.';

  return result.findings
    .map(f => [
      `[${f.severity.toUpperCase()}] ${f.category}: ${f.current} -> ${f.suggested}`,
      `Evidence: ${f.evidence.join('; ')}`,
      `Reason: ${f.reason}`,
      `Benefit: ${f.benefit}`
    ].join('\n'))
    .join('\n\n');
}

function buildEvidence(ctx: RuleContext, finding: RawRuleFinding): string[] {
  const { stack } = ctx;
  const list = (items: string[]) => items.length ? items.join(', ') : 'none detected';

  switch (finding.category) {
    case 'Testing':
      return [
        `Test files detected: ${ctx.testFileCount}`,
        `Testing frameworks detected: ${list(stack.testing)}`
      ];
    case 'CI/CD':
      return [`CI/CD configuration detected: ${stack.hasCI ? 'yes' : 'no'}`];
    case 'Infrastructure':
      return [
        `Docker configuration detected: ${stack.hasDocker ? 'yes' : 'no'}`,
        `Backend frameworks detected: ${list(stack.backend)}`
      ];
    case 'Backend Framework':
      return [
        `Backend frameworks detected: ${list(stack.backend)}`,
        `API routes detected: ${ctx.apiRouteCount}`,
        `TypeScript detected: ${stack.hasTypeScript ? 'yes' : 'no'}`
      ];
    case 'Database Access':
      return [`Database and ORM libraries detected: ${list(stack.databases)}`];
    case 'Styling System':
      return [
        `Styling systems detected: ${list(stack.styling)}`,
        `Components detected: ${ctx.componentCount}`
      ];
    case 'Build Tool':
      return [`Build tools detected: ${list(stack.buildTools)}`];
    case 'Package Manager':
      return [
        `Package manager detected: ${stack.packageManager ?? 'none detected'}`,
        `Development dependencies detected: ${stack.devDependencies.length}`
      ];
    case 'Frontend Framework':
      return [
        `Frontend frameworks detected: ${list(stack.frontend)}`,
        `Dependencies detected: ${list(stack.dependencies)}`
      ];
    case 'Language':
      return [
        `Primary language detected: ${stack.language}`,
        `TypeScript detected: ${stack.hasTypeScript ? 'yes' : 'no'}`,
        `Files detected: ${ctx.fileCount}`
      ];
    default:
      return [
        `Project type: ${stack.projectType}`,
        `Primary language: ${stack.language}`
      ];
  }
}
