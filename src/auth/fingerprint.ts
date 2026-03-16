import * as crypto from 'crypto';
import * as os from 'os';

export function getMachineFingerprint(): string {
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const platform = os.platform();
  return crypto.createHash('sha256').update(hostname + username + platform).digest('hex');
}
