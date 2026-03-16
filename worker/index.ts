import { validateAuth } from './auth';
import { checkRateLimit } from './rateLimiter';
import { verifySignature } from './signature';

export interface Env {
  TOKENS: KVNamespace;
  GROQ_API_KEY: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  MIN_VERSION: string;
  ADMIN_SECRET: string;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MIN_VERSION = '1.0.0';

// Block browser-originated requests
const BROWSER_AGENTS = ['Mozilla/', 'Chrome/', 'Safari/', 'Firefox/'];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Auto-register: CLI calls this on first use to get a token automatically
    // Rate limited: 1 registration per IP per day
    if (request.method === 'POST' && url.pathname === '/auth/register') {
      return handleAutoRegister(request, env);
    }

    // Auth login page — served to browser (stacker login opens this)
    if (request.method === 'GET' && url.pathname === '/auth/login') {
      return serveLoginPage(url);
    }

    // Auth verify — called by the login page JS to validate token + issue redirect
    if (request.method === 'POST' && url.pathname === '/auth/verify') {
      return handleAuthVerify(request, env);
    }

    // Admin: register a token → machine_id mapping in KV
    // POST /admin/token  body: { token, machine_id }  header: x-admin-secret
    if (request.method === 'POST' && url.pathname === '/admin/token') {
      return handleAdminToken(request, env);
    }

    // Admin: revoke a token
    // DELETE /admin/token  body: { token }  header: x-admin-secret
    if (request.method === 'DELETE' && url.pathname === '/admin/token') {
      return handleAdminRevoke(request, env);
    }

    if (request.method !== 'POST' || url.pathname !== '/v1/compute') {
      return json({ error: 'Not found' }, 404);
    }

    // Block browser user agents
    const userAgent = request.headers.get('user-agent') ?? '';
    if (BROWSER_AGENTS.some(a => userAgent.includes(a))) {
      return json({ error: 'Forbidden: browser clients not allowed' }, 403);
    }

    // Extract and validate required headers
    const authorization = request.headers.get('authorization') ?? '';
    const machineId = request.headers.get('x-ptai-machine-id') ?? '';
    const version = request.headers.get('x-ptai-version') ?? '';
    const timestamp = request.headers.get('x-ptai-timestamp') ?? '';
    const signature = request.headers.get('x-ptai-signature') ?? '';

    if (!authorization.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const token = authorization.slice(7);

    // Version enforcement
    const minVersion = env.MIN_VERSION ?? DEFAULT_MIN_VERSION;
    if (!isVersionAtLeast(version, minVersion)) {
      return json({ error: `Client version ${version} is outdated. Minimum: ${minVersion}. Run: npm install -g stacker-cli` }, 426);
    }

    // Signature + timestamp verification (prevents replay attacks)
    const sigResult = await verifySignature(token, timestamp, signature);
    if (!sigResult.valid) {
      return json({ error: sigResult.error ?? 'Invalid signature' }, 401);
    }

    // Token + machine ID validation against KV
    const authResult = await validateAuth(token, machineId, env);
    if (!authResult.valid) {
      return json({ error: authResult.error ?? 'Unauthorized' }, 401);
    }

    // Rate limiting: 60 req/min per token
    const rateLimitResult = await checkRateLimit(token, env);
    if (!rateLimitResult.allowed) {
      return json(
        { error: 'Rate limit exceeded. Please wait and try again.' },
        429,
        { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) }
      );
    }

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const provider = typeof body.provider === 'string' ? body.provider : 'groq';
    return forwardToProvider(provider, body, env);
  }
};

async function forwardToProvider(
  provider: string,
  body: Record<string, unknown>,
  env: Env
): Promise<Response> {
  let upstreamUrl: string;
  let apiKey: string;

  switch (provider) {
    case 'groq':
      upstreamUrl = GROQ_URL;
      apiKey = env.GROQ_API_KEY;
      break;
    case 'openai':
      upstreamUrl = OPENAI_URL;
      apiKey = env.OPENAI_API_KEY;
      break;
    default:
      return json({ error: `Unsupported provider: ${provider}` }, 400);
  }

  if (!apiKey) {
    return json({ error: 'Provider not configured on server' }, 503);
  }

  // Strip proxy-specific fields before forwarding
  const { provider: _p, ...forwardBody } = body;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(forwardBody)
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      const errMsg = (data as any)?.error?.message ?? 'Upstream provider error';
      return json({ error: errMsg }, upstream.status >= 500 ? 502 : upstream.status);
    }

    return json(data, 200);
  } catch {
    return json({ error: 'Failed to reach AI provider' }, 502);
  }
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(), ...extraHeaders }
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-ptai-machine-id, x-ptai-version, x-ptai-timestamp, x-ptai-signature'
  };
}

async function handleAutoRegister(request: Request, env: Env): Promise<Response> {
  // Block browser clients from auto-registering
  const userAgent = request.headers.get('user-agent') ?? '';
  if (BROWSER_AGENTS.some(a => userAgent.includes(a))) {
    return json({ error: 'Forbidden' }, 403);
  }

  let body: Record<string, string>;
  try { body = await request.json() as Record<string, string>; } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { machine_id } = body;
  if (!machine_id || machine_id.length !== 64 || !/^[0-9a-f]+$/.test(machine_id)) {
    return json({ error: 'Invalid machine ID' }, 400);
  }

  // Check if this machine already has a token — don't issue duplicates
  const existingToken = await env.TOKENS.get(`machine:${machine_id}`);
  if (existingToken) {
    return json({ token: existingToken }, 200);
  }

  // Rate limit by IP: max 3 registrations per IP per day
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const today = new Date().toISOString().slice(0, 10);
  const ipKey = `reg-ip:${ip}:${today}`;
  const ipCount = parseInt(await env.TOKENS.get(ipKey) ?? '0', 10);
  if (ipCount >= 3) {
    return json({ error: 'Too many registrations from this network. Try again tomorrow.' }, 429);
  }

  // Generate token and bind it to this machine immediately
  const tokenBytes = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const token = `ptai_${tokenBytes}`;

  await env.TOKENS.put(`token:${token}`, machine_id);
  await env.TOKENS.put(`machine:${machine_id}`, token);
  await env.TOKENS.put(ipKey, String(ipCount + 1), { expirationTtl: 86400 });

  return json({ token }, 201);
}

