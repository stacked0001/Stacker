import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { getMachineFingerprint } from './fingerprint';

const CONFIG_DIR = path.join(os.homedir(), '.ptai');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const ALGORITHM = 'aes-256-gcm';
const SALT = 'stacker-ptai-v1';

interface StoredConfig {
  token_enc: string;
  machine_id: string;
}

export interface AuthConfig {
  token: string;
  machine_id: string;
}

function deriveKey(fingerprint: string): Buffer {
  return crypto.pbkdf2Sync(fingerprint, SALT, 100000, 32, 'sha256');
}

export function saveToken(token: string): void {
  const machine_id = getMachineFingerprint();
  const key = deriveKey(machine_id);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv(12 bytes) + authTag(16 bytes) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]).toString('hex');

  const stored: StoredConfig = { token_enc: packed, machine_id };

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  try { fs.chmodSync(CONFIG_DIR, 0o700); } catch {}
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(stored, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

export function loadToken(): AuthConfig | null {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const stored: StoredConfig = JSON.parse(raw);

    const machine_id = getMachineFingerprint();
    if (stored.machine_id !== machine_id) return null;

    const key = deriveKey(machine_id);
    const packed = Buffer.from(stored.token_enc, 'hex');

    const iv = packed.subarray(0, 12);
    const authTag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const token = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

    return { token, machine_id };
  } catch {
    return null;
  }
}

export function clearToken(): void {
  try { fs.unlinkSync(CONFIG_PATH); } catch {}
}

export function isLoggedIn(): boolean {
  return loadToken() !== null;
}
