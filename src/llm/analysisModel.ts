import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt, AnalysisPromptOptions } from '../prompts/analysisPrompt';
import { validateModelId } from '../security';
import { callProxy, AuthError } from '../api/proxyClient';
import { auditLog } from '../security';

export interface AnalysisResult {
  dependencies: string[];
  devDependencies: string[];
  frameworks: string[];
  patterns: string[];
  concerns: string[];
  projectType: string;
  projectContext: string;
  scalabilityNotes: string;
  testingNotes: string;
  summary: string;
}

export async function runAnalysisModel(projectSummary: string, options?: AnalysisPromptOptions): Promise<AnalysisResult> {
  const model = process.env.STACKER_ANALYSIS_MODEL || 'moonshotai/kimi-k2-instruct';
  validateModelId(model);

  const prompt = buildAnalysisPrompt(projectSummary, options);
  const startTime = Date.now();

  auditLog({ action: 'api_call', model, outcome: 'success', detail: 'analysis request sent' });

  let content: string;
  try {
    const response = await callProxy(
      {
        provider: 'groq',
        model,
        messages: [
          { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 4096,
        response_format: { type: 'json_object' }
      },
      Number(process.env.STACKER_TIMEOUT) || 30000
    );

    const choices = response?.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error('Analysis model returned no choices.');
    }
    content = choices[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error('Analysis model returned empty content.');
  } catch (err) {
    if (err instanceof AuthError) throw err;
    auditLog({ action: 'api_error', model, outcome: 'failure', durationMs: Date.now() - startTime, detail: (err as Error).message });
    throw err;
  }

  auditLog({ action: 'analysis_complete', model, outcome: 'success', durationMs: Date.now() - startTime });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Analysis model returned non-JSON: ${content.slice(0, 200)}`);
  }

  return normalizeAnalysisResult(parsed);
}

function normalizeAnalysisResult(raw: Record<string, unknown>): AnalysisResult {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];

  return {
    dependencies: arr(raw.dependencies),
    devDependencies: arr(raw.devDependencies),
    frameworks: arr(raw.frameworks),
    patterns: arr(raw.patterns),
    concerns: arr(raw.concerns),
    projectType: typeof raw.projectType === 'string' ? raw.projectType : 'Unknown',
    projectContext: typeof raw.projectContext === 'string' ? raw.projectContext : '',
    scalabilityNotes: typeof raw.scalabilityNotes === 'string' ? raw.scalabilityNotes : '',
    testingNotes: typeof raw.testingNotes === 'string' ? raw.testingNotes : '',
    summary: typeof raw.summary === 'string' ? raw.summary : ''
  };
}

export { AuthError };
