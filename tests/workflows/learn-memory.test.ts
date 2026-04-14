import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

vi.mock('@/tools/notion', () => ({
  saveMemory: vi.fn().mockResolvedValue({ pageId: 'mem-new' }),
}));

import { saveMemory } from '@/tools/notion';
import { learnMemoryWorkflow } from '@/workflows/learn-memory';
import type { WorkflowContext } from '@/types';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NOTION_MEMORY_DATABASE_ID = 'test-memory-db-id';
});

function makeCtx(input: string): WorkflowContext & { postToSlack: ReturnType<typeof vi.fn> } {
  const postToSlack = vi.fn().mockResolvedValue(undefined);
  return { input, postToSlack };
}

describe('learnMemoryWorkflow', () => {
  it('parses a contact entry and posts a confirmation', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            type: 'Contact',
            subject: 'ishan@example.com',
            rule: 'lead investor, always treat as urgent',
            expires: null,
          }),
        },
      ],
    });

    const ctx = makeCtx('ishan@example.com is my lead investor, always urgent');
    await learnMemoryWorkflow.run(ctx);

    expect(saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Contact',
        subject: 'ishan@example.com',
        rule: 'lead investor, always treat as urgent',
        expires: null,
        raw: 'ishan@example.com is my lead investor, always urgent',
      })
    );
    expect(ctx.postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('ishan@example.com')
    );
  });

  it('parses a deadline entry and posts a confirmation with the due date', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            type: 'Deadline',
            subject: 'home insurance renewal',
            rule: 'flag any related emails as urgent',
            expires: '2026-05-15',
          }),
        },
      ],
    });

    const ctx = makeCtx('home insurance renewal due May 15');
    await learnMemoryWorkflow.run(ctx);

    expect(saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Deadline',
        subject: 'home insurance renewal',
        expires: '2026-05-15',
      })
    );
    expect(ctx.postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('2026-05-15')
    );
  });

  it('posts a usage message when input is empty', async () => {
    const ctx = makeCtx('');
    await learnMemoryWorkflow.run(ctx);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(saveMemory).not.toHaveBeenCalled();
    expect(ctx.postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('/learn')
    );
  });

  it('posts a fallback message when Claude returns no text block', async () => {
    mockCreate.mockResolvedValue({ content: [] });

    const ctx = makeCtx('some input that fails to parse');
    await learnMemoryWorkflow.run(ctx);

    expect(saveMemory).not.toHaveBeenCalled();
    expect(ctx.postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('/learn')
    );
  });
});
