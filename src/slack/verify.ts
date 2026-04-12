import { createHmac, timingSafeEqual } from 'crypto';

export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return false; // Reject requests older than 5 minutes
  }

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = createHmac('sha256', signingSecret);
  const expected = `v0=${hmac.update(baseString).digest('hex')}`;

  // Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
