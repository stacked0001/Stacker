import { SECURITY_SYSTEM_PROMPT, buildSecurityPrompt, SecurityPromptOptions, SecurityFindings, normalizeSecurityFindings } from '../prompts/securityPrompt';
import { validateModelId, auditLog } from '../security';
import { callProxy, AuthError } from '../api/proxyClient';

export async function runSecurityModel(projectSummary: string, options?: SecurityPromptOptions): Promise<SecurityFindings> {
  const model = process.env.STACKER_ANALYSIS_MODEL || 'moonshotai/kimi-k2-instruct';
  validateModelId(model);

  const prompt = buildSecurityPrompt(projectSummary, options);
  const startTime = Date.now();

  auditLog({ action: 'api_call', model, outcome: 'success', detail: 'security analysis request sent' });

  let content: string;
  try {
    const response = await callProxy(
      {
        provider: 'groq',
        model,
        messages: [
          { role: 'system', content: SECURITY_SYSTEM_PROMPT },
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
      throw new Error('Security model returned no choices.');
    }
    content = choices[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error('Security model returned empty content.');
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
    throw new Error(`Security model returned non-JSON: ${content.slice(0, 200)}`);
  }

  return normalizeSecurityFindings(parsed);
}

export { AuthError };
