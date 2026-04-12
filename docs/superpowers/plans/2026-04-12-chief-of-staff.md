# AI Chief of Staff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vercel-hosted AI Chief of Staff that triages Gmail, converts email threads to Notion tasks, and delivers a daily Slack digest — with a tiered approval system for high-risk actions.

**Architecture:** Vercel serverless functions handle Slack slash commands, interactive button clicks, and cron triggers. Each trigger runs a named workflow through a shared Anthropic SDK agent loop that calls direct API wrappers (Gmail, Calendar, Notion, Slack). High-risk actions are serialized to Vercel KV and surfaced as Slack approval buttons; the interactive handler picks them up and executes on approval.

**Tech Stack:** TypeScript, Vercel (serverless + cron), Anthropic SDK (`claude-sonnet-4-6`), `@slack/web-api`, `googleapis`, `@notionhq/client`, `@vercel/kv`, `zod`, `vitest`

---

## File Map

| File | Responsibility |
|---|---|
| `src/types.ts` | All shared TypeScript interfaces (Tool, Workflow, ApprovalRequest) |
| `src/tools/gmail.ts` | Gmail API wrapper — list, search, draft, send, label |
| `src/tools/calendar.ts` | Google Calendar API wrapper — list events, detect conflicts |
| `src/tools/notion.ts` | Notion API wrapper — create task, search pages, update page |
| `src/tools/slack.ts` | Slack Web API wrapper — post message, open modal |
| `src/agent/tools.ts` | Tool registry — maps names to implementations + Anthropic schemas |
| `src/agent/autonomy.ts` | Risk classifier — returns `'low'` or `'high'` for a tool name |
| `src/agent/approval-store.ts` | Vercel KV-backed store for pending approval requests |
| `src/agent/loop.ts` | Anthropic SDK agent loop — runs tool calls, checks autonomy gate |
| `src/workflows/inbox-triage.ts` | Inbox triage workflow |
| `src/workflows/thread-to-task.ts` | Thread-to-task workflow |
| `src/workflows/daily-digest.ts` | Daily digest workflow |
| `src/workflows/registry.ts` | Workflow registry — maps names to workflow functions |
| `src/slack/verify.ts` | Slack request signature verification (HMAC-SHA256) |
| `src/slack/approval.ts` | Builds and posts Slack approval messages with action buttons |
| `api/slack/commands.ts` | Vercel function — handles `/triage` and `/task` slash commands |
| `api/slack/interactive.ts` | Vercel function — handles approval button clicks |
| `api/cron/digest.ts` | Vercel cron function — triggers daily digest at 7am |
| `api/cron/triage.ts` | Vercel cron function — triggers inbox triage every 2 hours |

Tests mirror `src/` under `tests/`:

| Test File | What it covers |
|---|---|
| `tests/tools/gmail.test.ts` | Each Gmail tool function with mocked `googleapis` |
| `tests/tools/calendar.test.ts` | Each Calendar tool function |
| `tests/tools/notion.test.ts` | Each Notion tool function |
| `tests/tools/slack.test.ts` | Each Slack tool function |
| `tests/agent/autonomy.test.ts` | Risk classification for all tool names |
| `tests/agent/approval-store.test.ts` | KV save/get/delete with mocked `@vercel/kv` |
| `tests/agent/loop.test.ts` | Agent loop: end_turn, tool calls, high-risk gate, max iterations |
| `tests/workflows/inbox-triage.test.ts` | Triage workflow with mocked agent loop |
| `tests/workflows/thread-to-task.test.ts` | Thread-to-task workflow |
| `tests/workflows/daily-digest.test.ts` | Digest workflow |
| `tests/slack/verify.test.ts` | Signature verification pass/fail cases |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vercel.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialize git and create package.json**

```bash
cd "/Users/ishandhodapkar/Chief of staff"
git init
```

Create `package.json`:

```json
{
  "name": "chief-of-staff",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vercel dev",
    "build": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@notionhq/client": "^2.2.15",
    "@slack/web-api": "^7.3.4",
    "@vercel/kv": "^3.0.0",
    "googleapis": "^144.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.5.4",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": ".vercel/output",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*", "api/**/*"],
  "exclude": ["node_modules", "tests"]
}
```

- [ ] **Step 3: Create vercel.json**

```json
{
  "crons": [
    { "path": "/api/cron/digest", "schedule": "0 7 * * *" },
    { "path": "/api/cron/triage", "schedule": "0 */2 * * *" }
  ],
  "functions": {
    "api/**/*.ts": { "maxDuration": 300 }
  }
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
```

- [ ] **Step 5: Create .env.example**

```
ANTHROPIC_API_KEY=
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
NOTION_API_KEY=
NOTION_DATABASE_ID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
DIGEST_CHANNEL_ID=
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
.env.local
.env
.vercel/
dist/
*.tsbuildinfo
```

- [ ] **Step 7: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npm run build
```

Expected: exits with code 0 (no source files yet, but config is valid).

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json vercel.json .env.example .gitignore vitest.config.ts
git commit -m "chore: project scaffolding"
```

---

## Task 2: Shared Type Definitions

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript accepts the file**

```bash
npm run build
```

Expected: exits with code 0.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "chore: add shared type definitions"
```

---

## Task 3: Gmail Tool

**Files:**
- Create: `src/tools/gmail.ts`
- Create: `tests/tools/gmail.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/gmail.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock googleapis before importing the module under test
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    gmail: vi.fn().mockReturnValue({
      users: {
        messages: {
          list: vi.fn(),
          get: vi.fn(),
          send: vi.fn(),
          modify: vi.fn(),
        },
        drafts: {
          create: vi.fn(),
        },
      },
    }),
  },
}));

import { google } from 'googleapis';
import {
  listEmails,
  searchThread,
  saveDraft,
  sendEmail,
  labelEmail,
} from '@/tools/gmail';

describe('listEmails', () => {
  it('returns a list of email summaries', async () => {
    const mockMessages = {
      data: {
        messages: [{ id: 'msg1' }, { id: 'msg2' }],
      },
    };
    const mockMessage = {
      data: {
        id: 'msg1',
        snippet: 'Hello world',
        payload: {
          headers: [
            { name: 'From', value: 'alice@example.com' },
            { name: 'Subject', value: 'Test Subject' },
            { name: 'Date', value: '2026-04-12' },
          ],
        },
        labelIds: ['UNREAD'],
      },
    };

    const gmail = google.gmail({ version: 'v1' });
    vi.mocked(gmail.users.messages.list).mockResolvedValue(mockMessages as never);
    vi.mocked(gmail.users.messages.get).mockResolvedValue(mockMessage as never);

    const result = await listEmails({ maxResults: 2 });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'msg1',
      from: 'alice@example.com',
      subject: 'Test Subject',
      snippet: 'Hello world',
    });
  });
});

