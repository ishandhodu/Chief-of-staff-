import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySlackSignature } from '@/slack/verify';
import { getWorkflow } from '@/workflows/registry';
import { postMessage } from '@/tools/slack';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const signature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  const rawBody = JSON.stringify(req.body);

  if (!verifySlackSignature(process.env.SLACK_SIGNING_SECRET!, signature, timestamp, rawBody)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Ack Slack immediately (3-second requirement)
  res.status(200).json({ response_type: 'in_channel', text: 'Working on it...' });

  // Process async after response is sent
  const { command, text, user_id } = req.body as {
    command: string;
    text: string;
    user_id: string;
  };

  const channelId = process.env.DIGEST_CHANNEL_ID!;

  const postToSlack = async (message: string) => {
    await postMessage({ channel: channelId, text: message });
  };

  if (command === '/triage') {
    const workflow = getWorkflow('inbox-triage');
    await workflow?.run({ slackUserId: user_id, postToSlack });
  } else if (command === '/task') {
    const workflow = getWorkflow('thread-to-task');
    await workflow?.run({ slackUserId: user_id, input: text, postToSlack });
  } else {
    await postToSlack(`Unknown command: ${command}`);
  }
}
