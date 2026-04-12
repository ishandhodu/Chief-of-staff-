import { WebClient } from '@slack/web-api';

function getSlackClient() {
  return new WebClient(process.env.SLACK_BOT_TOKEN);
}

export async function postMessage(args: Record<string, unknown>): Promise<{ ok: boolean; ts?: string }> {
  const channel = args.channel as string | undefined;
  const text = args.text as string | undefined;

  if (!channel || typeof channel !== 'string') {
    throw new Error('postMessage requires a non-empty channel string');
  }
  if (!text || typeof text !== 'string') {
    throw new Error('postMessage requires a non-empty text string');
  }

  const blocks = args.blocks as unknown[] | undefined;
  const client = getSlackClient();

  const res = await client.chat.postMessage({
    channel,
    text,
    blocks: blocks as never,
  });

  return { ok: res.ok ?? false, ts: res.ts };
}

export async function openModal(args: Record<string, unknown>): Promise<{ ok: boolean }> {
  const triggerId = args.triggerId as string | undefined;
  const title = args.title as string | undefined;
  const body = args.body as string | undefined;
  const callbackId = args.callbackId as string | undefined;

  if (!triggerId || typeof triggerId !== 'string') {
    throw new Error('openModal requires a non-empty triggerId string');
  }
  if (!title || typeof title !== 'string') {
    throw new Error('openModal requires a non-empty title string');
  }
  if (!body || typeof body !== 'string') {
    throw new Error('openModal requires a non-empty body string');
  }
  if (!callbackId || typeof callbackId !== 'string') {
    throw new Error('openModal requires a non-empty callbackId string');
  }

  const client = getSlackClient();
  const res = await client.views.open({
    trigger_id: triggerId,
    view: {
      type: 'modal',
      callback_id: callbackId,
      title: { type: 'plain_text', text: title },
      submit: { type: 'plain_text', text: 'Submit' },
      close: { type: 'plain_text', text: 'Cancel' },
      blocks: [
        {
          type: 'input',
          block_id: 'content_block',
          label: { type: 'plain_text', text: 'Content' },
          element: {
            type: 'plain_text_input',
            action_id: 'content_input',
            multiline: true,
            initial_value: body,
          },
        },
      ],
    },
  });

  return { ok: res.ok ?? false };
}
