import type { Env } from './index';

export interface AuthResult {
  valid: boolean;
  error?: string;
}

export async function validateAuth(token: string, machineId: string, env: Env): Promise<AuthResult> {
  if (!token || !token.startsWith('ptai_') || token.length < 20) {
    return { valid: false, error: 'Invalid token format' };
  }

  if (!machineId || machineId.length !== 64 || !/^[0-9a-f]+$/.test(machineId)) {
    return { valid: false, error: 'Invalid machine ID format' };
  }

  // Look up registered machine ID for this token
  const storedMachineId = await env.TOKENS.get(`token:${token}`);

  if (storedMachineId === null) {
    return { valid: false, error: 'Token not found or revoked' };
  }

  // 'unbound' = first use: bind this token to the requesting machine
  if (storedMachineId === 'unbound') {
    await env.TOKENS.put(`token:${token}`, machineId);
    return { valid: true };
  }

  // 'any' = allow any machine (for shared/testing tokens)
  if (storedMachineId === 'any') {
    return { valid: true };
  }

  if (storedMachineId !== machineId) {
    return { valid: false, error: 'Token is registered to a different machine' };
  }

  return { valid: true };
}
