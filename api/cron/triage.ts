import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getWorkflow } from '@/workflows/registry';
import { postMessage } from '@/tools/slack';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const channelId = process.env.DIGEST_CHANNEL_ID;
  if (!channelId) {
    return res.status(500).json({ error: 'DIGEST_CHANNEL_ID not configured' });
  }

  const postToSlack = async (message: string) => {
    await postMessage({ channel: channelId, text: message });
  };

  try {
    const workflow = getWorkflow('inbox-triage');
    if (!workflow) {
      await postMessage({ channel: channelId, text: 'Inbox triage workflow not found in registry.' });
      res.status(500).json({ error: 'workflow not found' });
      return;
    }
    await workflow.run({ postToSlack });
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await postMessage({ channel: channelId, text: `Inbox triage failed: ${message}` });
    } catch { /* Slack notification failed */ }
    res.status(500).json({ error: message });
  }
}