describe('searchThread', () => {
  it('returns the most recent matching thread', async () => {
    const mockList = { data: { messages: [{ id: 'thread1', threadId: 't1' }] } };
    const mockGet = {
      data: {
        id: 'thread1',
        snippet: 'Thread content',
        payload: {
          headers: [
            { name: 'From', value: 'bob@example.com' },
            { name: 'Subject', value: 'Investor follow-up' },
            { name: 'Date', value: '2026-04-12' },
          ],
          body: { data: Buffer.from('Email body text').toString('base64') },
        },
        labelIds: [],
      },
    };
    const gmail = google.gmail({ version: 'v1' });
    vi.mocked(gmail.users.messages.list).mockResolvedValue(mockList as never);
    vi.mocked(gmail.users.messages.get).mockResolvedValue(mockGet as never);

    const result = await searchThread({ query: 'investor follow-up' });

    expect(result).not.toBeNull();
    expect(result?.subject).toBe('Investor follow-up');
  });

  it('returns null when no thread found', async () => {
    const gmail = google.gmail({ version: 'v1' });
    vi.mocked(gmail.users.messages.list).mockResolvedValue({
      data: { messages: [] },
    } as never);

    const result = await searchThread({ query: 'nonexistent' });
    expect(result).toBeNull();
  });
});

describe('labelEmail', () => {
  it('applies the given label to an email', async () => {
    const gmail = google.gmail({ version: 'v1' });
    vi.mocked(gmail.users.messages.modify).mockResolvedValue({
      data: { id: 'msg1' },
    } as never);

    const result = await labelEmail({ messageId: 'msg1', label: 'urgent' });
    expect(result).toEqual({ success: true, messageId: 'msg1' });
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm test tests/tools/gmail.test.ts
```

Expected: FAIL — `Cannot find module '@/tools/gmail'`

- [ ] **Step 3: Implement src/tools/gmail.ts**

```typescript
import { google } from 'googleapis';

function getGmailClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth });
}

function getHeader(headers: Array<{ name?: string | null; value?: string | null }>, name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  labels: string[];
}

export async function listEmails(args: Record<string, unknown>): Promise<EmailSummary[]> {
  const maxResults = (args.maxResults as number) ?? 50;
  const gmail = getGmailClient();

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['UNREAD'],
    maxResults,
  });

  const messages = listRes.data.messages ?? [];

  const summaries = await Promise.all(
    messages.map(async (msg) => {
      const getRes = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      const headers = getRes.data.payload?.headers ?? [];
      return {
        id: getRes.data.id!,
        threadId: getRes.data.threadId ?? '',
        from: getHeader(headers, 'From'),
        subject: getHeader(headers, 'Subject'),
        date: getHeader(headers, 'Date'),
        snippet: getRes.data.snippet ?? '',
        labels: getRes.data.labelIds ?? [],
      };
    })
  );

  return summaries;
}

export interface ThreadDetail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  body: string;
  snippet: string;
}

export async function searchThread(args: Record<string, unknown>): Promise<ThreadDetail | null> {
  const query = args.query as string;
  const gmail = getGmailClient();

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 1,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return null;

  const getRes = await gmail.users.messages.get({
    userId: 'me',
    id: messages[0].id!,
    format: 'full',
  });

  const headers = getRes.data.payload?.headers ?? [];
  const bodyData = getRes.data.payload?.body?.data ?? '';
  const body = bodyData
    ? Buffer.from(bodyData, 'base64').toString('utf-8')
    : getRes.data.snippet ?? '';

  return {
    id: getRes.data.id!,
    threadId: getRes.data.threadId ?? '',
    subject: getHeader(headers, 'Subject'),
    from: getHeader(headers, 'From'),
    date: getHeader(headers, 'Date'),
    body,
    snippet: getRes.data.snippet ?? '',
  };
}

export async function saveDraft(args: Record<string, unknown>): Promise<{ draftId: string }> {
  const { to, subject, body } = args as { to: string; subject: string; body: string };
  const gmail = getGmailClient();

  const rawMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\n');

  const encoded = Buffer.from(rawMessage).toString('base64url');

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw: encoded } },
  });

  return { draftId: res.data.id! };
}

export async function sendEmail(args: Record<string, unknown>): Promise<{ messageId: string }> {
  const { to, subject, body } = args as { to: string; subject: string; body: string };
  const gmail = getGmailClient();

  const rawMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\n');

  const encoded = Buffer.from(rawMessage).toString('base64url');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });

  return { messageId: res.data.id! };
}

export async function labelEmail(args: Record<string, unknown>): Promise<{ success: boolean; messageId: string }> {
  const { messageId, label } = args as { messageId: string; label: string };
  const gmail = getGmailClient();

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: [label.toUpperCase()] },
  });

  return { success: true, messageId };
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/tools/gmail.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/tools/gmail.ts tests/tools/gmail.test.ts
git commit -m "feat: gmail tool wrapper"
```

---

## Task 4: Google Calendar Tool

**Files:**
- Create: `src/tools/calendar.ts`
- Create: `tests/tools/calendar.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/calendar.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({ setCredentials: vi.fn() })),
    },
    calendar: vi.fn().mockReturnValue({
      events: {
        list: vi.fn(),
      },
    }),
  },
}));

import { google } from 'googleapis';
import { listTodayEvents, detectConflicts } from '@/tools/calendar';

describe('listTodayEvents', () => {
  it('returns formatted events for today', async () => {
    const now = new Date('2026-04-12T09:00:00Z');
    const calendar = google.calendar({ version: 'v3' });
    vi.mocked(calendar.events.list).mockResolvedValue({
      data: {
        items: [
          {
            id: 'evt1',
            summary: 'Team Standup',
            start: { dateTime: '2026-04-12T10:00:00Z' },
            end: { dateTime: '2026-04-12T10:30:00Z' },
            attendees: [{ email: 'alice@example.com' }],
          },
        ],
      },
    } as never);

    const result = await listTodayEvents({});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'evt1',
      title: 'Team Standup',
    });
  });
});

describe('detectConflicts', () => {
  it('identifies overlapping events', async () => {
    const calendar = google.calendar({ version: 'v3' });
    vi.mocked(calendar.events.list).mockResolvedValue({
      data: {
        items: [
          {
            id: 'evt1',
            summary: 'Meeting A',
            start: { dateTime: '2026-04-12T10:00:00Z' },
            end: { dateTime: '2026-04-12T11:00:00Z' },
          },
          {
            id: 'evt2',
            summary: 'Meeting B',
            start: { dateTime: '2026-04-12T10:30:00Z' },
            end: { dateTime: '2026-04-12T11:30:00Z' },
          },
        ],
      },
    } as never);

    const result = await detectConflicts({});
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      event1: 'Meeting A',
      event2: 'Meeting B',
    });
  });

  it('returns no conflicts when events do not overlap', async () => {
    const calendar = google.calendar({ version: 'v3' });
    vi.mocked(calendar.events.list).mockResolvedValue({
      data: {
        items: [
          {
            id: 'evt1',
            summary: 'Meeting A',
            start: { dateTime: '2026-04-12T09:00:00Z' },
            end: { dateTime: '2026-04-12T10:00:00Z' },
          },
          {
            id: 'evt2',
            summary: 'Meeting B',
            start: { dateTime: '2026-04-12T10:00:00Z' },
            end: { dateTime: '2026-04-12T11:00:00Z' },
          },
        ],
      },
    } as never);

    const result = await detectConflicts({});
    expect(result.conflicts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm test tests/tools/calendar.test.ts
```

Expected: FAIL — `Cannot find module '@/tools/calendar'`

- [ ] **Step 3: Implement src/tools/calendar.ts**

```typescript
import { google } from 'googleapis';

function getCalendarClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: 'v3', auth });
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
  description: string;
}

