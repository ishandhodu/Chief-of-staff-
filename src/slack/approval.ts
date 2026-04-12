import { WebClient } from '@slack/web-api';
import type { ApprovalRequest } from '@/types';

export async function postApprovalMessage(
  approval: ApprovalRequest,
  channelId: string
): Promise<void> {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN);

  await client.chat.postMessage({
    channel: channelId,
    text: `Action requires your approval: ${approval.description}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Action requires your approval*\n\n*Tool:* \`${approval.toolName}\`\n*Details:* ${approval.description}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve' },
            style: 'primary',
            action_id: 'approve_action',
            value: approval.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Cancel' },
            style: 'danger',
            action_id: 'cancel_action',
            value: approval.id,
          },
        ],
      },
    ],
  });
}
