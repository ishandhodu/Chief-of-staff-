import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySlackSignature } from '@/slack/verify';
import { getRawBody } from '@/slack/raw-body';
import { getWorkflow } from '@/workflows/registry';
import { postMessage } from '@/tools/slack';

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

  // Ack Slack immediately (3-second requirement)
  res.status(200).json({ response_type: 'in_channel', text: 'Working on it...' });

  // Process async after response is sent
  const channelId = process.env.DIGEST_CHANNEL_ID ?? '';
  const postToSlack = async (message: string) => {
    await postMessage({ channel: channelId, text: message });
  };

  try {
    const params = new URLSearchParams(rawBody);
    const command = params.get('command') ?? '';
    const text = params.get('text') ?? '';
    const user_id = params.get('user_id') ?? '';

    if (command === '/triage') {
      const workflow = getWorkflow('inbox-triage');
      if (!workflow) { await postToSlack('Workflow not found: inbox-triage'); return; }
      await workflow.run({ slackUserId: user_id, postToSlack });
    } else if (command === '/task') {
      const workflow = getWorkflow('thread-to-task');
      if (!workflow) { await postToSlack('Workflow not found: thread-to-task'); return; }
      await workflow.run({ slackUserId: user_id, input: text, postToSlack });
    } else {
      await postToSlack(`Unknown command: ${command}`);
    }
  } catch (err) {
    try {
      await postToSlack(`Error processing command: ${err instanceof Error ? err.message : String(err)}`);
    } catch { /* Slack notification failed */ }
  }
}
