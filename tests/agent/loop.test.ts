import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  })),
}));

vi.mock('@/agent/approval-store', () => ({
  saveApproval: vi.fn(),
}));

import { saveApproval } from '@/agent/approval-store';
import { runAgentLoop } from '@/agent/loop';
import type { Tool } from '@/types';

const mockTool: Tool = {
  name: 'list_emails',
  description: 'List emails',
  input_schema: { type: 'object', properties: {}, required: [] },
  riskLevel: 'low',
  execute: vi.fn().mockResolvedValue([{ id: 'msg1', subject: 'Hello' }]),
};

const highRiskTool: Tool = {
  name: 'send_email',
  description: 'Send email',
  input_schema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'recipient' },
      subject: { type: 'string', description: 'subject' },
      body: { type: 'string', description: 'body' },
    },
    required: ['to', 'subject', 'body'],
  },
  riskLevel: 'high',
  execute: vi.fn().mockResolvedValue({ messageId: 'sent123' }),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runAgentLoop', () => {
  it('returns summary when Claude stops with end_turn', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Triage complete. 3 emails processed.' }],
    });

    const result = await runAgentLoop('Triage my inbox', [mockTool], 'C_DIGEST');

    expect(result.summary).toBe('Triage complete. 3 emails processed.');
    expect(result.pendingApprovals).toHaveLength(0);
  });

  it('executes low-risk tool calls and continues the loop', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'call1', name: 'list_emails', input: {} },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Done.' }],
      });

    const result = await runAgentLoop('Triage inbox', [mockTool], 'C_DIGEST');

    expect(mockTool.execute).toHaveBeenCalledWith({});
    expect(result.summary).toBe('Done.');
  });

  it('queues high-risk tools to approval store instead of executing', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'call2',
            name: 'send_email',
            input: { to: 'sarah@example.com', subject: 'Hi', body: 'Hello' },
          },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Queued for approval.' }],
      });

    const result = await runAgentLoop('Send a reply', [highRiskTool], 'C_DIGEST');

    expect(highRiskTool.execute).not.toHaveBeenCalled();
    expect(saveApproval).toHaveBeenCalledOnce();
    expect(result.pendingApprovals).toHaveLength(1);
    expect(result.pendingApprovals[0].toolName).toBe('send_email');
  });

  it('stops after maxIterations and returns partial results', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'callN', name: 'list_emails', input: {} }],
    });

    const result = await runAgentLoop('Loop forever', [mockTool], 'C_DIGEST', 3);

    expect(result.summary).toContain('max iterations');
  });

  it('catches tool execution errors and reports them back to Claude', async () => {
    const errorTool: Tool = {
      name: 'list_emails',
      description: 'List emails',
      input_schema: { type: 'object', properties: {}, required: [] },
      riskLevel: 'low',
      execute: vi.fn().mockRejectedValue(new Error('API limit exceeded')),
    };

    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'callErr', name: 'list_emails', input: {} }],
      } as never)
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Handled error.' }],
      } as never);

    const result = await runAgentLoop('Triage', [errorTool], 'C_DIGEST');

    // Should not throw; loop continues after error
    expect(result.summary).toBe('Handled error.');
    // The tool result sent back to Claude should contain the error message
    // Note: messages is a shared reference; by now it also contains the second assistant reply,
    // so the tool-result message is second-to-last.
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResultContent = secondCallMessages[secondCallMessages.length - 2].content;
    expect(toolResultContent[0].content).toContain('API limit exceeded');
  });

  it('returns error result for unknown tool names and continues', async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'callUnknown', name: 'nonexistent_tool', input: {} }],
      } as never)
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Unknown tool handled.' }],
      } as never);

    const result = await runAgentLoop('Do something', [mockTool], 'C_DIGEST');

    expect(result.summary).toBe('Unknown tool handled.');
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResultContent = secondCallMessages[secondCallMessages.length - 2].content;
    expect(toolResultContent[0].content).toContain('unknown tool');
  });
});
