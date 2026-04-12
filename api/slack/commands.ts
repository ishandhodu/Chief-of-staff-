import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySlackSignature } from '@/slack/verify';
import { getWorkflow } from '@/workflows/registry';
import { postMessage } from '@/tools/slack';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;

  if (!verifySlackSignature(process.env.SLACK_SIGNING_SECRET!, signature, timestamp, rawBody)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Ack Slack immediately (3-second requirement)
  res.status(200).json({ response_type: 'in_channel', text: 'Working on it...' });

  // Parse URL-encoded body after verification
  const params = new URLSearchParams(rawBody);
  const command = params.get('command') ?? '';
  const text = params.get('text') ?? '';
  const user_id = params.get('user_id') ?? '';

  const channelId = process.env.DIGEST_CHANNEL_ID!;

  const postToSlack = async (message: string) => {
    await postMessage({ channel: channelId, text: message });
  };

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
}
