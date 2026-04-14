import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/agent/loop', () => ({
  runAgentLoop: vi.fn(),
}));
vi.mock('@/agent/memory-context', () => ({
  buildMemoryContext: vi.fn().mockResolvedValue(''),
}));

import { runAgentLoop } from '@/agent/loop';
import { buildMemoryContext } from '@/agent/memory-context';
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

describe('dailyDigestWorkflow — memory injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DIGEST_CHANNEL_ID = 'C_TEST_CHANNEL';
  });

  it('prepends memory context to the digest prompt when memories exist', async () => {
    vi.mocked(buildMemoryContext).mockResolvedValue(
      'Your personalized context:\n\nDeadlines to watch for:\n- home insurance renewal (due 2026-05-15): flag related emails\n'
    );
    vi.mocked(runAgentLoop).mockResolvedValue({
      summary: '*Good morning.* Briefing for April 14.',
      pendingApprovals: [],
    });

    const postToSlack = vi.fn().mockResolvedValue(undefined);
    await dailyDigestWorkflow.run({ postToSlack });

    const [prompt] = vi.mocked(runAgentLoop).mock.calls[0];
    expect(prompt).toContain('Your personalized context');
    expect(prompt).toContain('home insurance renewal');
    expect(prompt).toContain('morning briefing');
  });
});
