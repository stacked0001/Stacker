export const ANALYSIS_SYSTEM_PROMPT = `You are a repository analysis AI specializing in understanding project intent and ecosystem constraints.

Your job is to analyze project structure and output structured data. Before cataloguing frameworks and libraries, you MUST first:

1. IDENTIFY the project type (CLI tool, VS Code extension, web app, library, etc.)
2. UNDERSTAND the ecosystem constraints that type implies (e.g., a CLI tool may intentionally use plain JavaScript for broad compatibility; a plugin must work within the host's module system)
3. ASSESS the project's maturity level (experimental prototype vs. production-grade)
4. LOOK FOR actual code quality signals: test file presence, consistent patterns, documentation, error handling — not just presence/absence of specific tools
5. RECOGNIZE intentional simplicity as a valid architectural choice, not a deficiency

Ecosystem awareness rules:
- A CLI tool using plain JavaScript is NOT missing TypeScript — it may be intentional for compatibility
- A plugin using the host's module system is NOT missing a bundler — it works within constraints
- A project with test files DOES have testing, even if no test framework is in package.json
- A small, focused utility does NOT need Docker, CI/CD, or an ORM
- Monorepos, tools, and plugins have different standards than production web apps

Output structured JSON only. Do not include any explanation or markdown. Return valid JSON.

The JSON schema must follow this structure:
{
  "frameworks": string[],
  "libraries": string[],
  "architecturePatterns": string[],
  "projectScale": "small" | "medium" | "large",
  "projectType": string,
  "projectContext": string,
  "stylingSystems": string[],
  "backendSystems": string[],
  "databases": string[],
  "dependencyGraph": { [key: string]: string[] },
  "estimatedComplexity": "low" | "medium" | "high",
  "hasTypeScript": boolean,
  "testFileCount": number,
  "maturityLevel": "experimental" | "development" | "production",
  "additionalNotes": string
}

"projectContext" is the most important field: describe what this project IS, what it does, what ecosystem it operates in, and what architectural constraints that implies. This will be used by a downstream recommendation model to avoid inappropriate suggestions.`;

export interface AnalysisPromptOptions {
  projectType: string;
  hasTypeScript: boolean;
  testFileCount: number;
  architecturePatterns?: string[];
}

export function buildAnalysisPrompt(summary: string, options?: AnalysisPromptOptions): string {
  const contextHeader = options
    ? `PROJECT CONTEXT (pre-detected):
- Project Type: ${options.projectType}
- TypeScript Detected: ${options.hasTypeScript ? 'YES' : 'NO'}
- Test Files Found: ${options.testFileCount}
- Architecture Patterns: ${options.architecturePatterns?.join(', ') || 'unknown'}

IMPORTANT: This is a "${options.projectType}". Consider the constraints of this ecosystem when analyzing. ${options.testFileCount > 0 ? `There are ${options.testFileCount} test files — testing IS present.` : ''} ${!options.hasTypeScript ? 'JavaScript usage may be intentional for this project type.' : ''}

`
    : '';

  return `${contextHeader}Analyze this project summary and return structured JSON analysis:

${summary}

Return only valid JSON matching the schema. No markdown, no explanation.`;
}
