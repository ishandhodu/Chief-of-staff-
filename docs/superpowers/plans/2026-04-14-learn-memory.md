# /learn Memory Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/learn` Slack command that stores contact profiles and deadline context in a Notion "Memory" database, then injects those memories into triage and digest prompts.

**Architecture:** A `learn-memory` workflow makes a single Claude call to parse freeform text into a typed memory entry, saves it to Notion, and replies to Slack. At triage/digest time, a `buildMemoryContext()` helper fetches all non-expired entries and prepends them as a formatted block to the agent prompt.

**Tech Stack:** TypeScript, Vercel serverless, Anthropic SDK (`claude-sonnet-4-6`), `@notionhq/client`, Vitest

---

## File Map

| File | Change |
|---|---|
| `src/tools/notion.ts` | Add `MemoryEntry` interface, `saveMemory()`, `listMemories()` |
| `src/agent/memory-context.ts` | New — `buildMemoryContext()` formats memory entries into a prompt block |
| `src/workflows/learn-memory.ts` | New — single Claude extraction call + `saveMemory()` + Slack confirmation |
| `src/workflows/registry.ts` | Register `learn-memory` workflow |
| `src/handlers/slack/commands.ts` | Add `/learn` else-if branch |
| `src/workflows/inbox-triage.ts` | Call `buildMemoryContext()` and prepend to prompt |
| `src/workflows/daily-digest.ts` | Call `buildMemoryContext()` and prepend to prompt |
| `tests/tools/notion.test.ts` | Add `saveMemory` and `listMemories` test cases |
| `tests/agent/memory-context.test.ts` | New — test formatting logic |
| `tests/workflows/learn-memory.test.ts` | New — test parse + save + confirm flow |
| `tests/workflows/inbox-triage.test.ts` | Add `buildMemoryContext` mock; add memory injection test |
| `tests/workflows/daily-digest.test.ts` | Add `buildMemoryContext` mock; add memory injection test |

**New env var:** `NOTION_MEMORY_DATABASE_ID`

---

## Task 1: Notion memory tools (`saveMemory` + `listMemories`)

**Files:**
- Modify: `src/tools/notion.ts`
- Modify: `tests/tools/notion.test.ts`

- [ ] **Step 1: Add `MemoryEntry` interface and `saveMemory` function to `src/tools/notion.ts`**

Append after the last existing export in `src/tools/notion.ts`:

```typescript
export interface MemoryEntry {
  pageId: string;
  subject: string;
  type: 'Contact' | 'Deadline';
  rule: string;
  expires: string | null;
  raw: string;
}

export async function saveMemory(args: {
  subject: string;
  type: 'Contact' | 'Deadline';
  rule: string;
  expires?: string | null;
  raw: string;
}): Promise<{ pageId: string }> {
  const notion = getNotionClient();
  const databaseId = process.env.NOTION_MEMORY_DATABASE_ID;
  if (!databaseId) throw new Error('NOTION_MEMORY_DATABASE_ID environment variable is not set');

  const properties: Record<string, unknown> = {
    Name: { title: [{ text: { content: args.subject } }] },
    Type: { select: { name: args.type } },
    Rule: { rich_text: [{ text: { content: args.rule } }] },
    Raw: { rich_text: [{ text: { content: args.raw } }] },
  };

  if (args.expires) {
    properties['Expires'] = { date: { start: args.expires } };
  }

  const res = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: properties as never,
  });

  const page = res as { id: string };
  if (!page.id) throw new Error('Notion API returned page without id');
  return { pageId: page.id };
}

export async function listMemories(): Promise<MemoryEntry[]> {
  const notion = getNotionClient();
  const databaseId = process.env.NOTION_MEMORY_DATABASE_ID;
  if (!databaseId) throw new Error('NOTION_MEMORY_DATABASE_ID environment variable is not set');

  const res = await notion.databases.query({
    database_id: databaseId,
    page_size: 100,
  });

  const today = new Date().toISOString().split('T')[0];

  return res.results
    .map((page: unknown) => {
      const p = page as {
        id: string;
        properties: {
          Name: { title: Array<{ plain_text: string }> };
          Type: { select: { name: string } | null };
          Rule: { rich_text: Array<{ plain_text: string }> };
          Expires: { date: { start: string } | null };
          Raw: { rich_text: Array<{ plain_text: string }> };
        };
      };
      return {
        pageId: p.id,
        subject: p.properties.Name.title[0]?.plain_text ?? '',
        type: (p.properties.Type.select?.name ?? 'Contact') as 'Contact' | 'Deadline',
        rule: p.properties.Rule.rich_text[0]?.plain_text ?? '',
        expires: p.properties.Expires.date?.start ?? null,
        raw: p.properties.Raw.rich_text[0]?.plain_text ?? '',
      };
    })
    .filter((entry) => !entry.expires || entry.expires >= today);
}
```