export async function listTodayEvents(_args: Record<string, unknown>): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay,
    timeMax: endOfDay,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (res.data.items ?? []).map((item) => ({
    id: item.id ?? '',
    title: item.summary ?? '(no title)',
    start: item.start?.dateTime ?? item.start?.date ?? '',
    end: item.end?.dateTime ?? item.end?.date ?? '',
    attendees: (item.attendees ?? []).map((a) => a.email ?? '').filter(Boolean),
    description: item.description ?? '',
  }));
}

export interface ConflictReport {
  conflicts: Array<{ event1: string; event2: string; overlapMinutes: number }>;
}

export async function detectConflicts(_args: Record<string, unknown>): Promise<ConflictReport> {
  const events = await listTodayEvents({});
  const conflicts: ConflictReport['conflicts'] = [];

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      const aStart = new Date(a.start).getTime();
      const aEnd = new Date(a.end).getTime();
      const bStart = new Date(b.start).getTime();
      const bEnd = new Date(b.end).getTime();

      const overlapStart = Math.max(aStart, bStart);
      const overlapEnd = Math.min(aEnd, bEnd);

      if (overlapEnd > overlapStart) {
        conflicts.push({
          event1: a.title,
          event2: b.title,
          overlapMinutes: Math.round((overlapEnd - overlapStart) / 60000),
        });
      }
    }
  }

  return { conflicts };
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/tools/calendar.test.ts
```

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/tools/calendar.ts tests/tools/calendar.test.ts
git commit -m "feat: calendar tool wrapper"
```

---

## Task 5: Notion Tool

**Files:**
- Create: `src/tools/notion.ts`
- Create: `tests/tools/notion.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/notion.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    pages: {
      create: vi.fn(),
      update: vi.fn(),
    },
    databases: {
      query: vi.fn(),
    },
  })),
}));

import { Client } from '@notionhq/client';
import { createTask, searchPages, updatePage } from '@/tools/notion';

describe('createTask', () => {
  it('creates a Notion page and returns its URL', async () => {
    const client = new Client();
    vi.mocked(client.pages.create).mockResolvedValue({
      id: 'page123',
      url: 'https://notion.so/page123',
    } as never);

    const result = await createTask({
      title: 'Send investor deck',
      deadline: '2026-04-18',
      stakeholders: 'Sarah Chen',
      context: 'Investor wants deck before Friday call',
      sourceId: 'thread_abc',
    });

    expect(result).toMatchObject({
      pageId: 'page123',
      url: 'https://notion.so/page123',
    });
  });
});

describe('searchPages', () => {
  it('returns matching pages from the database', async () => {
    const client = new Client();
    vi.mocked(client.databases.query).mockResolvedValue({
      results: [
        {
          id: 'page1',
          url: 'https://notion.so/page1',
          properties: {
            Name: { title: [{ plain_text: 'Send investor deck' }] },
          },
        },
      ],
    } as never);

    const result = await searchPages({ query: 'investor' });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Send investor deck');
  });
});

describe('updatePage', () => {
  it('updates a page property and returns success', async () => {
    const client = new Client();
    vi.mocked(client.pages.update).mockResolvedValue({ id: 'page1' } as never);

    const result = await updatePage({
      pageId: 'page1',
      status: 'In Progress',
    });

    expect(result).toEqual({ success: true, pageId: 'page1' });
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm test tests/tools/notion.test.ts
```

Expected: FAIL — `Cannot find module '@/tools/notion'`

- [ ] **Step 3: Implement src/tools/notion.ts**

```typescript
import { Client } from '@notionhq/client';

function getNotionClient() {
  return new Client({ auth: process.env.NOTION_API_KEY });
}

export interface NotionTask {
  pageId: string;
  url: string;
}

export async function createTask(args: Record<string, unknown>): Promise<NotionTask> {
  const { title, deadline, stakeholders, context, sourceId } = args as {
    title: string;
    deadline?: string;
    stakeholders?: string;
    context?: string;
    sourceId?: string;
  };

  const notion = getNotionClient();
  const databaseId = process.env.NOTION_DATABASE_ID!;

  const properties: Record<string, unknown> = {
    Name: { title: [{ text: { content: title } }] },
    Status: { select: { name: 'To Do' } },
  };

  if (deadline) {
    properties['Deadline'] = { date: { start: deadline } };
  }
  if (stakeholders) {
    properties['Stakeholders'] = { rich_text: [{ text: { content: stakeholders } }] };
  }
  if (context) {
    properties['Context'] = { rich_text: [{ text: { content: context } }] };
  }
  if (sourceId) {
    properties['Source'] = { rich_text: [{ text: { content: sourceId } }] };
  }

  const res = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: properties as never,
  });

  return { pageId: (res as { id: string }).id, url: (res as { url: string }).url };
}

export interface PageResult {
  pageId: string;
  title: string;
  url: string;
}

export async function searchPages(args: Record<string, unknown>): Promise<PageResult[]> {
  const { query } = args as { query: string };
  const notion = getNotionClient();
  const databaseId = process.env.NOTION_DATABASE_ID!;

  const res = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'Name',
      title: { contains: query },
    },
    page_size: 10,
  });

  return res.results.map((page: unknown) => {
    const p = page as {
      id: string;
      url: string;
      properties: { Name: { title: Array<{ plain_text: string }> } };
    };
    return {
      pageId: p.id,
      title: p.properties.Name.title[0]?.plain_text ?? '',
      url: p.url,
    };
  });
}

export async function updatePage(args: Record<string, unknown>): Promise<{ success: boolean; pageId: string }> {
  const { pageId, status } = args as { pageId: string; status: string };
  const notion = getNotionClient();

  await notion.pages.update({
    page_id: pageId,
    properties: {
      Status: { select: { name: status } },
    } as never,
  });

  return { success: true, pageId };
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/tools/notion.test.ts
```

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/tools/notion.ts tests/tools/notion.test.ts
git commit -m "feat: notion tool wrapper"
```

---

## Task 6: Slack Tool

**Files:**
- Create: `src/tools/slack.ts`
- Create: `tests/tools/slack.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/slack.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      postMessage: vi.fn(),
    },
    views: {
      open: vi.fn(),
    },
  })),
}));

import { WebClient } from '@slack/web-api';
import { postMessage, openModal } from '@/tools/slack';

describe('postMessage', () => {
  it('posts a text message to a channel', async () => {
    const client = new WebClient();
    vi.mocked(client.chat.postMessage).mockResolvedValue({
      ok: true,
      ts: '1234567890.000001',
    } as never);

    const result = await postMessage({
      channel: 'C12345',
      text: 'Hello from the agent',
    });

    expect(result).toMatchObject({ ok: true, ts: '1234567890.000001' });
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C12345', text: 'Hello from the agent' })
    );
  });
});

