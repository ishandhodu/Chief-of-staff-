import type { Workflow, WorkflowContext } from '../types.js';
import { ALL_TOOLS } from '../agent/tools.js';
import { runAgentLoop } from '../agent/loop.js';

export const threadToTaskWorkflow: Workflow = {
  name: 'thread-to-task',
  async run(ctx: WorkflowContext) {
    if (!ctx.input) {
      await ctx.postToSlack(
        'Please provide a search query. Usage: `/task [email subject or keywords]`'
      );
      return;
    }

    const channelId = process.env.DIGEST_CHANNEL_ID;
    if (!channelId) throw new Error('DIGEST_CHANNEL_ID environment variable is not set');

    const prompt = `
You are an AI Chief of Staff. The CEO wants to create a Notion task from an email thread.

Search query: "${ctx.input}"

Steps:
1. Call search_thread with the query to find the relevant email thread.
2. Read the thread content carefully.
3. Extract:
   - A clear, actionable task title (imperative form, e.g. "Send investor deck to Sarah")
   - Deadline (if mentioned, in YYYY-MM-DD format; otherwise omit)
   - Stakeholders (people involved — names and/or emails)
   - A 1-2 sentence context summary
4. Call create_task with the extracted information and set sourceId to the email message ID.
5. Report the Notion page URL in your final response.

If no thread is found, report that clearly.
    `.trim();

    const result = await runAgentLoop(prompt, ALL_TOOLS, channelId);
    await ctx.postToSlack(result.summary);
    // pendingApprovals not surfaced here: thread-to-task only calls low-risk tools (create_task, search_thread)
  },
};
