import { describe, it, expect, vi } from 'vitest';
import { verifySlackSignature } from '@/slack/verify';
import { createHmac } from 'crypto';

const SIGNING_SECRET = 'test_signing_secret_abc123';

function makeSignature(secret: string, timestamp: string, body: string): string {
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = createHmac('sha256', secret);
  return `v0=${hmac.update(baseString).digest('hex')}`;
}

describe('verifySlackSignature', () => {
  it('returns true for a valid signature', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = 'command=%2Ftriage&text=&user_id=U12345';
    const signature = makeSignature(SIGNING_SECRET, timestamp, body);

    expect(
      verifySlackSignature(SIGNING_SECRET, signature, timestamp, body)
    ).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = 'command=%2Ftriage&text=&user_id=U12345';

    expect(
      verifySlackSignature(SIGNING_SECRET, 'v0=bad_signature', timestamp, body)
    ).toBe(false);
  });

  it('returns false for a timestamp older than 5 minutes', () => {
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400);
    const body = 'command=%2Ftriage';
    const signature = makeSignature(SIGNING_SECRET, oldTimestamp, body);

    expect(
      verifySlackSignature(SIGNING_SECRET, signature, oldTimestamp, body)
    ).toBe(false);
  });
});