describe('openModal', () => {
  it('opens a Slack modal with the provided view', async () => {
    const client = new WebClient();
    vi.mocked(client.views.open).mockResolvedValue({ ok: true } as never);

    const result = await openModal({
      triggerId: 'trigger_abc',
      title: 'Edit Draft',
      body: 'Draft email content here',
      callbackId: 'edit_draft_modal',
    });

    expect(result).toMatchObject({ ok: true });
    expect(client.views.open).toHaveBeenCalledWith(
      expect.objectContaining({ trigger_id: 'trigger_abc' })
    );
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm test tests/tools/slack.test.ts
```

Expected: FAIL — `Cannot find module '@/tools/slack'`

- [ ] **Step 3: Implement src/tools/slack.ts**

```typescript
import { WebClient } from '@slack/web-api';

function getSlackClient() {
  return new WebClient(process.env.SLACK_BOT_TOKEN);
}

export async function postMessage(args: Record<string, unknown>): Promise<{ ok: boolean; ts?: string }> {
  const { channel, text, blocks } = args as {
    channel: string;
    text: string;
    blocks?: unknown[];
  };

  const client = getSlackClient();
  const res = await client.chat.postMessage({
    channel,
    text,
    blocks: blocks as never,
  });

  return { ok: res.ok ?? false, ts: res.ts };
}

export async function openModal(args: Record<string, unknown>): Promise<{ ok: boolean }> {
  const { triggerId, title, body, callbackId } = args as {
    triggerId: string;
    title: string;
    body: string;
    callbackId: string;
  };

  const client = getSlackClient();
  const res = await client.views.open({
    trigger_id: triggerId,
    view: {
      type: 'modal',
      callback_id: callbackId,
      title: { type: 'plain_text', text: title },
      submit: { type: 'plain_text', text: 'Submit' },
      close: { type: 'plain_text', text: 'Cancel' },
      blocks: [
        {
          type: 'input',
          block_id: 'content_block',
          label: { type: 'plain_text', text: 'Content' },
          element: {
            type: 'plain_text_input',
            action_id: 'content_input',
            multiline: true,
            initial_value: body,
          },
        },
      ],
    },
  });

  return { ok: res.ok ?? false };
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/tools/slack.test.ts
```

Expected: PASS — all 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/tools/slack.ts tests/tools/slack.test.ts
git commit -m "feat: slack tool wrapper"
```

---

## Task 7: Tool Registry and Autonomy Gate

**Files:**
- Create: `src/agent/autonomy.ts`
- Create: `src/agent/tools.ts`
- Create: `tests/agent/autonomy.test.ts`

- [ ] **Step 1: Write the failing tests for autonomy**

Create `tests/agent/autonomy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getRiskLevel } from '@/agent/autonomy';

describe('getRiskLevel', () => {
  it('returns low for read/label/create operations', () => {
    expect(getRiskLevel('list_emails')).toBe('low');
    expect(getRiskLevel('label_email')).toBe('low');
    expect(getRiskLevel('save_draft')).toBe('low');
    expect(getRiskLevel('list_today_events')).toBe('low');
    expect(getRiskLevel('detect_conflicts')).toBe('low');
    expect(getRiskLevel('create_task')).toBe('low');
    expect(getRiskLevel('update_page')).toBe('low');
    expect(getRiskLevel('search_pages')).toBe('low');
    expect(getRiskLevel('search_thread')).toBe('low');
  });

  it('returns high for send/delete/modify operations', () => {
    expect(getRiskLevel('send_email')).toBe('high');
  });

  it('defaults to high for unknown tool names', () => {
    expect(getRiskLevel('unknown_tool')).toBe('high');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test tests/agent/autonomy.test.ts
```

Expected: FAIL — `Cannot find module '@/agent/autonomy'`

- [ ] **Step 3: Implement src/agent/autonomy.ts**

```typescript
const LOW_RISK_TOOLS = new Set([
  'list_emails',
  'search_thread',
  'save_draft',
  'label_email',
  'list_today_events',
  'detect_conflicts',
  'create_task',
  'search_pages',
  'update_page',
  'post_message',
]);

export function getRiskLevel(toolName: string): 'low' | 'high' {
  return LOW_RISK_TOOLS.has(toolName) ? 'low' : 'high';
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/agent/autonomy.test.ts
```

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Create src/agent/tools.ts**

This file assembles all tools into the format the Anthropic SDK expects.

```typescript
import type { Tool } from '@/types';
import { listEmails, searchThread, saveDraft, sendEmail, labelEmail } from '@/tools/gmail';
import { listTodayEvents, detectConflicts } from '@/tools/calendar';
import { createTask, searchPages, updatePage } from '@/tools/notion';
import { postMessage } from '@/tools/slack';
import { getRiskLevel } from './autonomy';

const toolDefs: Omit<Tool, 'riskLevel'>[] = [
  {
    name: 'list_emails',
    description: 'Fetch the most recent unread emails from Gmail.',
    input_schema: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: 'Max number of emails to fetch (default 50)' },
      },
      required: [],
    },
    execute: listEmails,
  },
  {
    name: 'search_thread',
    description: 'Search Gmail for a thread matching the query. Returns the most recent match.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (e.g. "investor follow-up from:sarah")' },
      },
      required: ['query'],
    },
    execute: searchThread,
  },
  {
    name: 'save_draft',
    description: 'Save an email reply as a Gmail draft (does NOT send it).',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body text' },
      },
      required: ['to', 'subject', 'body'],
    },
    execute: saveDraft,
  },
  {
    name: 'send_email',
    description: 'Send an email. HIGH RISK — requires CEO approval.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body text' },
      },
      required: ['to', 'subject', 'body'],
    },
    execute: sendEmail,
  },
  {
    name: 'label_email',
    description: 'Apply a label to an email (urgent, needs-reply, FYI, newsletter, can-ignore).',
    input_schema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Gmail message ID' },
        label: { type: 'string', description: 'Label to apply' },
      },
      required: ['messageId', 'label'],
    },
    execute: labelEmail,
  },
  {
    name: 'list_today_events',
    description: 'Get all calendar events scheduled for today.',
    input_schema: { type: 'object', properties: {}, required: [] },
    execute: listTodayEvents,
  },
  {
    name: 'detect_conflicts',
    description: 'Identify overlapping calendar events today.',
    input_schema: { type: 'object', properties: {}, required: [] },
    execute: detectConflicts,
  },
  {
    name: 'create_task',
    description: 'Create a structured task in the Notion CEO task database.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        deadline: { type: 'string', description: 'Deadline in YYYY-MM-DD format' },
        stakeholders: { type: 'string', description: 'Comma-separated stakeholder names or emails' },
        context: { type: 'string', description: 'Brief context summary' },
        sourceId: { type: 'string', description: 'Gmail message or thread ID this task came from' },
      },
      required: ['title'],
    },
    execute: createTask,
  },
  {
    name: 'search_pages',
    description: 'Search the Notion task database by title keyword.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword' },
      },
      required: ['query'],
    },
    execute: searchPages,
  },
  {
    name: 'update_page',
    description: 'Update the status of a Notion task page.',
    input_schema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Notion page ID' },
        status: { type: 'string', description: 'New status: To Do, In Progress, or Done' },
      },
      required: ['pageId', 'status'],
    },
    execute: updatePage,
  },
  {
    name: 'post_message',
    description: 'Post a message to a Slack channel.',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Slack channel ID' },
        text: { type: 'string', description: 'Message text' },
      },
      required: ['channel', 'text'],
    },
    execute: postMessage,
  },
];

export const ALL_TOOLS: Tool[] = toolDefs.map((t) => ({
  ...t,
  riskLevel: getRiskLevel(t.name),
}));
```

- [ ] **Step 6: Verify TypeScript**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/agent/autonomy.ts src/agent/tools.ts tests/agent/autonomy.test.ts
git commit -m "feat: tool registry and autonomy gate"
```

---

## Task 8: Approval Store (Vercel KV)

**Files:**
- Create: `src/agent/approval-store.ts`
- Create: `tests/agent/approval-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/agent/approval-store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/kv', () => ({
  kv: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
}));

import { kv } from '@vercel/kv';
import { saveApproval, getApproval, deleteApproval } from '@/agent/approval-store';
import type { ApprovalRequest } from '@/types';

const mockRequest: ApprovalRequest = {
  id: 'test-uuid-1234',
  toolName: 'send_email',
  args: { to: 'sarah@example.com', subject: 'Follow up', body: 'Hi Sarah' },
  description: 'Send follow-up email to Sarah',
  createdAt: Date.now(),
};

describe('saveApproval', () => {
  it('saves an approval request to KV with 1hr TTL', async () => {
    vi.mocked(kv.set).mockResolvedValue('OK');
    await saveApproval(mockRequest);
    expect(kv.set).toHaveBeenCalledWith(
      `approval:${mockRequest.id}`,
      mockRequest,
      { ex: 3600 }
    );
  });
});

describe('getApproval', () => {
  it('retrieves an approval request by ID', async () => {
    vi.mocked(kv.get).mockResolvedValue(mockRequest);
    const result = await getApproval(mockRequest.id);
    expect(result).toEqual(mockRequest);
  });

  it('returns null when not found', async () => {
    vi.mocked(kv.get).mockResolvedValue(null);
    const result = await getApproval('nonexistent');
    expect(result).toBeNull();
  });
});

describe('deleteApproval', () => {
  it('deletes an approval request from KV', async () => {
    vi.mocked(kv.del).mockResolvedValue(1);
    await deleteApproval(mockRequest.id);
    expect(kv.del).toHaveBeenCalledWith(`approval:${mockRequest.id}`);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm test tests/agent/approval-store.test.ts
```

Expected: FAIL — `Cannot find module '@/agent/approval-store'`

- [ ] **Step 3: Implement src/agent/approval-store.ts**

```typescript
import { kv } from '@vercel/kv';
import type { ApprovalRequest } from '@/types';

const KEY_PREFIX = 'approval:';

export async function saveApproval(request: ApprovalRequest): Promise<void> {
  await kv.set(`${KEY_PREFIX}${request.id}`, request, { ex: 3600 });
}

export async function getApproval(id: string): Promise<ApprovalRequest | null> {
  return kv.get<ApprovalRequest>(`${KEY_PREFIX}${id}`);
}

export async function deleteApproval(id: string): Promise<void> {
  await kv.del(`${KEY_PREFIX}${id}`);
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/agent/approval-store.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/agent/approval-store.ts tests/agent/approval-store.test.ts
git commit -m "feat: approval store backed by Vercel KV"
```

---

## Task 9: Agent Loop

**Files:**
- Create: `src/agent/loop.ts`
- Create: `tests/agent/loop.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/agent/loop.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}));

vi.mock('@/agent/approval-store', () => ({
  saveApproval: vi.fn(),
}));

import Anthropic from '@anthropic-ai/sdk';
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

describe('runAgentLoop', () => {
  it('returns summary when Claude stops with end_turn', async () => {
    const client = new Anthropic();
    vi.mocked(client.messages.create).mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Triage complete. 3 emails processed.' }],
    } as never);

    const result = await runAgentLoop('Triage my inbox', [mockTool], 'C_DIGEST');

    expect(result.summary).toBe('Triage complete. 3 emails processed.');
    expect(result.pendingApprovals).toHaveLength(0);
  });

  it('executes low-risk tool calls and continues the loop', async () => {
    const client = new Anthropic();
    vi.mocked(client.messages.create)
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'call1', name: 'list_emails', input: {} },
        ],
      } as never)
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Done.' }],
      } as never);

    const result = await runAgentLoop('Triage inbox', [mockTool], 'C_DIGEST');

    expect(mockTool.execute).toHaveBeenCalledWith({});
    expect(result.summary).toBe('Done.');
  });

  it('queues high-risk tools to approval store instead of executing', async () => {
    const client = new Anthropic();
    vi.mocked(client.messages.create)
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
      } as never)
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Queued for approval.' }],
      } as never);

    const result = await runAgentLoop('Send a reply', [highRiskTool], 'C_DIGEST');

    expect(highRiskTool.execute).not.toHaveBeenCalled();
    expect(saveApproval).toHaveBeenCalledOnce();
    expect(result.pendingApprovals).toHaveLength(1);
    expect(result.pendingApprovals[0].toolName).toBe('send_email');
  });

  it('stops after maxIterations and returns partial results', async () => {
    const client = new Anthropic();
    vi.mocked(client.messages.create).mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'callN', name: 'list_emails', input: {} }],
    } as never);

    const result = await runAgentLoop('Loop forever', [mockTool], 'C_DIGEST', 3);

    expect(result.summary).toContain('max iterations');
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm test tests/agent/loop.test.ts
```

Expected: FAIL — `Cannot find module '@/agent/loop'`

- [ ] **Step 3: Implement src/agent/loop.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import type { Tool, AgentResult, ApprovalRequest } from '@/types';
import { saveApproval } from './approval-store';

export async function runAgentLoop(
  prompt: string,
  tools: Tool[],
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
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: anthropicTools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      const summary = textBlock?.type === 'text' ? textBlock.text : '';
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
    summary: `Agent reached max iterations (${maxIterations}). Partial results above.`,
    pendingApprovals,
  };
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/agent/loop.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/agent/loop.ts tests/agent/loop.test.ts
git commit -m "feat: anthropic sdk agent loop with tiered autonomy"
```

