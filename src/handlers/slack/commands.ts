import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
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
  const channelId = process.env.DIGEST_CHANNEL_ID ?? '';

  // Send 200 to Slack immediately so it doesn't show a timeout error
  res.status(200).json({ response_type: 'in_channel', text: 'Working on it...' });

  // Run the workflow directly (no internal HTTP hop) so waitUntil can track real work.
  const postToSlack = async (message: string) => {
    await postMessage({ channel: channelId, text: message });
  };

  waitUntil(
    (async () => {
      try {
        if (command === '/triage') {
          const workflow = getWorkflow('inbox-triage');
          if (!workflow) {
            await postToSlack('Workflow not found: inbox-triage');
          } else {
            await workflow.run({ slackUserId: user_id, postToSlack });
          }
        } else if (command === '/task') {
          const workflow = getWorkflow('thread-to-task');
          if (!workflow) {
            await postToSlack('Workflow not found: thread-to-task');
          } else {
            await workflow.run({ slackUserId: user_id, input: text, postToSlack });
          }
        } else if (command === '/calendar') {
          const workflow = getWorkflow('calendar-manage');
          if (!workflow) {
            await postToSlack('Workflow not found: calendar-manage');
          } else {
            await workflow.run({ slackUserId: user_id, input: text, postToSlack });
          }
        } else {
          await postToSlack(`Unknown command: ${command}`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('[commands] workflow error:', errorMsg, err instanceof Error ? err.stack : '');
        try { await postToSlack(`Error: ${errorMsg}`); } catch { /* ignore */ }
      }
    })()
  );
}