- [ ] **Step 2: Add `NOTION_MEMORY_DATABASE_ID` to the `beforeEach` in `tests/tools/notion.test.ts`**

Find the existing `beforeEach` block and add one line:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  process.env.NOTION_API_KEY = 'test-api-key';
  process.env.NOTION_DATABASE_ID = 'test-database-id';
  process.env.NOTION_MEMORY_DATABASE_ID = 'test-memory-db-id'; // add this line
});
```

- [ ] **Step 3: Write failing tests for `saveMemory` and `listMemories` in `tests/tools/notion.test.ts`**

Append after the existing `describe('input validation', ...)` block:

```typescript
describe('saveMemory', () => {
  it('creates a memory page with correct properties', async () => {
    mockPagesCreate.mockResolvedValue({ id: 'mem123' });

    const result = await saveMemory({
      subject: 'ishan@example.com',
      type: 'Contact',
      rule: 'lead investor, always treat as urgent',
      raw: 'ishan@example.com is my lead investor, always urgent',
    });

    expect(result).toEqual({ pageId: 'mem123' });
    expect(mockPagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: { database_id: 'test-memory-db-id' },
        properties: expect.objectContaining({
          Name: { title: [{ text: { content: 'ishan@example.com' } }] },
          Type: { select: { name: 'Contact' } },
          Rule: { rich_text: [{ text: { content: 'lead investor, always treat as urgent' } }] },
        }),
      })
    );
  });

  it('sets the Expires field when expires is provided', async () => {
    mockPagesCreate.mockResolvedValue({ id: 'mem456' });

    await saveMemory({
      subject: 'home insurance renewal',
      type: 'Deadline',
      rule: 'flag any related emails as urgent',
      expires: '2026-05-15',
      raw: 'home insurance renewal due May 15',
    });

    expect(mockPagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          Expires: { date: { start: '2026-05-15' } },
        }),
      })
    );
  });

  it('throws when NOTION_MEMORY_DATABASE_ID is not set', async () => {
    delete process.env.NOTION_MEMORY_DATABASE_ID;
    await expect(
      saveMemory({ subject: 'x', type: 'Contact', rule: 'y', raw: 'z' })
    ).rejects.toThrow('NOTION_MEMORY_DATABASE_ID');
    process.env.NOTION_MEMORY_DATABASE_ID = 'test-memory-db-id';
  });
});

describe('listMemories', () => {
  it('returns non-expired memory entries', async () => {
    mockDatabasesQuery.mockResolvedValue({
      results: [
        {
          id: 'mem1',
          properties: {
            Name: { title: [{ plain_text: 'ishan@example.com' }] },
            Type: { select: { name: 'Contact' } },
            Rule: { rich_text: [{ plain_text: 'lead investor, always urgent' }] },
            Expires: { date: null },
            Raw: { rich_text: [{ plain_text: 'ishan@example.com is my lead investor' }] },
          },
        },
        {
          id: 'mem2',
          properties: {
            Name: { title: [{ plain_text: 'home insurance' }] },
            Type: { select: { name: 'Deadline' } },
            Rule: { rich_text: [{ plain_text: 'flag related emails' }] },
            Expires: { date: { start: '2099-12-31' } },
            Raw: { rich_text: [{ plain_text: 'home insurance due Dec 31 2099' }] },
          },
        },
      ],
    });

    const result = await listMemories();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ pageId: 'mem1', subject: 'ishan@example.com', type: 'Contact' });
    expect(result[1]).toMatchObject({ pageId: 'mem2', subject: 'home insurance', expires: '2099-12-31' });
  });

  it('filters out entries where expires is in the past', async () => {
    mockDatabasesQuery.mockResolvedValue({
      results: [
        {
          id: 'expired',
          properties: {
            Name: { title: [{ plain_text: 'old deadline' }] },
            Type: { select: { name: 'Deadline' } },
            Rule: { rich_text: [{ plain_text: 'some rule' }] },
            Expires: { date: { start: '2020-01-01' } },
            Raw: { rich_text: [{ plain_text: 'old deadline' }] },
          },
        },
        {
          id: 'active',
          properties: {
            Name: { title: [{ plain_text: 'active contact' }] },
            Type: { select: { name: 'Contact' } },
            Rule: { rich_text: [{ plain_text: 'important' }] },
            Expires: { date: null },
            Raw: { rich_text: [{ plain_text: 'active contact' }] },
          },
        },
      ],
    });

    const result = await listMemories();
    expect(result).toHaveLength(1);
    expect(result[0].pageId).toBe('active');
  });
});
```

- [ ] **Step 4: Run the new tests to confirm they fail**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && npx vitest run tests/tools/notion.test.ts
```