---

## Task 10: Inbox Triage Workflow

**Files:**
- Create: `src/workflows/inbox-triage.ts`
- Create: `tests/workflows/inbox-triage.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/workflows/inbox-triage.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/agent/loop', () => ({
  runAgentLoop: vi.fn(),
}));

import { runAgentLoop } from '@/agent/loop';
import { inboxTriageWorkflow } from '@/workflows/inbox-triage';
import type { WorkflowContext } from '@/types';

describe('inboxTriageWorkflow', () => {
  it('runs the agent loop with triage prompt and posts result to Slack', async () => {
    vi.mocked(runAgentLoop).mockResolvedValue({
      summary: '14 emails processed. 2 urgent, 3 need replies.',
      pendingApprovals: [],
    });

    const postToSlack = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkflowContext = { postToSlack };

    await inboxTriageWorkflow.run(ctx);

    expect(runAgentLoop).toHaveBeenCalledOnce();
    const [prompt] = vi.mocked(runAgentLoop).mock.calls[0];
    expect(prompt).toContain('triage');

    expect(postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('14 emails processed')
    );
  });

  it('posts pending approvals to Slack when high-risk actions are queued', async () => {
    vi.mocked(runAgentLoop).mockResolvedValue({
      summary: 'Triage done.',
      pendingApprovals: [
        {
          id: 'uuid-1',
          toolName: 'send_email',
          args: { to: 'sarah@example.com', subject: 'Hi', body: 'Hello' },
          description: 'send_email to sarah@example.com',
          createdAt: Date.now(),
        },
      ],
    });

    const postToSlack = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkflowContext = { postToSlack };

    await inboxTriageWorkflow.run(ctx);

    // Should post the summary AND a separate approval request message
    expect(postToSlack).toHaveBeenCalledTimes(2);
    const approvalCall = vi.mocked(postToSlack).mock.calls[1][0] as string;
    expect(approvalCall).toContain('approval');
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm test tests/workflows/inbox-triage.test.ts
```

