import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getWorkflow } from '@/workflows/registry';
import { postMessage } from '@/tools/slack';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // Vercel cron calls use GET. Any other method is unexpected.
  const channelId = process.env.DIGEST_CHANNEL_ID!;

  const postToSlack = async (message: string) => {
    await postMessage({ channel: channelId, text: message });
  };

  try {
    const workflow = getWorkflow('daily-digest');
    await workflow?.run({ postToSlack });
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await postMessage({
      channel: channelId,
      text: `Daily digest failed: ${message}`,
    });
    res.status(500).json({ error: message });
  }
}
