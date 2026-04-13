import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySlackSignature } from '../../slack/verify.js';
import { getRawBody } from '../../slack/raw-body.js';
import { getApproval, deleteApproval } from '../../agent/approval-store.js';
import { ALL_TOOLS } from '../../agent/tools.js';
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

  // Ack immediately
  res.status(200).end();

  const channelId = process.env.DIGEST_CHANNEL_ID;
  if (!channelId) {
    console.error('DIGEST_CHANNEL_ID not configured');
    return;
  }

  try {
    let payload: { actions: Array<{ action_id: string; value: string }> };
    try {
      const params = new URLSearchParams(rawBody);
      const payloadStr = params.get('payload');
      if (!payloadStr) return;
      payload = JSON.parse(payloadStr);
    } catch {
      return;
    }

    if (!payload.actions?.length) return;
    const action = payload.actions[0];

    const approvalId = action.value;

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
  } catch (err) {
    try {
      await postMessage({ channel: channelId, text: `Error processing approval: ${err instanceof Error ? err.message : String(err)}` });
    } catch { /* Slack notification failed */ }
  }
}
