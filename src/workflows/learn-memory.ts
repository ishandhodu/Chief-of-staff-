import Anthropic from '@anthropic-ai/sdk';
import type { Workflow, WorkflowContext } from '../types.js';
import { saveMemory } from '../tools/notion.js';

interface ParsedMemory {
  type: 'Contact' | 'Deadline';
  subject: string;
  rule: string;
  expires: string | null;
}

async function parseMemory(raw: string): Promise<ParsedMemory> {
  const client = new Anthropic();
  const today = new Date().toISOString().split('T')[0];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Today is ${today}. Extract structured memory from this user input: "${raw}"

Return ONLY a JSON object with these fields:
- type: "Contact" or "Deadline"
- subject: email address for contacts, topic keyword for deadlines
- rule: the instruction (what to do when this comes up)
- expires: ISO date string YYYY-MM-DD if a deadline date is mentioned, otherwise null

Examples:
Input: "ishan@example.com is my lead investor, always urgent"
Output: {"type":"Contact","subject":"ishan@example.com","rule":"lead investor, always treat as urgent","expires":null}

Input: "home insurance renewal due May 15"
Output: {"type":"Deadline","subject":"home insurance renewal","rule":"flag any related emails as urgent","expires":"2026-05-15"}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text') as
    | Anthropic.TextBlock
    | undefined;
  if (!textBlock) throw new Error('Claude returned no text response');

  const match = textBlock.text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude response contained no JSON object');
  return JSON.parse(match[0]) as ParsedMemory;
}

export const learnMemoryWorkflow: Workflow = {
  name: 'learn-memory',
  async run(ctx: WorkflowContext) {
    const raw = ctx.input?.trim();
    if (!raw) {
      await ctx.postToSlack('Usage: `/learn <what you want me to remember>`');
      return;
    }

    let parsed: ParsedMemory;
    try {
      parsed = await parseMemory(raw);
    } catch {
      await ctx.postToSlack('Sorry, I couldn\'t understand that. Try: `/learn ishan@example.com is my investor, always urgent`');
      return;
    }

    await saveMemory({ ...parsed, raw });

    let confirmation: string;
    if (parsed.type === 'Contact') {
      confirmation = `Got it! I'll remember that ${parsed.subject}: ${parsed.rule}.`;
    } else {
      const due = parsed.expires ? ` until ${parsed.expires}` : '';
      confirmation = `Got it! I'll flag any emails related to "${parsed.subject}"${due}: ${parsed.rule}.`;
    }

    await ctx.postToSlack(confirmation);
  },
};
