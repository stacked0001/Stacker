import { REASONING_SYSTEM_PROMPT, buildReasoningPrompt, ReasoningPromptOptions } from '../prompts/reasoningPrompt';
import { validateModelId, auditLog } from '../security';
import { callProxy, AuthError } from '../api/proxyClient';

export interface Suggestion {
  category: string;
  current: string;
  suggested: string;
  reason: string;
  benefit: string;
  tradeoffs: string;
  alternatives: string;
  migrationNotes: string;
  priority: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
}

export interface ScoreSet {
  overall: number;
  performance: number;
  developerExperience: number;
  maintainability: number;
  scalability: number;
}

export interface ReasoningResult {
  suggestions: Suggestion[];
  scores: {
    current: ScoreSet;
    optimized: ScoreSet;
  };
  strengths: string[];
  summary: string;
}

const VALID_LEVELS = new Set(['low', 'medium', 'high']);

export async function runReasoningModel(
  projectSummary: string,
  analysisResult: string,
  ruleFindings: string,
  options?: ReasoningPromptOptions
): Promise<ReasoningResult> {
  const model = process.env.STACKER_REASONING_MODEL || 'openai/gpt-oss-120b';
  validateModelId(model);

  const prompt = buildReasoningPrompt(projectSummary, analysisResult, ruleFindings, options);
  const startTime = Date.now();

  auditLog({ action: 'api_call', model, outcome: 'success', detail: 'reasoning request sent' });

  let content: string;
  try {
    const response = await callProxy(
      {
        provider: 'groq',
        model,
        messages: [
          { role: 'system', content: REASONING_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 4096,
        response_format: { type: 'json_object' }
      },
      Number(process.env.STACKER_TIMEOUT) || 30000
    );

    const choices = response?.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error('Reasoning model returned no choices.');
    }
    content = choices[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error('Reasoning model returned empty content.');
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
    throw new Error(`Reasoning model returned non-JSON: ${content.slice(0, 200)}`);
  }

  return normalizeReasoningResult(parsed);
}

function normalizeReasoningResult(raw: Record<string, unknown>): ReasoningResult {
  const suggestions = Array.isArray(raw.suggestions)
    ? raw.suggestions.map(normalizeSuggestion).filter(Boolean) as Suggestion[]
    : [];

  const scoresRaw = raw.scores as Record<string, unknown> | undefined;

  return {
    suggestions,
    scores: {
      current: normalizeScoreSet(scoresRaw?.current),
      optimized: normalizeScoreSet(scoresRaw?.optimized)
    },
    strengths: Array.isArray(raw.strengths) ? raw.strengths.filter((s: unknown) => typeof s === 'string') : [],
    summary: typeof raw.summary === 'string' ? raw.summary : ''
  };
}

function normalizeSuggestion(raw: unknown): Suggestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  return {
    category: typeof s.category === 'string' ? s.category : 'General',
    current: typeof s.current === 'string' ? s.current : 'Unknown',
    suggested: typeof s.suggested === 'string' ? s.suggested : 'Unknown',
    reason: typeof s.reason === 'string' ? s.reason : '',
    benefit: typeof s.benefit === 'string' ? s.benefit : '',
    tradeoffs: typeof s.tradeoffs === 'string' ? s.tradeoffs : '',
    alternatives: typeof s.alternatives === 'string' ? s.alternatives : '',
    migrationNotes: typeof s.migrationNotes === 'string' ? s.migrationNotes : '',
    priority: VALID_LEVELS.has(s.priority as string) ? (s.priority as Suggestion['priority']) : 'medium',
    effort: VALID_LEVELS.has(s.effort as string) ? (s.effort as Suggestion['effort']) : 'medium'
  };
}

function normalizeScoreSet(raw: unknown): ScoreSet {
  if (typeof raw !== 'object' || raw === null) {
    return { overall: 5, performance: 5, developerExperience: 5, maintainability: 5, scalability: 5 };
  }
  const s = raw as Record<string, unknown>;
  const clamp = (v: unknown) => { const n = Number(v); return Number.isNaN(n) ? 5 : Math.max(0, Math.min(10, n)); };
  return {
    overall: clamp(s.overall),
    performance: clamp(s.performance),
    developerExperience: clamp(s.developerExperience),
    maintainability: clamp(s.maintainability),
    scalability: clamp(s.scalability)
  };
}

export { AuthError };
