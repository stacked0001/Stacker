import { StackerReport } from './reportGenerator';

export function createDemoReport(): StackerReport {
  return {
    repoName: 'demo-saas-app',
    analyzedAt: '2026-05-05T00:00:00.000Z',
    mode: 'codebase',
    stack: {
      language: 'TypeScript',
      projectType: 'Full-Stack Web App (Next.js)',
      frontend: ['Next.js'],
      backend: ['tRPC'],
      databases: ['PostgreSQL'],
      styling: ['Tailwind CSS'],
      testing: [],
      buildTools: ['Vite'],
      packageManager: 'npm',
      dependencies: ['next', 'react', '@trpc/server', 'pg'],
      devDependencies: ['typescript', 'vite'],
      hasDocker: false,
      hasCI: false,
      hasTypeScript: true
    },
    stats: {
      fileCount: 214,
      componentCount: 68,
      apiRouteCount: 37,
      lineCount: 18420,
      testFileCount: 0,
      configFileCount: 9,
      filesByExtension: {
        '.ts': 91,
        '.tsx': 76,
        '.json': 12,
        '.md': 4
      },
      vulnerabilities: {
        critical: 0,
        high: 1,
        moderate: 2,
        low: 0,
        total: 3,
        advisories: [
          {
            name: 'example-package',
            severity: 'high',
            title: 'Prototype pollution in request parsing',
            url: 'https://github.com/advisories'
          }
        ]
      },
      secretFindings: {
        filesScanned: 167,
        findings: []
      },
      complexity: {
        averageComplexity: 9.8,
        maxComplexity: 47,
        totalFunctions: 412,
        linesPerFunction: 18,
        highComplexityFiles: [
          { file: 'src/app/dashboard/page.tsx', complexity: 47, functions: 18 },
          { file: 'src/server/billing.ts', complexity: 39, functions: 14 }
        ],
        duplicationRisk: 'medium',
        testFilesExcluded: 0
      }
    },
    architecture: {
      patterns: ['Full-Stack SSR'],
      hasMonorepoSetup: false,
      hasServerlessConfig: true,
      hasApiLayer: true,
      hasFrontendLayer: true,
      hasBackendLayer: true,
      hasDatabaseLayer: true,
      layerCount: 3,
      scalabilitySignals: ['Serverless deployment', 'TypeScript throughout the application'],
      complexitySignals: ['No test coverage detected', 'No CI/CD pipeline'],
      description: 'Full-Stack SSR written in TypeScript with ~18,420 lines of code'
    },
    ruleResults: {
      findings: [],
      totalFindings: 0,
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0
    },
    reasoning: {
      suggestions: [],
      scores: {
        current: {
          overall: 6.8,
          performance: 7.2,
          developerExperience: 7.0,
          maintainability: 5.8,
          scalability: 6.3
        },
        optimized: {
          overall: 8.4,
          performance: 7.8,
          developerExperience: 8.5,
          maintainability: 8.2,
          scalability: 8.0
        }
      },
      strengths: [
        'Modern TypeScript stack with server-rendered frontend',
        'PostgreSQL is a strong fit for transactional product data'
      ],
      summary: 'This repo has a strong product stack, but missing tests and CI make changes risky. Add a small test baseline, CI, and deployment health checks before scaling the team.'
    },
    merged: [
      {
        id: 'DEMO_TESTING_001',
        source: 'rule',
        category: 'Testing',
        current: 'No test framework or test files detected',
        suggested: 'Add Vitest for unit tests and Playwright for critical flows',
        reason: 'The repository has production-facing billing and dashboard code, but no automated regression checks.',
        benefit: 'Prevents silent breakage in core user flows and makes refactors safer.',
        priority: 'high',
        effort: 'medium',
        severity: 'critical',
        tags: ['quality', 'reliability'],
        evidence: ['Test files detected: 0', 'Testing frameworks detected: none detected']
      },
      {
        id: 'DEMO_INFRA_002',
        source: 'rule',
        category: 'CI/CD',
        current: 'No CI/CD pipeline detected',
        suggested: 'Add GitHub Actions for type-check, test, and Stacker report comments',
        reason: 'Manual validation makes every pull request depend on developer memory.',
        benefit: 'Every PR gets repeatable checks and a visible codebase health report.',
        priority: 'high',
        effort: 'low',
        severity: 'critical',
        tags: ['devops', 'quality'],
        evidence: ['CI/CD configuration detected: no']
      },
      {
        id: 'DEMO_DEPLOY_001',
        source: 'ai',
        category: 'Deployment Readiness',
        current: 'No Dockerfile or health check detected',
        suggested: 'Add a health endpoint and deployment smoke check',
        reason: 'Server-rendered apps need a fast way to prove the deployed process is healthy after release.',
        benefit: 'Reduces broken deployments and shortens incident diagnosis.',
        priority: 'medium',
        effort: 'low',
        evidence: ['Docker configuration detected: no', 'Serverless deployment config detected: yes']
      }
    ],
    securityFindings: {
      score: 7.2,
      summary: 'No hardcoded secrets were found in this demo, but dependency updates and safer HTML rendering should be reviewed before launch.',
      findings: [
        {
          title: 'Dependency advisories need triage',
          severity: 'high',
          category: 'Dependencies',
          description: 'The package tree contains high and moderate advisories that should be reviewed before release.',
          recommendation: 'Run npm audit fix where safe, then manually review any semver-major upgrades.',
          effort: 'medium',
          references: 'https://docs.npmjs.com/cli/commands/npm-audit'
        }
      ],
      strengths: ['No source secrets detected in scanned files']
    },
    deploymentRecommendations: {
      score: 5.9,
      summary: 'Deployment can be made reliable with CI, a health check, and a documented rollback path.',
      recommendations: [
        {
          title: 'Add PR and release automation',
          priority: 'high',
          category: 'CI/CD',
          description: 'No automated workflow is present for pull requests or deployment readiness.',
          implementation: 'Add GitHub Actions that run type-check, tests, and stacker codebase . --format markdown.',
          effort: 'low',
          impact: 'Makes code review faster and catches regressions before merge.'
        }
      ],
      strengths: ['Serverless-compatible application shape']
    }
  };
}
