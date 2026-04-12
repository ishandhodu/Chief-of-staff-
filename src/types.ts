import type Anthropic from '@anthropic-ai/sdk';

// A tool the agent can call. riskLevel determines if approval is required.
export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  riskLevel: 'low' | 'high';
}

// A workflow is a named async function that runs an agent with a specific prompt.
export interface Workflow {
  name: string;
  run: (ctx: WorkflowContext) => Promise<void>;
}

// Context passed into every workflow run.
export interface WorkflowContext {
  // The Slack user ID that triggered this workflow (undefined for cron triggers).
  slackUserId?: string;
  // Free-text input from the user (e.g. search query for thread-to-task).
  input?: string;
  // Post a plain-text or block-kit message to the digest channel.
  postToSlack: (text: string, blocks?: Anthropic.Messages.MessageParam[]) => Promise<void>;
}

// A pending high-risk action waiting for CEO approval.
export interface ApprovalRequest {
  id: string;          // UUID
  toolName: string;
  args: Record<string, unknown>;
  description: string; // Human-readable summary of the action
  createdAt: number;   // Unix ms — expires after 1 hour
}

// Result returned by the agent loop.
export interface AgentResult {
  summary: string;
  pendingApprovals: ApprovalRequest[];
}
