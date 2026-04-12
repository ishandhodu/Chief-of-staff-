import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySlackSignature } from '@/slack/verify';
import { getApproval, deleteApproval } from '@/agent/approval-store';
import { ALL_TOOLS } from '@/agent/tools';
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

  // Ack immediately
  res.status(200).end();

  const payload = JSON.parse(req.body.payload as string) as {
    actions: Array<{ action_id: string; value: string }>;
  };

  const action = payload.actions[0];
  const approvalId = action.value;
  const channelId = process.env.DIGEST_CHANNEL_ID!;

  const approval = await getApproval(approvalId);
  if (!approval) {
    await postMessage({ channel: channelId, text: `Approval \`${approvalId}\` has expired or was already processed.` });
    return;
  }

  if (action.action_id === 'cancel_action') {
    await deleteApproval(approvalId);
    await postMessage({ channel: channelId, text: `Cancelled: ${approval.description}` });
    return;
  }

  if (action.action_id === 'approve_action') {
    const tool = ALL_TOOLS.find((t) => t.name === approval.toolName);
    if (!tool) {
      await postMessage({ channel: channelId, text: `Error: tool \`${approval.toolName}\` not found.` });
      return;
    }

    try {
      const result = await tool.execute(approval.args);
      await deleteApproval(approvalId);
      await postMessage({
        channel: channelId,
        text: `Done: ${approval.description}\n\`\`\`${JSON.stringify(result, null, 2)}\`\`\``,
      });
    } catch (err) {
      await postMessage({
        channel: channelId,
        text: `Error executing ${approval.toolName}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}