Expected: FAIL — `Cannot find module '@/workflows/inbox-triage'`

- [ ] **Step 3: Implement src/workflows/inbox-triage.ts**

```typescript
import type { Workflow, WorkflowContext } from '@/types';
import { ALL_TOOLS } from '@/agent/tools';
import { runAgentLoop } from '@/agent/loop';

const TRIAGE_PROMPT = `
You are an AI Chief of Staff. Your task is to triage the CEO's inbox.

1. Call list_emails to fetch the 50 most recent unread emails.
2. For each email, use label_email to apply one of these labels: urgent, needs-reply, FYI, newsletter, can-ignore.
   - urgent: requires the CEO's attention today
   - needs-reply: CEO should respond but not time-critical
   - FYI: informational, no action needed
   - newsletter: bulk/marketing email
   - can-ignore: spam or low-value
3. For emails labeled urgent or needs-reply, use save_draft to write a suggested reply.
4. Summarize what you did: how many emails, how many in each category, what drafts you saved.

Be concise. Do not explain your reasoning for every email — just do it and summarize.
`.trim();

export const inboxTriageWorkflow: Workflow = {
  name: 'inbox-triage',
  async run(ctx: WorkflowContext) {
    const channelId = process.env.DIGEST_CHANNEL_ID!;
    const result = await runAgentLoop(TRIAGE_PROMPT, ALL_TOOLS, channelId);

    await ctx.postToSlack(`*Inbox Triage Complete*\n\n${result.summary}`);

    for (const approval of result.pendingApprovals) {
      await ctx.postToSlack(
        `*Action requires your approval*\n\n${approval.description}\n\nApproval ID: \`${approval.id}\`\n_(Tap Approve or Cancel below)_`
      );
    }
  },
};
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/workflows/inbox-triage.test.ts
```

Expected: PASS — all 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/workflows/inbox-triage.ts tests/workflows/inbox-triage.test.ts
git commit -m "feat: inbox triage workflow"
```

---

## Task 11: Thread-to-Task Workflow

**Files:**
- Create: `src/workflows/thread-to-task.ts`
- Create: `tests/workflows/thread-to-task.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/workflows/thread-to-task.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/agent/loop', () => ({
  runAgentLoop: vi.fn(),
}));

import { runAgentLoop } from '@/agent/loop';
import { threadToTaskWorkflow } from '@/workflows/thread-to-task';
import type { WorkflowContext } from '@/types';

describe('threadToTaskWorkflow', () => {
  it('passes the user query into the agent prompt', async () => {
    vi.mocked(runAgentLoop).mockResolvedValue({
      summary: 'Created task: Send investor deck by Friday → https://notion.so/abc',
      pendingApprovals: [],
    });

    const postToSlack = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkflowContext = {
      postToSlack,
      input: 'investor follow-up from Sarah',
    };

    await threadToTaskWorkflow.run(ctx);

    const [prompt] = vi.mocked(runAgentLoop).mock.calls[0];
    expect(prompt).toContain('investor follow-up from Sarah');
    expect(postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('Created task')
    );
  });

  it('returns an error message when no input provided', async () => {
    const postToSlack = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkflowContext = { postToSlack };

    await threadToTaskWorkflow.run(ctx);

    expect(postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('search query')
    );
    expect(runAgentLoop).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm test tests/workflows/thread-to-task.test.ts
```

Expected: FAIL — `Cannot find module '@/workflows/thread-to-task'`

- [ ] **Step 3: Implement src/workflows/thread-to-task.ts**

```typescript
import type { Workflow, WorkflowContext } from '@/types';
import { ALL_TOOLS } from '@/agent/tools';
import { runAgentLoop } from '@/agent/loop';

export const threadToTaskWorkflow: Workflow = {
  name: 'thread-to-task',
  async run(ctx: WorkflowContext) {
    if (!ctx.input) {
      await ctx.postToSlack(
        'Please provide a search query. Usage: `/task [email subject or keywords]`'
      );
      return;
    }

    const channelId = process.env.DIGEST_CHANNEL_ID!;

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
  },
};
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/workflows/thread-to-task.test.ts
```

Expected: PASS — all 2 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/workflows/thread-to-task.ts tests/workflows/thread-to-task.test.ts
git commit -m "feat: thread-to-task workflow"
```

---

## Task 12: Daily Digest Workflow

**Files:**
- Create: `src/workflows/daily-digest.ts`
- Create: `tests/workflows/daily-digest.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/workflows/daily-digest.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/agent/loop', () => ({
  runAgentLoop: vi.fn(),
}));

import { runAgentLoop } from '@/agent/loop';
import { dailyDigestWorkflow } from '@/workflows/daily-digest';
import type { WorkflowContext } from '@/types';

