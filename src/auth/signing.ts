import * as crypto from 'crypto';

export function signRequest(token: string, timestamp: number): string {
  return crypto.createHmac('sha256', token).update(String(timestamp)).digest('hex');
}
