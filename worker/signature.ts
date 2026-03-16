const MAX_AGE_SECONDS = 30;

export interface SignatureResult {
  valid: boolean;
  error?: string;
}

export async function verifySignature(
  token: string,
  timestampStr: string,
  signature: string
): Promise<SignatureResult> {
  if (!timestampStr || !signature) {
    return { valid: false, error: 'Missing timestamp or signature headers' };
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: 'Invalid timestamp format' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > MAX_AGE_SECONDS) {
    return { valid: false, error: 'Request timestamp expired (>30s). Check system clock.' };
  }

  // Compute expected HMAC-SHA256(token, timestamp)
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(token),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(timestampStr));
  const expected = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison
  if (expected.length !== signature.length) {
    return { valid: false, error: 'Invalid signature' };
  }

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }

  if (diff !== 0) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}