function serveLoginPage(url: URL): Response {
  const machineId = url.searchParams.get('machine_id') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stacker — Authenticate</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#111;border:1px solid #222;border-radius:12px;padding:2.5rem;width:100%;max-width:420px}
    h1{font-size:1.4rem;margin-bottom:.5rem}
    p{color:#9ca3af;font-size:.9rem;margin-bottom:1.5rem;line-height:1.5}
    label{display:block;font-size:.85rem;color:#d1d5db;margin-bottom:.4rem}
    input{width:100%;padding:.7rem 1rem;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:.95rem;outline:none;transition:border .2s}
    input:focus{border-color:#3b82f6}
    button{width:100%;margin-top:1rem;padding:.8rem;background:#3b82f6;border:none;border-radius:8px;color:#fff;font-size:1rem;cursor:pointer;font-weight:600;transition:background .2s}
    button:hover{background:#2563eb}
    .error{color:#f87171;font-size:.85rem;margin-top:.75rem;display:none}
    .logo{font-weight:800;letter-spacing:-.5px;color:#3b82f6;margin-bottom:1.5rem;font-size:1.1rem}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⬡ Stacker</div>
    <h1>Enter your access token</h1>
    <p>Paste the token from your Stacker account dashboard to authenticate this device.</p>
    <form id="f">
      <label for="tok">Access Token</label>
      <input id="tok" type="password" placeholder="ptai_..." autocomplete="off" required>
      <button type="submit">Authenticate</button>
      <div class="error" id="err"></div>
    </form>
  </div>
  <script>
    document.getElementById('f').addEventListener('submit', async e => {
      e.preventDefault();
      const token = document.getElementById('tok').value.trim();
      const errEl = document.getElementById('err');
      errEl.style.display = 'none';
      if (!token.startsWith('ptai_') || token.length < 20) {
        errEl.textContent = 'Invalid token format.';
        errEl.style.display = 'block';
        return;
      }
      try {
        const res = await fetch('/auth/verify', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ token, machine_id: '${machineId}', state: '${state}', redirect_uri: '${redirectUri}' })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error ?? 'Authentication failed.'; errEl.style.display = 'block'; return; }
        window.location.href = data.redirect;
      } catch {
        errEl.textContent = 'Network error. Try again.';
        errEl.style.display = 'block';
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handleAuthVerify(request: Request, env: Env): Promise<Response> {
  let body: Record<string, string>;
  try { body = await request.json() as Record<string, string>; } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { token, machine_id, state, redirect_uri } = body;
  if (!token?.startsWith('ptai_') || token.length < 20) return json({ error: 'Invalid token format' }, 400);
  if (!machine_id || machine_id.length !== 64) return json({ error: 'Invalid machine ID' }, 400);
  if (!redirect_uri) return json({ error: 'Missing redirect_uri' }, 400);

  const storedMachineId = await env.TOKENS.get(`token:${token}`);
  if (!storedMachineId) return json({ error: 'Token not found or not yet registered' }, 401);
  if (storedMachineId !== 'any' && storedMachineId !== machine_id) {
    // First use: bind this token to this machine
    if (storedMachineId === 'unbound') {
      await env.TOKENS.put(`token:${token}`, machine_id);
    } else {
      return json({ error: 'Token is registered to a different machine' }, 401);
    }
  }

  const callbackUrl = new URL(redirect_uri);
  callbackUrl.searchParams.set('token', token);
  if (state) callbackUrl.searchParams.set('state', state);

  return json({ redirect: callbackUrl.toString() }, 200);
}

async function handleAdminToken(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('x-admin-secret');
  if (!secret || secret !== env.ADMIN_SECRET) return json({ error: 'Forbidden' }, 403);

  let body: Record<string, string>;
  try { body = await request.json() as Record<string, string>; } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { token, machine_id } = body;
  if (!token?.startsWith('ptai_') || token.length < 20) return json({ error: 'Invalid token format. Must start with ptai_' }, 400);

  // machine_id can be 'unbound' (binds on first use), 'any' (allow any machine), or a specific sha256 hex
  await env.TOKENS.put(`token:${token}`, machine_id ?? 'unbound');
  return json({ ok: true, token, machine_id: machine_id ?? 'unbound' }, 201);
}

async function handleAdminRevoke(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('x-admin-secret');
  if (!secret || secret !== env.ADMIN_SECRET) return json({ error: 'Forbidden' }, 403);

  let body: Record<string, string>;
  try { body = await request.json() as Record<string, string>; } catch { return json({ error: 'Invalid JSON' }, 400); }

  await env.TOKENS.delete(`token:${body.token}`);
  return json({ ok: true }, 200);
}

function isVersionAtLeast(version: string, minimum: string): boolean {
  if (!version || !/^\d+\.\d+\.\d+/.test(version)) return false;
  const parse = (v: string) => v.split('.').map(Number);
  const [ma, mi, pa] = parse(version);
  const [mma, mmi, mpa] = parse(minimum);
  if (ma !== mma) return ma > mma;
  if (mi !== mmi) return mi > mmi;
  return pa >= mpa;
}
