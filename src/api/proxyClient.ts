import axios, { AxiosError } from 'axios';
import * as https from 'https';
import { loadToken, saveToken, AuthConfig } from '../auth/tokenStore';
import { getMachineFingerprint } from '../auth/fingerprint';
import { signRequest } from '../auth/signing';

const PROXY_URL = process.env.STACKER_PROXY_URL ?? 'https://stacker-proxy.ptgeneral.workers.dev/v1/compute';

// Force HTTP/1.1 ALPN — required for Cloudflare Workers compatibility with Node.js
const httpsAgent = new https.Agent({ ALPNProtocols: ['http/1.1'] });

let pkg: { version: string } = { version: '0.0.0' };
try { pkg = require('../../package.json'); } catch {}

export interface ProxyRequest {
  provider: 'groq' | 'openai' | 'anthropic';
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
}

export interface ProxyResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

async function autoRegister(): Promise<AuthConfig> {
  const machine_id = getMachineFingerprint();
  const response = await axios.post<{ token: string }>(
    PROXY_URL.replace('/v1/compute', '/auth/register'),
    { machine_id },
    { httpsAgent, timeout: 15000 }
  );
  const token = response.data?.token;
  if (!token) throw new Error('Registration failed: no token returned');
  saveToken(token);
  return { token, machine_id };
}

export async function callProxy(req: ProxyRequest, timeout = 30000): Promise<ProxyResponse> {
  let auth = loadToken();

  // No token yet — auto-register this machine silently
  if (!auth) {
    try {
      auth = await autoRegister();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      const detail = (axiosErr.response?.data as any)?.error ?? (err as Error).message;
      throw new AuthError(`Could not activate Stacker: ${detail}`);
    }
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signRequest(auth.token, timestamp);

  try {
    const response = await axios.post<ProxyResponse>(PROXY_URL, req, {
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'x-ptai-machine-id': auth.machine_id,
        'x-ptai-version': pkg.version,
        'x-ptai-timestamp': String(timestamp),
        'x-ptai-signature': signature,
        'Content-Type': 'application/json',
        'User-Agent': `stacker-cli/${pkg.version}`
      },
      httpsAgent,
      timeout
    });
    return response.data;
  } catch (err) {
    const axiosErr = err as AxiosError<{ error?: string }>;
    const status = axiosErr.response?.status;
    const detail = (axiosErr.response?.data as any)?.error ?? axiosErr.message;

    if (status === 401) throw new AuthError('Session expired. Run: stacker login');
    if (status === 429) throw new Error('Rate limit exceeded. Please try again shortly.');
    if (status === 426) throw new Error('Stacker is outdated. Run: npm install -g stacker-cli');
    throw new Error(`Request failed: ${detail}`);
  }
}