Expected: The `saveMemory` and `listMemories` describe blocks fail with "not a function" or similar — the implementations don't exist yet in the imports.

Actually at this point the implementations ARE in notion.ts from Step 1, so they should pass. Run to confirm:

Expected output: All notion tests pass (including existing `createTask`, `searchPages`, `updatePage` tests).

- [ ] **Step 5: Commit**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && git add src/tools/notion.ts tests/tools/notion.test.ts && git commit -m "feat: add saveMemory and listMemories to notion tools"
```

---

## Task 2: Memory context helper

**Files:**
- Create: `src/agent/memory-context.ts`
- Create: `tests/agent/memory-context.test.ts`

- [ ] **Step 1: Write the failing test at `tests/agent/memory-context.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/tools/notion', () => ({
  listMemories: vi.fn(),
}));

import { listMemories } from '@/tools/notion';
import { buildMemoryContext } from '@/agent/memory-context';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildMemoryContext', () => {
  it('returns empty string when there are no memories', async () => {
    vi.mocked(listMemories).mockResolvedValue([]);
    const result = await buildMemoryContext();
    expect(result).toBe('');
  });

  it('returns a formatted contacts block', async () => {
    vi.mocked(listMemories).mockResolvedValue([
      {
        pageId: 'p1',
        subject: 'ishan@example.com',
        type: 'Contact',
        rule: 'lead investor, always urgent',
        expires: null,
        raw: 'ishan@example.com is my lead investor',
      },
    ]);

    const result = await buildMemoryContext();
    expect(result).toContain('Contacts:');
    expect(result).toContain('- ishan@example.com: lead investor, always urgent');
    expect(result).not.toContain('Deadlines');
  });

  it('returns a formatted deadlines block with due date', async () => {
    vi.mocked(listMemories).mockResolvedValue([
      {
        pageId: 'p2',
        subject: 'home insurance renewal',
        type: 'Deadline',
        rule: 'flag any related emails as urgent',
        expires: '2026-05-15',
        raw: 'home insurance renewal due May 15',
      },
    ]);

    const result = await buildMemoryContext();
    expect(result).toContain('Deadlines to watch for:');
    expect(result).toContain('- home insurance renewal (due 2026-05-15): flag any related emails as urgent');
    expect(result).not.toContain('Contacts:');
  });

  it('returns both sections when both types are present', async () => {
    vi.mocked(listMemories).mockResolvedValue([
      {
        pageId: 'p1',
        subject: 'ishan@example.com',
        type: 'Contact',
        rule: 'lead investor, always urgent',
        expires: null,
        raw: 'ishan@example.com is my lead investor',
      },
      {
        pageId: 'p2',
        subject: 'home insurance renewal',
        type: 'Deadline',
        rule: 'flag any related emails as urgent',
        expires: '2026-05-15',
        raw: 'home insurance renewal due May 15',
      },
    ]);

    const result = await buildMemoryContext();
    expect(result).toContain('Contacts:');
    expect(result).toContain('Deadlines to watch for:');
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && npx vitest run tests/agent/memory-context.test.ts
```

Expected: Fails with "Cannot find module '@/agent/memory-context'"

- [ ] **Step 3: Create `src/agent/memory-context.ts`**

```typescript
import { listMemories } from '../tools/notion.js';

export async function buildMemoryContext(): Promise<string> {
  const memories = await listMemories();
  if (memories.length === 0) return '';

  const contacts = memories.filter((m) => m.type === 'Contact');
  const deadlines = memories.filter((m) => m.type === 'Deadline');

  const lines: string[] = ['Your personalized context:\n'];

  if (contacts.length > 0) {
    lines.push('Contacts:');
    for (const c of contacts) {
      lines.push(`- ${c.subject}: ${c.rule}`);
    }
    lines.push('');
  }

  if (deadlines.length > 0) {
    lines.push('Deadlines to watch for:');
    for (const d of deadlines) {
      const due = d.expires ? ` (due ${d.expires})` : '';
      lines.push(`- ${d.subject}${due}: ${d.rule}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && npx vitest run tests/agent/memory-context.test.ts
```

Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && git add src/agent/memory-context.ts tests/agent/memory-context.test.ts && git commit -m "feat: add buildMemoryContext helper"
```

---

## Task 3: `learn-memory` workflow

**Files:**
- Create: `src/workflows/learn-memory.ts`
- Create: `tests/workflows/learn-memory.test.ts`

- [ ] **Step 1: Write the failing test at `tests/workflows/learn-memory.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

vi.mock('@/tools/notion', () => ({
  saveMemory: vi.fn().mockResolvedValue({ pageId: 'mem-new' }),
}));

import { saveMemory } from '@/tools/notion';
import { learnMemoryWorkflow } from '@/workflows/learn-memory';
import type { WorkflowContext } from '@/types';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NOTION_MEMORY_DATABASE_ID = 'test-memory-db-id';
});

function makeCtx(input: string): WorkflowContext & { postToSlack: ReturnType<typeof vi.fn> } {
  const postToSlack = vi.fn().mockResolvedValue(undefined);
  return { input, postToSlack };
}

describe('learnMemoryWorkflow', () => {
  it('parses a contact entry and posts a confirmation', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            type: 'Contact',
            subject: 'ishan@example.com',
            rule: 'lead investor, always treat as urgent',
            expires: null,
          }),
        },
      ],
    });

    const ctx = makeCtx('ishan@example.com is my lead investor, always urgent');
    await learnMemoryWorkflow.run(ctx);

    expect(saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Contact',
        subject: 'ishan@example.com',
        rule: 'lead investor, always treat as urgent',
        expires: null,
        raw: 'ishan@example.com is my lead investor, always urgent',
      })
    );
    expect(ctx.postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('ishan@example.com')
    );
  });

  it('parses a deadline entry and posts a confirmation with the due date', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            type: 'Deadline',
            subject: 'home insurance renewal',
            rule: 'flag any related emails as urgent',
            expires: '2026-05-15',
          }),
        },
      ],
    });

    const ctx = makeCtx('home insurance renewal due May 15');
    await learnMemoryWorkflow.run(ctx);

    expect(saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Deadline',
        subject: 'home insurance renewal',
        expires: '2026-05-15',
      })
    );
    expect(ctx.postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('2026-05-15')
    );
  });

  it('posts a usage message when input is empty', async () => {
    const ctx = makeCtx('');
    await learnMemoryWorkflow.run(ctx);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(saveMemory).not.toHaveBeenCalled();
    expect(ctx.postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('/learn')
    );
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && npx vitest run tests/workflows/learn-memory.test.ts
```

Expected: Fails with "Cannot find module '@/workflows/learn-memory'"

- [ ] **Step 3: Create `src/workflows/learn-memory.ts`**

```typescript
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

  const jsonText = textBlock.text.replace(/```(?:json)?\n?/g, '').trim();
  return JSON.parse(jsonText) as ParsedMemory;
}

export const learnMemoryWorkflow: Workflow = {
  name: 'learn-memory',
  async run(ctx: WorkflowContext) {
    const raw = ctx.input?.trim();
    if (!raw) {
      await ctx.postToSlack('Usage: `/learn <what you want me to remember>`');
      return;
    }

    const parsed = await parseMemory(raw);
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && npx vitest run tests/workflows/learn-memory.test.ts
```

Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && git add src/workflows/learn-memory.ts tests/workflows/learn-memory.test.ts && git commit -m "feat: add learn-memory workflow"
```

---

## Task 4: Register workflow and add `/learn` Slack command

**Files:**
- Modify: `src/workflows/registry.ts`
- Modify: `src/handlers/slack/commands.ts`

No new tests needed — the registry is a trivial map and the commands handler routing is covered by integration when Slack calls the endpoint. Run the full test suite at the end to confirm nothing broke.

- [ ] **Step 1: Register `learn-memory` in `src/workflows/registry.ts`**

Replace the entire file content:

```typescript
import type { Workflow } from '../types.js';
import { inboxTriageWorkflow } from './inbox-triage.js';
import { threadToTaskWorkflow } from './thread-to-task.js';
import { dailyDigestWorkflow } from './daily-digest.js';
import { calendarManageWorkflow } from './calendar-manage.js';
import { listTodosWorkflow } from './list-todos.js';
import { learnMemoryWorkflow } from './learn-memory.js';

const workflows: Map<string, Workflow> = new Map([
  ['inbox-triage', inboxTriageWorkflow],
  ['thread-to-task', threadToTaskWorkflow],
  ['daily-digest', dailyDigestWorkflow],
  ['calendar-manage', calendarManageWorkflow],
  ['list-todos', listTodosWorkflow],
  ['learn-memory', learnMemoryWorkflow],
]);

export function getWorkflow(name: string): Workflow | undefined {
  return workflows.get(name);
}

export function getAllWorkflows(): Workflow[] {
  return Array.from(workflows.values());
}
```

- [ ] **Step 2: Add `/learn` branch to `src/handlers/slack/commands.ts`**

Find the `else if (command === '/todos')` block and add the `/learn` branch directly after it, before the final `else`:

```typescript
} else if (command === '/learn') {
  const workflow = getWorkflow('learn-memory');
  if (!workflow) {
    await postToSlack('Workflow not found: learn-memory');
  } else {
    await workflow.run({ slackUserId: user_id, input: text, postToSlack });
  }
} else {
  await postToSlack(`Unknown command: ${command}`);
}
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && npx vitest run
```

Expected: All existing tests pass. New learn-memory tests pass.

- [ ] **Step 4: Commit**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && git add src/workflows/registry.ts src/handlers/slack/commands.ts && git commit -m "feat: register learn-memory workflow and add /learn Slack command"
```

---

## Task 5: Inject memory context into inbox triage

**Files:**
- Modify: `src/workflows/inbox-triage.ts`
- Modify: `tests/workflows/inbox-triage.test.ts`

- [ ] **Step 1: Add `buildMemoryContext` mock to `tests/workflows/inbox-triage.test.ts`**

Add these two lines after the existing `vi.mock('@/slack/approval', ...)` block:

```typescript
vi.mock('@/agent/memory-context', () => ({
  buildMemoryContext: vi.fn().mockResolvedValue(''),
}));
```

And add the import after the existing imports:

```typescript
import { buildMemoryContext } from '@/agent/memory-context';
```

- [ ] **Step 2: Add a test that verifies memory context is prepended when memories exist**

Append this describe block to `tests/workflows/inbox-triage.test.ts`:

```typescript
describe('inboxTriageWorkflow — memory injection', () => {
  it('prepends memory context to the triage prompt when memories exist', async () => {
    vi.mocked(buildMemoryContext).mockResolvedValue(
      'Your personalized context:\n\nContacts:\n- ishan@example.com: lead investor, always urgent\n'
    );
    vi.mocked(runAgentLoop).mockResolvedValue({
      summary: 'Triage done.',
      pendingApprovals: [],
    });

    const postToSlack = vi.fn().mockResolvedValue(undefined);
    await inboxTriageWorkflow.run({ postToSlack });

    const [prompt] = vi.mocked(runAgentLoop).mock.calls[0];
    expect(prompt).toContain('Your personalized context');
    expect(prompt).toContain('ishan@example.com');
    expect(prompt).toContain('triage');
  });
});
```

- [ ] **Step 3: Run existing triage tests to confirm they still pass (and the new one fails)**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && npx vitest run tests/workflows/inbox-triage.test.ts
```

Expected: The two existing tests pass. The new memory injection test fails because `inbox-triage.ts` doesn't call `buildMemoryContext` yet.

- [ ] **Step 4: Update `src/workflows/inbox-triage.ts` to call `buildMemoryContext`**

Replace the entire file:

```typescript
import type { Workflow, WorkflowContext } from '../types.js';
import { ALL_TOOLS } from '../agent/tools.js';
import { runAgentLoop } from '../agent/loop.js';
import { postApprovalMessage } from '../slack/approval.js';
import { buildMemoryContext } from '../agent/memory-context.js';

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
   For each email in the summary, include a clickable Gmail link using this format: https://mail.google.com/mail/u/0/#inbox/<messageId>

Be concise. Do not explain your reasoning for every email — just do it and summarize.
`.trim();

export const inboxTriageWorkflow: Workflow = {
  name: 'inbox-triage',
  async run(ctx: WorkflowContext) {
    const channelId = process.env.DIGEST_CHANNEL_ID;
    if (!channelId) throw new Error('DIGEST_CHANNEL_ID environment variable is not set');

    const memoryContext = await buildMemoryContext();
    const prompt = memoryContext ? `${memoryContext}\n\n${TRIAGE_PROMPT}` : TRIAGE_PROMPT;

    const result = await runAgentLoop(prompt, ALL_TOOLS, channelId);

    await ctx.postToSlack(`*Inbox Triage Complete*\n\n${result.summary}`);

    for (const approval of result.pendingApprovals) {
      await postApprovalMessage(approval, channelId);
    }
  },
};
```

- [ ] **Step 5: Run all triage tests to confirm they pass**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && npx vitest run tests/workflows/inbox-triage.test.ts
```

Expected: All 3 tests pass (2 existing + 1 new memory injection test).

- [ ] **Step 6: Commit**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && git add src/workflows/inbox-triage.ts tests/workflows/inbox-triage.test.ts && git commit -m "feat: inject memory context into inbox triage prompt"
```

---

## Task 6: Inject memory context into daily digest

**Files:**
- Modify: `src/workflows/daily-digest.ts`
- Modify: `tests/workflows/daily-digest.test.ts`

- [ ] **Step 1: Add `buildMemoryContext` mock to `tests/workflows/daily-digest.test.ts`**

Add these two lines after the existing `vi.mock('@/agent/loop', ...)` block:

```typescript
vi.mock('@/agent/memory-context', () => ({
  buildMemoryContext: vi.fn().mockResolvedValue(''),
}));
```

And add the import after the existing imports:

```typescript
import { buildMemoryContext } from '@/agent/memory-context';
```

- [ ] **Step 2: Add a test that verifies memory context is prepended when memories exist**

Append this describe block to `tests/workflows/daily-digest.test.ts`:

```typescript
describe('dailyDigestWorkflow — memory injection', () => {
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
```

- [ ] **Step 3: Run existing digest tests to confirm they still pass (and the new one fails)**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && npx vitest run tests/workflows/daily-digest.test.ts
```

Expected: The existing test passes. The new memory injection test fails.

- [ ] **Step 4: Update `src/workflows/daily-digest.ts` to call `buildMemoryContext`**

Replace the entire file:

```typescript
import type { Workflow, WorkflowContext } from '../types.js';
import { ALL_TOOLS } from '../agent/tools.js';
import { runAgentLoop } from '../agent/loop.js';
import { buildMemoryContext } from '../agent/memory-context.js';

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

    const memoryContext = await buildMemoryContext();
    const prompt = memoryContext ? `${memoryContext}\n\n${DIGEST_PROMPT}` : DIGEST_PROMPT;

    const result = await runAgentLoop(prompt, ALL_TOOLS, channelId);
    await ctx.postToSlack(result.summary);
    // pendingApprovals not surfaced in digest: approval buttons are sent by inbox-triage at triage time
  },
};
```

- [ ] **Step 5: Run all digest tests to confirm they pass**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && npx vitest run tests/workflows/daily-digest.test.ts
```

Expected: All 2 tests pass (1 existing + 1 new memory injection test).

- [ ] **Step 6: Run the full test suite to confirm everything passes**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && npx vitest run
```

Expected: All tests pass with no failures.

- [ ] **Step 7: Commit**

```bash
cd "/Users/ishandhodapkar/Chief of staff" && git add src/workflows/daily-digest.ts tests/workflows/daily-digest.test.ts && git commit -m "feat: inject memory context into daily digest prompt"
```

---

## Deployment Checklist

Before deploying, add the new env var to Vercel:

```bash
vercel env add NOTION_MEMORY_DATABASE_ID
```

Set it to the ID of the new Notion "Memory" database. The database must be created manually in Notion with these properties:
- **Name** (Title) — built-in, rename to "Name"
- **Type** (Select) — options: `Contact`, `Deadline`
- **Rule** (Text)
- **Expires** (Date)
- **Raw** (Text)

Share the database with your Notion integration token so the API can read and write to it.
