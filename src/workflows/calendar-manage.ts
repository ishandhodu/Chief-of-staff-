import type { Workflow, WorkflowContext } from '../types.js';
import { ALL_TOOLS } from '../agent/tools.js';
import { runAgentLoop } from '../agent/loop.js';

export const calendarManageWorkflow: Workflow = {
  name: 'calendar-manage',
  async run(ctx: WorkflowContext) {
    if (!ctx.input) {
      await ctx.postToSlack(
        'Please provide instructions. Usage: `/cal [what you want to change]`\nExamples:\n- `/cal move my standup to 3pm`\n- `/cal cancel the investor call`\n- `/cal reschedule team sync to tomorrow at 10am`'
      );
      return;
    }

    const channelId = process.env.DIGEST_CHANNEL_ID;
    if (!channelId) throw new Error('DIGEST_CHANNEL_ID environment variable is not set');

    // Build today's date in Eastern timezone for the prompt
    const now = new Date();
    const eastern = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) => eastern.find(p => p.type === type)!.value;
    const todayET = `${get('year')}-${get('month')}-${get('day')}`;

    const prompt = `
You are an AI Chief of Staff. The CEO wants to modify their calendar.
Today's date in Eastern Time is ${todayET}.

Instruction: "${ctx.input}"

Steps:
1. Call list_today_events to see today's calendar. If the instruction mentions a specific date other than today, call list_events with that date (YYYY-MM-DD format) instead.
2. If list_today_events returns no events (or the event isn't found), try list_events with today's date "${todayET}" as a fallback — timezone differences can cause list_today_events to miss events.
3. Identify the event that matches the CEO's instruction. Match by title keywords — be flexible.
4. Execute the change:
   - To reschedule/move: call update_event with the new startTime and endTime (keep the same duration unless told otherwise). Use ISO 8601 format with Eastern timezone offset (-04:00 for EDT, -05:00 for EST).
   - To cancel/remove: call delete_event.
   - To rename: call update_event with the new summary.
5. Report what you did: the event name, what changed, and the new time if applicable.

If no matching event is found, report that clearly. If the instruction is ambiguous, pick the most likely match and explain your choice.
    `.trim();

    const result = await runAgentLoop(prompt, ALL_TOOLS, channelId);
    await ctx.postToSlack(result.summary);
  },
};
