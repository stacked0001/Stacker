// Project types where containerization/server deployment is not applicable
const NON_SERVER_PROJECT_TYPES = new Set([
  'CLI Tool', 'VS Code Extension', 'Library/Package',
  'GitHub Action', 'Browser Extension', 'npm Package'
]);

export function isNonServerProjectType(projectType: string): boolean {
  return NON_SERVER_PROJECT_TYPES.has(projectType) ||
    /cli tool|plugin|extension|library|package|github action/i.test(projectType);
}

export const DEPLOYMENT_SYSTEM_PROMPT = `You are a DevOps and deployment expert specializing in production readiness, CI/CD pipelines, and cloud infrastructure.

Your job is to analyze a project's structure and provide actionable deployment recommendations tailored to the project type and scale.

Focus areas:
1. CI/CD pipeline setup and quality (GitHub Actions, GitLab CI, Jenkins, CircleCI — presence, quality, coverage)
2. Containerization (Dockerfile presence and quality, docker-compose for local dev, multi-stage builds, image optimization)
3. Environment configuration best practices (.env handling, secrets management, config validation at startup)
4. Scaling strategies appropriate to the project type (horizontal scaling, serverless, edge, monolith-first)
5. Cloud provider recommendations with reasoning (AWS, GCP, Azure, Vercel, Railway, Render, Fly.io — match to project type)
6. Health checks and monitoring (readiness/liveness probes, error tracking, uptime monitoring, logging)
7. Rollback strategies (blue-green deployments, feature flags, database migration rollback)
8. Secrets management in deployment (environment variables, secrets managers, vault, no secrets in images)
9. CDN and edge deployment (static asset optimization, edge functions, geographic distribution)
10. Database deployment considerations (migrations, backups, connection pooling, read replicas)

CRITICAL PROJECT-TYPE RULES:
- If the project type is a CLI Tool, Plugin, VS Code Extension, Library/Package, or GitHub Action — DO NOT suggest: Docker containerization, server hosting platforms (Vercel, Railway, Fly.io), health check endpoints, CDN setup, or horizontal scaling. These projects are not deployed as servers.
- For CLI tools and libraries: deployment means npm publish, versioning strategy, changelog automation, and CI for testing across Node versions.
- For VS Code Extensions: deployment means marketplace publishing, auto-update pipelines, and extension packaging.
- For GitHub Actions: deployment means action versioning, testing with act, and publishing to the Actions marketplace.
- Only recommend infrastructure that actually applies to the specific project type.

Priority levels:
- critical: Must be addressed before going to production
- high: Should be implemented for reliable production deployment
- medium: Important for scaling and operational maturity
- low: Nice-to-have improvements

Output structured JSON only. Do not include any explanation or markdown. Return valid JSON.

The JSON schema must follow this structure:
{
  "recommendations": [
    {
      "priority": "critical" | "high" | "medium" | "low",
      "category": string,
      "title": string,
      "description": string,
      "implementation": string,
      "effort": "low" | "medium" | "high",
      "impact": string
    }
  ],
  "score": number,
  "summary": string,
  "strengths": string[]
}

"score" is a deployment readiness score from 0-10 (10 = fully production-ready). Be realistic and calibrated.
"strengths" lists concrete deployment best practices already in place.
"implementation" should be a concrete, actionable step the developer can take immediately.`;

export interface DeploymentRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  implementation: string;
  effort: 'low' | 'medium' | 'high';
  impact: string;
}

export interface DeploymentRecommendations {
  recommendations: DeploymentRecommendation[];
  score: number;
  summary: string;
  strengths: string[];
}

export interface DeploymentPromptOptions {
  projectType: string;
  hasTypeScript: boolean;
  hasDocker: boolean;
  hasCI: boolean;
  testFileCount: number;
  fileCount: number;
}

export function buildDeploymentPrompt(summary: string, options?: DeploymentPromptOptions): string {
  const contextHeader = options
    ? `PROJECT CONTEXT (pre-detected):
- Project Type: ${options.projectType}
- TypeScript: ${options.hasTypeScript ? 'YES' : 'NO'}
- Docker: ${options.hasDocker ? 'YES (Dockerfile present)' : 'NO'}
- CI/CD: ${options.hasCI ? 'YES (pipeline config detected)' : 'NO'}
- Test Files: ${options.testFileCount}
- File Count: ${options.fileCount}

IMPORTANT: Provide deployment recommendations appropriate to a "${options.projectType}" of this scale. Avoid recommending enterprise-level infrastructure for small projects.
${isNonServerProjectType(options.projectType) ? `
THIS PROJECT IS NOT A SERVER APPLICATION. Do NOT suggest:
- Docker / containerization
- Server hosting (Vercel, Railway, Fly.io, Render, AWS EC2/ECS)
- Health check endpoints
- CDN setup
- Horizontal scaling or load balancers
Instead focus on: CI/CD for testing, npm/marketplace publishing, versioning, automated releases, and dependency management.` : ''}
`
    : '';

  return `${contextHeader}Perform a deployment readiness analysis on this project and return structured JSON:

${summary}

Return only valid JSON matching the schema. No markdown, no explanation.`;
}

export function normalizeDeploymentRecommendations(raw: Record<string, unknown>): DeploymentRecommendations {
  const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low']);
  const VALID_EFFORTS = new Set(['low', 'medium', 'high']);

  const recommendations: DeploymentRecommendation[] = Array.isArray(raw.recommendations)
    ? raw.recommendations
        .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
        .map(r => ({
          priority: VALID_PRIORITIES.has(r.priority as string)
            ? (r.priority as DeploymentRecommendation['priority'])
            : 'medium',
          category: typeof r.category === 'string' ? r.category : 'General',
          title: typeof r.title === 'string' ? r.title : 'Deployment Recommendation',
          description: typeof r.description === 'string' ? r.description : '',
          implementation: typeof r.implementation === 'string' ? r.implementation : '',
          effort: VALID_EFFORTS.has(r.effort as string)
            ? (r.effort as DeploymentRecommendation['effort'])
            : 'medium',
          impact: typeof r.impact === 'string' ? r.impact : ''
        }))
    : [];

  const scoreRaw = Number(raw.score);
  const score = Number.isNaN(scoreRaw) ? 5 : Math.max(0, Math.min(10, scoreRaw));

  return {
    recommendations,
    score,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    strengths: Array.isArray(raw.strengths)
      ? raw.strengths.filter((s): s is string => typeof s === 'string')
      : []
  };
}
