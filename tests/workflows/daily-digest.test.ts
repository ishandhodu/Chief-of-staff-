import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/agent/loop', () => ({
  runAgentLoop: vi.fn(),
}));

import { runAgentLoop } from '@/agent/loop';
import { dailyDigestWorkflow } from '@/workflows/daily-digest';
import type { WorkflowContext } from '@/types';

beforeEach(() => {
  process.env.DIGEST_CHANNEL_ID = 'C_TEST_CHANNEL';
});

describe('dailyDigestWorkflow', () => {
  it('runs the agent and posts the digest to Slack', async () => {
    vi.mocked(runAgentLoop).mockResolvedValue({
      summary: '*Good morning.* Here is your briefing for April 12...',
      pendingApprovals: [],
    });

    const postToSlack = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkflowContext = { postToSlack };

    await dailyDigestWorkflow.run(ctx);

    expect(runAgentLoop).toHaveBeenCalledOnce();
    const [prompt] = vi.mocked(runAgentLoop).mock.calls[0];
    expect(prompt).toContain('morning briefing');

    expect(postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('Good morning')
    );
  });
});
