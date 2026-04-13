import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySlackSignature } from '../../slack/verify.js';
import { getRawBody } from '../../slack/raw-body.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const rawBody = await getRawBody(req);

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return res.status(500).json({ error: 'SLACK_SIGNING_SECRET not configured' });
  }
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  if (typeof signature !== 'string' || typeof timestamp !== 'string') {
    return res.status(401).json({ error: 'Missing Slack headers' });
  }

  if (!verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const params = new URLSearchParams(rawBody);
  const command = params.get('command') ?? '';
  const text = params.get('text') ?? '';
  const user_id = params.get('user_id') ?? '';
  const channelId = process.env.DIGEST_CHANNEL_ID ?? '';

  // Fire-and-forget: trigger the process function independently
  const baseUrl = `https://${req.headers.host}`;
  fetch(`${baseUrl}/api/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.CRON_SECRET ?? '',
    },
    body: JSON.stringify({ command, text, user_id, channelId }),
  }).catch(err => console.error('[commands] failed to trigger process:', err));

  // Ack Slack immediately
  return res.status(200).json({ response_type: 'in_channel', text: 'Working on it...' });
}
