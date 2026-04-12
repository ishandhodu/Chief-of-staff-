import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/agent/loop', () => ({
  runAgentLoop: vi.fn(),
}));

import { runAgentLoop } from '@/agent/loop';
import { threadToTaskWorkflow } from '@/workflows/thread-to-task';
import type { WorkflowContext } from '@/types';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('threadToTaskWorkflow', () => {
  it('passes the user query into the agent prompt', async () => {
    vi.mocked(runAgentLoop).mockResolvedValue({
      summary: 'Created task: Send investor deck by Friday -> https://notion.so/abc',
      pendingApprovals: [],
    });

    const postToSlack = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkflowContext = {
      postToSlack,
      input: 'investor follow-up from Sarah',
    };

    await threadToTaskWorkflow.run(ctx);

    const [prompt] = vi.mocked(runAgentLoop).mock.calls[0];
    expect(prompt).toContain('investor follow-up from Sarah');
    expect(postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('Created task')
    );
  });

  it('returns an error message when no input provided', async () => {
    const postToSlack = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkflowContext = { postToSlack };

    await threadToTaskWorkflow.run(ctx);

    expect(postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('search query')
    );
    expect(runAgentLoop).not.toHaveBeenCalled();
  });
});
