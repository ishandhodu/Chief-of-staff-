import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getWorkflow } from '../workflows/registry.js';
import { postMessage } from '../tools/slack.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  if (req.headers['x-internal-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { command, text, user_id, channelId } = req.body as {
    command: string;
    text: string;
    user_id: string;
    channelId: string;
  };

  const postToSlack = async (message: string) => {
    await postMessage({ channel: channelId, text: message });
  };

  try {
    if (command === '/triage') {
      const workflow = getWorkflow('inbox-triage');
      if (!workflow) { await postToSlack('Workflow not found: inbox-triage'); }
      else { await workflow.run({ slackUserId: user_id, postToSlack }); }
    } else if (command === '/task') {
      const workflow = getWorkflow('thread-to-task');
      if (!workflow) { await postToSlack('Workflow not found: thread-to-task'); }
      else { await workflow.run({ slackUserId: user_id, input: text, postToSlack }); }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[process] error:', errorMsg, err instanceof Error ? err.stack : '');
    try { await postToSlack(`Error: ${errorMsg}`); } catch { /* ignore */ }
  }

  res.status(200).json({ ok: true });
}
