import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChatPostMessage = vi.fn();
const mockViewsOpen = vi.fn();

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      postMessage: mockChatPostMessage,
    },
    views: {
      open: mockViewsOpen,
    },
  })),
}));

import { postMessage, openModal } from '@/tools/slack';

beforeEach(() => vi.clearAllMocks());

describe('postMessage', () => {
  it('posts a text message to a channel', async () => {
    mockChatPostMessage.mockResolvedValue({
      ok: true,
      ts: '1234567890.000001',
    });

    const result = await postMessage({
      channel: 'C12345',
      text: 'Hello from the agent',
    });

    expect(result).toMatchObject({ ok: true, ts: '1234567890.000001' });
    expect(mockChatPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C12345', text: 'Hello from the agent' })
    );
  });

  it('throws when channel or text is missing', async () => {
    await expect(postMessage({ text: 'no channel' })).rejects.toThrow('channel');
    await expect(postMessage({ channel: 'C12345' })).rejects.toThrow('text');
  });
});

describe('openModal', () => {
  it('opens a Slack modal with the provided view', async () => {
    mockViewsOpen.mockResolvedValue({ ok: true });

    const result = await openModal({
      triggerId: 'trigger_abc',
      title: 'Edit Draft',
      body: 'Draft email content here',
      callbackId: 'edit_draft_modal',
    });

    expect(result).toMatchObject({ ok: true });
    expect(mockViewsOpen).toHaveBeenCalledWith(
      expect.objectContaining({ trigger_id: 'trigger_abc' })
    );
  });
});