describe('dailyDigestWorkflow', () => {
  it('runs the agent and posts the digest to Slack', async () => {
    vi.mocked(runAgentLoop).mockResolvedValue({
      summary: '*Good morning.* Here is your briefing for April 12...',
      pendingApprovals: [],
    });

    const postToSlack = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkflowContext = { postToSlack };

    await dailyDigestWorkflow.run(ctx);

    expect(runAgentLoop).toHaveBeenCalledOnce();
    const [prompt] = vi.mocked(runAgentLoop).mock.calls[0];
    expect(prompt).toContain('morning briefing');

    expect(postToSlack).toHaveBeenCalledWith(
      expect.stringContaining('Good morning')
    );
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm test tests/workflows/daily-digest.test.ts
```

Expected: FAIL — `Cannot find module '@/workflows/daily-digest'`

- [ ] **Step 3: Implement src/workflows/daily-digest.ts**

```typescript
import type { Workflow, WorkflowContext } from '@/types';
import { ALL_TOOLS } from '@/agent/tools';
import { runAgentLoop } from '@/agent/loop';

const DIGEST_PROMPT = `
You are an AI Chief of Staff preparing the CEO's morning briefing for today.

Run these steps in parallel (call all three tools before synthesizing):
1. list_emails — fetch the 50 most recent unread emails
2. list_today_events — get today's calendar
3. search_pages — search Notion for tasks with query "To Do" to find open tasks

Then synthesize a structured morning briefing with these sections:

**Good morning.** Here is your briefing for [today's date].

**📧 Top Emails** (max 3 most urgent)
- For each: sender, subject, one-sentence summary, suggested action

**📅 Today's Calendar** 
- List each event with time and attendees
- Flag any scheduling conflicts detected by detect_conflicts

**✅ Open Tasks**
- List overdue or due-today Notion tasks

**⏳ Pending Approvals**
- List any actions currently awaiting your approval

Keep it tight. The CEO reads this in 2 minutes.
`.trim();

export const dailyDigestWorkflow: Workflow = {
  name: 'daily-digest',
  async run(ctx: WorkflowContext) {
    const channelId = process.env.DIGEST_CHANNEL_ID!;
    const result = await runAgentLoop(DIGEST_PROMPT, ALL_TOOLS, channelId);
    await ctx.postToSlack(result.summary);
  },
};
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/workflows/daily-digest.test.ts
```

Expected: PASS — 1 test green.

- [ ] **Step 5: Commit**

```bash
git add src/workflows/daily-digest.ts tests/workflows/daily-digest.test.ts
git commit -m "feat: daily digest workflow"
```

---

## Task 13: Workflow Registry

**Files:**
- Create: `src/workflows/registry.ts`

- [ ] **Step 1: Create src/workflows/registry.ts**

```typescript
import type { Workflow } from '@/types';
import { inboxTriageWorkflow } from './inbox-triage';
import { threadToTaskWorkflow } from './thread-to-task';
import { dailyDigestWorkflow } from './daily-digest';

const workflows: Map<string, Workflow> = new Map([
  ['inbox-triage', inboxTriageWorkflow],
  ['thread-to-task', threadToTaskWorkflow],
  ['daily-digest', dailyDigestWorkflow],
]);

export function getWorkflow(name: string): Workflow | undefined {
  return workflows.get(name);
}

export function getAllWorkflows(): Workflow[] {
  return Array.from(workflows.values());
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/workflows/registry.ts
git commit -m "feat: workflow registry"
```

---

## Task 14: Slack Request Verification and Approval Messages

**Files:**
- Create: `src/slack/verify.ts`
- Create: `src/slack/approval.ts`
- Create: `tests/slack/verify.test.ts`

- [ ] **Step 1: Write failing tests for signature verification**

Create `tests/slack/verify.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { verifySlackSignature } from '@/slack/verify';
import { createHmac } from 'crypto';

const SIGNING_SECRET = 'test_signing_secret_abc123';

function makeSignature(secret: string, timestamp: string, body: string): string {
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = createHmac('sha256', secret);
  return `v0=${hmac.update(baseString).digest('hex')}`;
}

describe('verifySlackSignature', () => {
  it('returns true for a valid signature', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = 'command=%2Ftriage&text=&user_id=U12345';
    const signature = makeSignature(SIGNING_SECRET, timestamp, body);

    expect(
      verifySlackSignature(SIGNING_SECRET, signature, timestamp, body)
    ).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = 'command=%2Ftriage&text=&user_id=U12345';

    expect(
      verifySlackSignature(SIGNING_SECRET, 'v0=bad_signature', timestamp, body)
    ).toBe(false);
  });

  it('returns false for a timestamp older than 5 minutes', () => {
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400);
    const body = 'command=%2Ftriage';
    const signature = makeSignature(SIGNING_SECRET, oldTimestamp, body);

    expect(
      verifySlackSignature(SIGNING_SECRET, signature, oldTimestamp, body)
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
npm test tests/slack/verify.test.ts
```

Expected: FAIL — `Cannot find module '@/slack/verify'`

- [ ] **Step 3: Implement src/slack/verify.ts**

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return false; // Reject requests older than 5 minutes
  }

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = createHmac('sha256', signingSecret);
  const expected = `v0=${hmac.update(baseString).digest('hex')}`;

  // Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/slack/verify.test.ts
```

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Implement src/slack/approval.ts**

```typescript
import { WebClient } from '@slack/web-api';
import type { ApprovalRequest } from '@/types';

export async function postApprovalMessage(
  approval: ApprovalRequest,
  channelId: string
): Promise<void> {
  const client = new WebClient(process.env.SLACK_BOT_TOKEN);

  await client.chat.postMessage({
    channel: channelId,
    text: `Action requires your approval: ${approval.description}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Action requires your approval*\n\n*Tool:* \`${approval.toolName}\`\n*Details:* ${approval.description}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve' },
            style: 'primary',
            action_id: 'approve_action',
            value: approval.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Cancel' },
            style: 'danger',
            action_id: 'cancel_action',
            value: approval.id,
          },
        ],
      },
    ],
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/slack/verify.ts src/slack/approval.ts tests/slack/verify.test.ts
git commit -m "feat: slack request verification and approval messages"
```

---

## Task 15: Slack API Routes (Vercel Functions)

**Files:**
- Create: `api/slack/commands.ts`
- Create: `api/slack/interactive.ts`

- [ ] **Step 1: Create api/slack/commands.ts**

This function handles `/triage` and `/task` slash commands.

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySlackSignature } from '@/slack/verify';
import { getWorkflow } from '@/workflows/registry';
import { postMessage } from '@/tools/slack';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const signature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  const rawBody = JSON.stringify(req.body);

  if (!verifySlackSignature(process.env.SLACK_SIGNING_SECRET!, signature, timestamp, rawBody)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Ack Slack immediately (3-second requirement)
  res.status(200).json({ response_type: 'in_channel', text: 'Working on it...' });

  // Process async after response is sent
  const { command, text, user_id } = req.body as {
    command: string;
    text: string;
    user_id: string;
  };

  const channelId = process.env.DIGEST_CHANNEL_ID!;

  const postToSlack = async (message: string) => {
    await postMessage({ channel: channelId, text: message });
  };

  if (command === '/triage') {
    const workflow = getWorkflow('inbox-triage');
    await workflow?.run({ slackUserId: user_id, postToSlack });
  } else if (command === '/task') {
    const workflow = getWorkflow('thread-to-task');
    await workflow?.run({ slackUserId: user_id, input: text, postToSlack });
  } else {
    await postToSlack(`Unknown command: ${command}`);
  }
}
```

- [ ] **Step 2: Create api/slack/interactive.ts**

This function handles approval button clicks.

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySlackSignature } from '@/slack/verify';
import { getApproval, deleteApproval } from '@/agent/approval-store';
import { ALL_TOOLS } from '@/agent/tools';
import { postMessage } from '@/tools/slack';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const signature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  const rawBody = JSON.stringify(req.body);

  if (!verifySlackSignature(process.env.SLACK_SIGNING_SECRET!, signature, timestamp, rawBody)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Ack immediately
  res.status(200).end();

  const payload = JSON.parse(req.body.payload as string) as {
    actions: Array<{ action_id: string; value: string }>;
  };

  const action = payload.actions[0];
  const approvalId = action.value;
  const channelId = process.env.DIGEST_CHANNEL_ID!;

  const approval = await getApproval(approvalId);
  if (!approval) {
    await postMessage({ channel: channelId, text: `Approval \`${approvalId}\` has expired or was already processed.` });
    return;
  }

  if (action.action_id === 'cancel_action') {
    await deleteApproval(approvalId);
    await postMessage({ channel: channelId, text: `Cancelled: ${approval.description}` });
    return;
  }

  if (action.action_id === 'approve_action') {
    const tool = ALL_TOOLS.find((t) => t.name === approval.toolName);
    if (!tool) {
      await postMessage({ channel: channelId, text: `Error: tool \`${approval.toolName}\` not found.` });
      return;
    }

    try {
      const result = await tool.execute(approval.args);
      await deleteApproval(approvalId);
      await postMessage({
        channel: channelId,
        text: `Done: ${approval.description}\n\`\`\`${JSON.stringify(result, null, 2)}\`\`\``,
      });
    } catch (err) {
      await postMessage({
        channel: channelId,
        text: `Error executing ${approval.toolName}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add api/slack/commands.ts api/slack/interactive.ts
git commit -m "feat: vercel functions for slack commands and interactive approvals"
```

---

## Task 16: Cron API Routes

**Files:**
- Create: `api/cron/digest.ts`
- Create: `api/cron/triage.ts`

- [ ] **Step 1: Create api/cron/digest.ts**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getWorkflow } from '@/workflows/registry';
import { postMessage } from '@/tools/slack';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // Vercel cron calls use GET. Any other method is unexpected.
  const channelId = process.env.DIGEST_CHANNEL_ID!;

  const postToSlack = async (message: string) => {
    await postMessage({ channel: channelId, text: message });
  };

  try {
    const workflow = getWorkflow('daily-digest');
    await workflow?.run({ postToSlack });
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await postMessage({
      channel: channelId,
      text: `Daily digest failed: ${message}`,
    });
    res.status(500).json({ error: message });
  }
}
```

- [ ] **Step 2: Create api/cron/triage.ts**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getWorkflow } from '@/workflows/registry';
import { postMessage } from '@/tools/slack';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const channelId = process.env.DIGEST_CHANNEL_ID!;

  const postToSlack = async (message: string) => {
    await postMessage({ channel: channelId, text: message });
  };

  try {
    const workflow = getWorkflow('inbox-triage');
    await workflow?.run({ postToSlack });
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await postMessage({
      channel: channelId,
      text: `Inbox triage failed: ${message}`,
    });
    res.status(500).json({ error: message });
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npm run build
```

Expected: exits 0.

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/cron/digest.ts api/cron/triage.ts
git commit -m "feat: vercel cron functions for digest and triage"
```

---

## Task 17: Google OAuth Token Setup Script

**Files:**
- Create: `scripts/get-google-token.ts`

This one-time script lets the user authorize Google access and obtain a refresh token to store in Vercel env vars.

- [ ] **Step 1: Create scripts/get-google-token.ts**

```typescript
import { google } from 'googleapis';
import * as http from 'http';
import * as url from 'url';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = 'http://localhost:3001/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.readonly',
];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\n1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. After authorizing, you will be redirected to localhost:3001.');
console.log('   The refresh token will be printed here.\n');

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url!, true);
  const code = parsedUrl.query.code as string;

  if (code) {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n✅ GOOGLE_REFRESH_TOKEN:', tokens.refresh_token);
    console.log('\nAdd this to your Vercel environment variables.\n');
    res.end('Done! You can close this tab.');
    server.close();
  }
});

server.listen(3001);
```

- [ ] **Step 2: Add a script entry in package.json**

Edit `package.json` scripts section:

```json
"get-google-token": "npx tsx scripts/get-google-token.ts"
```

- [ ] **Step 3: Commit**

```bash
git add scripts/get-google-token.ts package.json
git commit -m "chore: google oauth token helper script"
```

---

## Task 18: Vercel Deployment

- [ ] **Step 1: Install Vercel CLI**

```bash
npm install -g vercel
```

- [ ] **Step 2: Link project to Vercel**

```bash
vercel link
```

Follow prompts: create a new project named `chief-of-staff`.

- [ ] **Step 3: Add Vercel KV storage**

In the Vercel dashboard → Storage → Create Database → KV. Copy the `KV_REST_API_URL` and `KV_REST_API_TOKEN` values.

- [ ] **Step 4: Set all environment variables in Vercel**

```bash
vercel env add ANTHROPIC_API_KEY
vercel env add SLACK_BOT_TOKEN
vercel env add SLACK_SIGNING_SECRET
vercel env add NOTION_API_KEY
vercel env add NOTION_DATABASE_ID
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
vercel env add GOOGLE_REFRESH_TOKEN
vercel env add DIGEST_CHANNEL_ID
vercel env add KV_REST_API_URL
vercel env add KV_REST_API_TOKEN
```

Enter the value for each when prompted. Select `Production`, `Preview`, and `Development` for each.

- [ ] **Step 5: Configure Slack app**

In your Slack app settings (api.slack.com/apps):

1. **Slash Commands** → Create commands:
   - `/triage` → Request URL: `https://<your-vercel-url>/api/slack/commands`
   - `/task` → Request URL: `https://<your-vercel-url>/api/slack/commands`

2. **Interactivity & Shortcuts** → Enable → Request URL: `https://<your-vercel-url>/api/slack/interactive`

3. **OAuth & Permissions** → Bot Token Scopes:
   - `chat:write`
   - `commands`
   - `views:open`

4. Install app to workspace and copy `SLACK_BOT_TOKEN`.

- [ ] **Step 6: Deploy to Vercel**

```bash
vercel --prod
```

Expected: Deployment URL printed. All 4 API routes visible in Vercel dashboard.

- [ ] **Step 7: Smoke test**

Run `/triage` in your Slack workspace. Expected: "Working on it..." followed within ~30s by a triage summary in `#chief-of-staff`.

Run `/task investor follow-up` in Slack. Expected: A Notion task URL posted to `#chief-of-staff`.

Wait for the next 7am cron trigger (or manually hit `https://<url>/api/cron/digest` via curl) to verify the daily digest.

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "chore: vercel deployment configuration"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 3 workflows built. Tiered autonomy implemented. Vercel cron for digest (7am) and triage (every 2hrs). Approval flow via KV + interactive handler. Slack signature verification. Secrets in Vercel env vars.
- [x] **No placeholders:** All steps contain actual code.
- [x] **Type consistency:** `ApprovalRequest`, `WorkflowContext`, `AgentResult`, `Tool` used consistently across all tasks. `runAgentLoop` signature identical in loop.ts, tests, and workflow callers.
- [x] **Spec alignment:** `.env.example` matches env var list in spec. Tool names in `autonomy.ts` match tool names in `tools.ts`. High-risk classification matches spec table.
