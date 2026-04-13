import type { Workflow, WorkflowContext } from '../types.js';
import { ALL_TOOLS } from '../agent/tools.js';
import { runAgentLoop } from '../agent/loop.js';

const DIGEST_PROMPT = `
You are an AI Chief of Staff preparing the CEO's morning briefing for today.

Run these steps in parallel (call all three tools before synthesizing):
1. list_emails with maxResults 10 — fetch the 10 most recent unread emails
2. list_today_events — get today's calendar
3. search_pages — search Notion for tasks with query "To Do" to find open tasks

Then synthesize a structured morning briefing with these sections:

**Good morning.** Here is your briefing for [today's date].

**📧 Top Emails** (max 3 most urgent)
- For each: sender, subject, one-sentence summary, suggested action, and a clickable Gmail link using https://mail.google.com/mail/u/0/#inbox/<messageId>

**📅 Today's Calendar**
- List each event with time and attendees
- Flag any scheduling conflicts detected by detect_conflicts

**✅ Open Tasks**
- List overdue or due-today Notion tasks

Keep it tight. The CEO reads this in 2 minutes.
`.trim();

export const dailyDigestWorkflow: Workflow = {
  name: 'daily-digest',
  async run(ctx: WorkflowContext) {
    const channelId = process.env.DIGEST_CHANNEL_ID;
    if (!channelId) throw new Error('DIGEST_CHANNEL_ID environment variable is not set');
    const result = await runAgentLoop(DIGEST_PROMPT, ALL_TOOLS, channelId);
    await ctx.postToSlack(result.summary);
    // pendingApprovals not surfaced in digest: approval buttons are sent by inbox-triage at triage time
  },
};
