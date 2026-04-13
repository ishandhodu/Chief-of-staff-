import type { Workflow, WorkflowContext } from '../types.js';
import { ALL_TOOLS } from '../agent/tools.js';
import { runAgentLoop } from '../agent/loop.js';
import { postApprovalMessage } from '../slack/approval.js';

const TRIAGE_PROMPT = `
You are an AI Chief of Staff. Your task is to triage the CEO's inbox.

1. Call list_emails with maxResults 10 to fetch the 10 most recent unread emails.
2. For each email, use label_email to apply one of these labels: urgent, needs-reply, FYI, newsletter, can-ignore.
   - urgent: requires the CEO's attention today
   - needs-reply: CEO should respond but not time-critical
   - FYI: informational, no action needed
   - newsletter: bulk/marketing email
   - can-ignore: spam or low-value
3. For emails labeled urgent or needs-reply, use save_draft to write a suggested reply.
   Also call create_task for these emails with:
   - priority: "High" for urgent, "Medium" for needs-reply
4. Summarize what you did: how many emails, how many in each category, what drafts and tasks you created.

Be concise. Do not explain your reasoning for every email — just do it and summarize.
`.trim();

export const inboxTriageWorkflow: Workflow = {
  name: 'inbox-triage',
  async run(ctx: WorkflowContext) {
    const channelId = process.env.DIGEST_CHANNEL_ID;
    if (!channelId) throw new Error('DIGEST_CHANNEL_ID environment variable is not set');
    const result = await runAgentLoop(TRIAGE_PROMPT, ALL_TOOLS, channelId);

    await ctx.postToSlack(`*Inbox Triage Complete*\n\n${result.summary}`);

    for (const approval of result.pendingApprovals) {
      await postApprovalMessage(approval, channelId);
    }
  },
};
