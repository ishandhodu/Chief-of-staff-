import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/agent/loop', () => ({
  runAgentLoop: vi.fn(),
}));

import { runAgentLoop } from '@/agent/loop';
import { inboxTriageWorkflow } from '@/workflows/inbox-triage';
import type { WorkflowContext } from '@/types';

beforeEach(() => {
  process.env.DIGEST_CHANNEL_ID = 'C_TEST_CHANNEL';
});

describe('inboxTriageWorkflow', () => {
  it('runs the agent loop with triage prompt and posts result to Slack', async () => {
    vi.mocked(runAgentLoop).mockResolvedValue({
      summary: '14 emails processed. 2 urgent, 3 need replies.',
      pendingApprovals: [],
    });

    const postToSlack = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkflowContext = { postToSlack };

    await inboxTriageWorkflow.run(ctx);

    expect(runAgentLoop).toHaveBeenCalledOnce();
    const [prompt] = vi.mocked(runAgentLoop).mock.calls[0];
    expect(prompt).toContain('triage');

    expect(postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('14 emails processed')
    );
  });

  it('posts pending approvals to Slack when high-risk actions are queued', async () => {
    vi.mocked(runAgentLoop).mockResolvedValue({
      summary: 'Triage done.',
      pendingApprovals: [
        {
          id: 'uuid-1',
          toolName: 'send_email',
          args: { to: 'sarah@example.com', subject: 'Hi', body: 'Hello' },
          description: 'send_email to sarah@example.com',
          createdAt: Date.now(),
        },
      ],
    });

    const postToSlack = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkflowContext = { postToSlack };

    await inboxTriageWorkflow.run(ctx);

    // Should post the summary AND a separate approval request message
    expect(postToSlack).toHaveBeenCalledTimes(2);
    const approvalCall = vi.mocked(postToSlack).mock.calls[1][0] as string;
    expect(approvalCall).toContain('approval');
  });
});
