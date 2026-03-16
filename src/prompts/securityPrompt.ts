export const SECURITY_SYSTEM_PROMPT = `You are a security-focused code review AI specializing in identifying vulnerabilities and security risks in software projects.

Your job is to analyze a project's structure, dependencies, configuration, and patterns to identify security issues based on OWASP Top 10 and industry best practices.

Focus areas:
1. OWASP Top 10 risks (injection, broken auth, sensitive data exposure, XXE, broken access control, security misconfiguration, XSS, insecure deserialization, known vulnerabilities, insufficient logging)
2. Hardcoded secrets and credentials (API keys, passwords, tokens in code or config files)
3. Dependency vulnerabilities (outdated packages, known-risky libraries, abandoned dependencies)
4. Authentication and authorization patterns (missing auth middleware, insecure session handling, weak password policies)
5. Input validation issues (missing sanitization, lack of schema validation, unchecked user input)
6. HTTPS/TLS configuration (HTTP endpoints, self-signed certs, weak cipher suites)
7. Security headers (missing CSP, X-Frame-Options, HSTS, X-Content-Type-Options)
8. Rate limiting presence (no rate limiting on auth endpoints, API endpoints)
9. Sensitive data exposure (PII in logs, unencrypted storage, excessive data in API responses)
10. Environment configuration security (secrets in .env committed to repo, insecure defaults)

Severity levels:
- critical: Immediate risk, exploitable vulnerability, data breach possible
- high: Significant risk, should be fixed before production
- medium: Moderate risk, should be addressed in next sprint
- low: Minor risk or best practice improvement
- info: Informational, good to know

Output structured JSON only. Do not include any explanation or markdown. Return valid JSON.

The JSON schema must follow this structure:
{
  "findings": [
    {
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "category": string,
      "title": string,
      "description": string,
      "recommendation": string,
      "effort": "low" | "medium" | "high",
      "references": string
    }
  ],
  "score": number,
  "summary": string,
  "strengths": string[]
}

"score" is a security score from 0-10 (10 = most secure). Be realistic and calibrated.
"strengths" lists concrete positive security practices already in place.`;

export interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  recommendation: string;
  effort: 'low' | 'medium' | 'high';
  references: string;
}

export interface SecurityFindings {
  findings: SecurityFinding[];
  score: number;
  summary: string;
  strengths: string[];
}

export interface SecurityPromptOptions {
  projectType: string;
  hasTypeScript: boolean;
  hasDocker: boolean;
  hasCI: boolean;
  testFileCount: number;
  vulnerabilities?: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    total: number;
  };
  secretFindingsCount?: number;
  highComplexityFiles?: Array<{ file: string; complexity: number }>;
}

export function buildSecurityPrompt(summary: string, options?: SecurityPromptOptions): string {
  const contextHeader = options
    ? `PROJECT CONTEXT (pre-detected):
- Project Type: ${options.projectType}
- TypeScript: ${options.hasTypeScript ? 'YES' : 'NO'}
- Docker: ${options.hasDocker ? 'YES' : 'NO'}
- CI/CD: ${options.hasCI ? 'YES' : 'NO'}
- Test Files Found: ${options.testFileCount}

IMPORTANT: Analyze for security vulnerabilities appropriate to a "${options.projectType}". Focus on realistic threats for this project type.

`
    : '';

  const automatedScanSection = options && (
    options.vulnerabilities || options.secretFindingsCount !== undefined || options.highComplexityFiles
  )
    ? `AUTOMATED SCAN RESULTS (use this real data in your analysis):
${options.vulnerabilities
  ? `- Dependency vulnerabilities: ${options.vulnerabilities.critical} critical, ${options.vulnerabilities.high} high, ${options.vulnerabilities.moderate} moderate, ${options.vulnerabilities.low} low`
  : '- Dependency vulnerabilities: not scanned'}
- Secrets/credentials found: ${options.secretFindingsCount ?? 0} findings
${options.highComplexityFiles && options.highComplexityFiles.length > 0
  ? `- High complexity files: ${options.highComplexityFiles.slice(0, 5).map(f => f.file).join(', ')}`
  : '- High complexity files: none detected'}

`
    : '';

  return `${contextHeader}${automatedScanSection}Perform a security analysis on this project and return structured JSON:

${summary}

Return only valid JSON matching the schema. No markdown, no explanation.`;
}

export function normalizeSecurityFindings(raw: Record<string, unknown>): SecurityFindings {
  const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);
  const VALID_EFFORTS = new Set(['low', 'medium', 'high']);

  const findings: SecurityFinding[] = Array.isArray(raw.findings)
    ? raw.findings
        .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
        .map(f => ({
          severity: VALID_SEVERITIES.has(f.severity as string)
            ? (f.severity as SecurityFinding['severity'])
            : 'medium',
          category: typeof f.category === 'string' ? f.category : 'General',
          title: typeof f.title === 'string' ? f.title : 'Security Issue',
          description: typeof f.description === 'string' ? f.description : '',
          recommendation: typeof f.recommendation === 'string' ? f.recommendation : '',
          effort: VALID_EFFORTS.has(f.effort as string)
            ? (f.effort as SecurityFinding['effort'])
            : 'medium',
          references: typeof f.references === 'string' ? f.references : ''
        }))
    : [];

  const scoreRaw = Number(raw.score);
  const score = Number.isNaN(scoreRaw) ? 5 : Math.max(0, Math.min(10, scoreRaw));

  return {
    findings,
    score,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    strengths: Array.isArray(raw.strengths)
      ? raw.strengths.filter((s): s is string => typeof s === 'string')
      : []
  };
}
