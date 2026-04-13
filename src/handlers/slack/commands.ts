import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySlackSignature } from '../../slack/verify.js';
import { getRawBody } from '../../slack/raw-body.js';
import { getWorkflow } from '../../workflows/registry.js';
import { postMessage } from '../../tools/slack.js';

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
  const response_url = params.get('response_url') ?? '';

  const channelId = process.env.DIGEST_CHANNEL_ID ?? '';

  const postToSlack = async (message: string) => {
    await postMessage({ channel: channelId, text: message });
  };

  // Run workflow synchronously, post result via response_url to satisfy Slack
  // Use response_url so Slack keeps the connection open up to 30 minutes
  const runAndRespond = async () => {
    try {
      if (command === '/triage') {
        const workflow = getWorkflow('inbox-triage');
        if (!workflow) {
          await fetch(response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Workflow not found: inbox-triage' }) });
          return;
        }
        await workflow.run({ slackUserId: user_id, postToSlack });
        await fetch(response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Triage complete.' }) });
      } else if (command === '/task') {
        const workflow = getWorkflow('thread-to-task');
        if (!workflow) {
          await fetch(response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Workflow not found: thread-to-task' }) });
          return;
        }
        await workflow.run({ slackUserId: user_id, input: text, postToSlack });
        await fetch(response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Task created.' }) });
      } else {
        await postToSlack(`Unknown command: ${command}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : '';
      console.error('[commands] error:', errorMsg, stack);
      try {
        await postMessage({ channel: channelId, text: `Error running ${command}: ${errorMsg}` });
      } catch (e) {
        console.error('[commands] failed to post error to Slack:', e);
      }
      if (response_url) {
        await fetch(response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `Error: ${errorMsg}` }) }).catch(() => {});
      }
    }
  };

  // Acknowledge immediately, run workflow in background
  res.status(200).json({ response_type: 'in_channel', text: 'Working on it...' });
  await runAndRespond();
}
