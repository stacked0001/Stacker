import * as http from 'http';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import chalk from 'chalk';
import { saveToken, clearToken, isLoggedIn } from '../auth/tokenStore';
import { getMachineFingerprint } from '../auth/fingerprint';

const AUTH_BASE = process.env.STACKER_AUTH_URL ?? 'https://stacker-proxy.ptgeneral.workers.dev/auth/login';
const CALLBACK_PORT = 7823;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === 'win32' ? `start "" "${url}"`
    : platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.log(`\n  ${chalk.dim('Open this URL in your browser:')}`);
      console.log(`  ${chalk.cyan(url)}\n`);
    }
  });
}

export async function loginCommand(manualToken?: string): Promise<void> {
  // --token flag: skip browser flow and store token directly
  if (manualToken) {
    if (!manualToken.startsWith('ptai_') || manualToken.length < 20) {
      throw new Error('Invalid token format. Tokens must start with ptai_ and be at least 20 characters.');
    }
    saveToken(manualToken);
    console.log();
    console.log(`  ${chalk.green('✔')} Token stored successfully.`);
    console.log(`  ${chalk.dim('Stored at ~/.ptai/config.json (AES-256-GCM encrypted)')}`);
    console.log();
    return;
  }

  const machine_id = getMachineFingerprint();
  const state = crypto.randomBytes(16).toString('hex');
  const callbackUri = `http://localhost:${CALLBACK_PORT}/callback`;
  const authUrl = `${AUTH_BASE}?machine_id=${machine_id}&state=${state}&redirect_uri=${encodeURIComponent(callbackUri)}`;

  console.log();
  console.log(`  ${chalk.bold('Authenticating...')}`);
  console.log(`  ${chalk.dim('Opening browser. Waiting for authentication...')}`);
  console.log();

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }

      const token = url.searchParams.get('token');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const success = !error && !!token;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><title>Stacker</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fff">
  <div style="text-align:center;padding:2rem">
    <div style="font-size:2rem;margin-bottom:1rem">${success ? '✅' : '❌'}</div>
    <h2 style="margin:0 0 .5rem;color:${success ? '#4ade80' : '#f87171'}">${success ? 'Authenticated' : 'Authentication failed'}</h2>
    <p style="color:#9ca3af;margin:0">${error ?? 'You can close this tab and return to your terminal.'}</p>
  </div>
</body></html>`);

      server.close();

      if (error || !token) { reject(new Error(error ?? 'No token received')); return; }
      if (returnedState !== state) { reject(new Error('State mismatch — possible CSRF attack. Try again.')); return; }

      try {
        saveToken(token);
        console.log(`  ${chalk.green('✔')} Authenticated successfully.`);
        console.log(`  ${chalk.dim('Token stored at ~/.ptai/config.json (AES-256-GCM encrypted)')}`);
        console.log();
        resolve();
      } catch (e) {
        reject(e);
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${CALLBACK_PORT} is in use. Close any other process using it and try again.`));
      } else {
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT, 'localhost', () => { openBrowser(authUrl); });

    setTimeout(() => {
      server.close();
      reject(new Error('Login timed out after 5 minutes. Try again.'));
    }, LOGIN_TIMEOUT_MS);
  });
}

export async function logoutCommand(): Promise<void> {
  clearToken();
  console.log();
  console.log(`  ${chalk.green('✔')} Logged out.`);
  console.log(`  ${chalk.dim('Token removed from ~/.ptai/config.json')}`);
  console.log();
}

export { isLoggedIn };
