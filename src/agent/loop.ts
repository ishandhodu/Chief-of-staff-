import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import type { Tool, AgentResult, ApprovalRequest } from '../types.js';
import { saveApproval } from './approval-store.js';

export async function runAgentLoop(
  prompt: string,
  tools: Tool[],
  // digestChannelId is passed through to callers for posting results; not used by the loop itself
  digestChannelId: string,
  maxIterations = 10
): Promise<AgentResult> {
  const client = new Anthropic();
  const pendingApprovals: ApprovalRequest[] = [];

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: prompt },
  ];

  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  for (let i = 0; i < maxIterations; i++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        tools: anthropicTools,
        messages,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        summary: `Agent stopped: Claude API error on iteration ${i + 1}: ${errMsg}`,
        pendingApprovals,
      };
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined;
      const summary = textBlock ? textBlock.text : '(No summary produced)';
      return { summary, pendingApprovals };
    }

    if (response.stop_reason !== 'tool_use') {
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const tool = tools.find((t) => t.name === block.name);
      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: unknown tool "${block.name}"`,
        });
        continue;
      }

      if (tool.riskLevel === 'high') {
        const approval: ApprovalRequest = {
          id: randomUUID(),
          toolName: block.name,
          args: block.input as Record<string, unknown>,
          description: `${block.name}: ${JSON.stringify(block.input).slice(0, 200)}`,
          createdAt: Date.now(),
        };
        await saveApproval(approval);
        pendingApprovals.push(approval);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Action "${block.name}" queued for CEO approval (ID: ${approval.id}). Do not retry this action.`,
        });
        continue;
      }

      try {
        const result = await tool.execute(block.input as Record<string, unknown>);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error executing ${block.name}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return {
    summary: `Agent reached max iterations (${maxIterations}). Partial results may have been applied.`,
    pendingApprovals,
  };
}
