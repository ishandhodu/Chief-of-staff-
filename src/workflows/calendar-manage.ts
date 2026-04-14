import type { Workflow, WorkflowContext } from '../types.js';
import { ALL_TOOLS } from '../agent/tools.js';
import { runAgentLoop } from '../agent/loop.js';

export const calendarManageWorkflow: Workflow = {
  name: 'calendar-manage',
  async run(ctx: WorkflowContext) {
    if (!ctx.input) {
      await ctx.postToSlack(
        'Please provide instructions. Usage: `/calendar [what you want to change]`\nExamples:\n- `/calendar move my standup to 3pm`\n- `/calendar cancel the investor call`\n- `/calendar reschedule team sync to tomorrow at 10am`'
      );
      return;
    }

    const channelId = process.env.DIGEST_CHANNEL_ID;
    if (!channelId) throw new Error('DIGEST_CHANNEL_ID environment variable is not set');

    const prompt = `
You are an AI Chief of Staff. The CEO wants to modify their calendar.

Instruction: "${ctx.input}"

Steps:
1. Call list_today_events to see today's calendar.
2. Identify the event that matches the CEO's instruction. Match by title keywords — be flexible.
3. Execute the change:
   - To reschedule/move: call update_event with the new startTime and endTime (keep the same duration unless told otherwise). Use ISO 8601 format with timezone offset.
   - To cancel/remove: call delete_event.
   - To rename: call update_event with the new summary.
4. Report what you did: the event name, what changed, and the new time if applicable.

If no matching event is found, report that clearly. If the instruction is ambiguous, pick the most likely match and explain your choice.
    `.trim();

    const result = await runAgentLoop(prompt, ALL_TOOLS, channelId);
    await ctx.postToSlack(result.summary);
  },
};
