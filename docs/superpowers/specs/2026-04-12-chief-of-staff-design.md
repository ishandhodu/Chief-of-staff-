# AI Chief of Staff — Design Spec

**Date:** 2026-04-12
**Status:** Approved

---

## Problem Statement

A startup CEO's time is the scarcest resource in the company. The majority of a CEO's administrative overhead — reading and triaging email, converting conversations to tasks, preparing for meetings — is repetitive, structured work that does not require human judgment at every step. This system automates that work, surfaces only what needs a decision, and does it in the tools the CEO already lives in.

---

## Goals

1. Automate inbox triage so the CEO sees a prioritized summary, not 50 raw emails
2. Convert email threads to structured Notion tasks with one Slack command
3. Deliver a morning digest that combines email, calendar, and open tasks into one briefing
4. Act autonomously on low-stakes actions; require approval for high-stakes actions
5. Be extensible — adding a new workflow should require one file, not a rewrite
6. Deploy on Vercel with secrets stored in Vercel Environment Variables

---

## Non-Goals

- HubSpot / CRM integration (out of scope for v1)
- Web dashboard UI
- Multi-user support (single CEO for v1)
- Mobile interface

---

## Architecture

The system has four layers with clean separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                      VERCEL PLATFORM                         │
│                                                              │
│  ┌─────────────────────────┐  ┌──────────────────────────┐  │
│  │     ENTRY POINTS        │  │     VERCEL CRON          │  │
│  │  /api/slack/events      │  │  /api/cron/digest  7am   │  │
│  │  /api/slack/interactive │  │  /api/cron/triage  */2h  │  │
│  └────────────┬────────────┘  └─────────────┬────────────┘  │
│               │                             │               │
│               └──────────────┬──────────────┘               │
│                              ▼                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 WORKFLOW REGISTRY                      │  │
│  │   daily-digest  │  inbox-triage  │  thread-to-task    │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              ▼                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   AGENT CORE                           │  │
│  │     Anthropic SDK loop  +  Tiered Autonomy Gate        │  │
│  └──────┬─────────────────┬──────────────────┬───────────┘  │
│         │                 │                  │              │
│         ▼                 ▼                  ▼              │
│    Gmail SDK        Notion SDK          Slack SDK           │
│    Calendar SDK                                             │
└─────────────────────────────────────────────────────────────┘
```

**Principle:** Entry points don't know about tools. The agent core doesn't know about workflows. Each layer has one job.

### Why direct SDKs instead of MCP sidecar servers

MCP servers typically run as stdio subprocess sidecar processes. Vercel serverless functions are stateless and ephemeral — they cannot spawn or maintain persistent subprocess connections. Instead, we wrap the same underlying APIs (Gmail API, Notion API, etc.) in a tool abstraction layer that presents an identical interface to the agent loop. The architecture is MCP-compatible by design: if we move to a persistent host in future, swapping the tool layer for MCP clients requires no changes to the agent core or workflows.

---

## Hosting: Vercel

### Function types

| Route | Type | Max duration |
|---|---|---|
| `/api/slack/events` | Vercel Serverless Function | 300s (Pro) |
| `/api/slack/interactive` | Vercel Serverless Function | 300s (Pro) |
| `/api/cron/digest` | Vercel Cron Function | 300s (Pro) |
| `/api/cron/triage` | Vercel Cron Function | 300s (Pro) |

### Slack 3-second acknowledgement

Slack requires a 200 response within 3 seconds of receiving an event. The serverless function:
1. Verifies the Slack request signature
2. Immediately returns `200 OK`
3. Uses `waitUntil()` to continue processing the agent loop asynchronously after the response is sent

This prevents Slack timeouts while allowing the agent loop to run for up to 300 seconds.

### Cron schedule (`vercel.json`)

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

---

## Secrets Management: Vercel Environment Variables

All secrets are stored in Vercel's encrypted Environment Variables (dashboard → Settings → Environment Variables). They are never committed to the repository.

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token |
| `SLACK_SIGNING_SECRET` | Slack request signature verification |
| `SLACK_APP_TOKEN` | Slack socket mode token |
| `NOTION_API_KEY` | Notion integration token |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth refresh token (offline access) |
| `DIGEST_CHANNEL_ID` | Slack channel ID for `#chief-of-staff` |

**Local development:** Variables are stored in `.env.local` (gitignored). The `.env.example` file lists all required keys with empty values and is committed to the repo.

---

## Tech Stack

| Package | Purpose |
|---|---|
| `@anthropic-ai/sdk` | Agent loop, tool use |
| `@slack/web-api` | Slack API calls (post messages, open modals) |
| `@slack/bolt` | Slack event/command/action routing |
| `googleapis` | Gmail + Google Calendar API |
| `@notionhq/client` | Notion API |
| `zod` | Tool input/output validation |
| TypeScript / Node.js | Runtime |

---

## Project Structure

```
chief-of-staff/
├── api/
│   ├── slack/
│   │   ├── events.ts          # Slack event handler (3s ack + waitUntil)
│   │   └── interactive.ts     # Approval button handler
│   └── cron/
│       ├── digest.ts          # Daily digest cron trigger
│       └── triage.ts          # Inbox triage cron trigger
├── src/
│   ├── agent/
│   │   ├── loop.ts            # Anthropic SDK agent loop
│   │   ├── autonomy.ts        # tiered autonomy gate
│   │   └── tools.ts           # tool registry (declares all tools to Claude)
│   ├── tools/                 # Direct API SDK wrappers (one file per integration)
│   │   ├── gmail.ts
│   │   ├── calendar.ts
│   │   ├── notion.ts
│   │   └── slack.ts
│   ├── workflows/
│   │   ├── registry.ts        # registers all workflows
│   │   ├── inbox-triage.ts
│   │   ├── thread-to-task.ts
│   │   └── daily-digest.ts
│   └── slack/
│       ├── bot.ts             # Bolt.js app + command/event routing
│       └── approval.ts        # approval flow (buttons + 1hr timeout)
├── vercel.json                # Cron config + function max duration
├── .env.local                 # Local dev secrets (gitignored)
├── .env.example               # Keys list with empty values (committed)
└── package.json
```

---

## The Three Workflows

### Workflow 1: Inbox Triage

**Trigger:** Vercel Cron every 2 hours + `/triage` Slack command

**Steps:**
1. Fetch last 50 unread emails from Gmail
2. For each email, Claude assigns:
   - **Label:** `urgent`, `needs-reply`, `FYI`, `newsletter`, `can-ignore`
   - **Action:** save draft reply (LOW-RISK), flag for attention, or skip
3. Post a summary card to `#chief-of-staff` Slack channel
4. HIGH-RISK actions (sending replies) surface as approve/reject buttons in Slack

**Output example:**
> "14 new emails — 2 urgent, 3 need replies. Drafts saved in Gmail. [View summary]"

---

### Workflow 2: Thread-to-Task

**Trigger:** `/task [email subject or search query]` Slack command

**Steps:**
1. CEO runs `/task "investor follow-up from Sarah"` in Slack
2. Agent searches Gmail for matching thread, reads full conversation (if multiple matches, uses most recent)
3. Claude extracts: task title, deadline, stakeholders, context summary
4. Creates structured Notion task with all fields populated
5. Posts confirmation to Slack with link to the new Notion page

**Output example:**
> "Created task: *Send investor deck to Sarah by Friday* → [Notion link]"

---

### Workflow 3: Daily Digest

**Trigger:** Vercel Cron 7:00am daily

**Steps:**
1. Fetch in parallel: last 24hrs Gmail summary, today's calendar events, open Notion tasks
2. Claude synthesizes into a structured briefing:
   - Top 3 urgent emails
   - Today's meetings with pre-meeting context (cross-referenced with recent email threads)
   - Open/overdue Notion tasks
   - Pending approvals from previous triage runs
3. Posts formatted digest to `#chief-of-staff` Slack channel

---

## Tiered Autonomy Model

### LOW-RISK — executes immediately, reports after

| Action | Tool |
|---|---|
| Label or archive an email | Gmail |
| Save a reply as draft | Gmail |
| Create a Notion task | Notion |
| Add a note to a Notion page | Notion |
| Read calendar events | Calendar |

### HIGH-RISK — posts to Slack for approval before executing

| Action | Tool |
|---|---|
| Send an email | Gmail |
| Delete or modify a calendar event | Calendar |
| Delete a Notion page | Notion |

### Approval Flow

When the agent wants to perform a HIGH-RISK action:
1. Post to Slack with a preview of the action and three buttons: ✅ Approve / ❌ Cancel / ✏️ Edit (Edit opens a Slack modal with the draft pre-filled for inline editing)
2. Wait up to 1 hour for a response
3. If approved: execute and confirm in Slack thread
4. If cancelled or timed out: skip and flag in next digest

---

## Error Handling

| Scenario | Behavior |
|---|---|
| External API unavailable | Log error, skip that tool, post degraded-mode notice to Slack |
| Claude returns malformed tool call | Retry once with clarifying prompt, then skip and log |
| Gmail/Notion API rate limit | Exponential backoff, max 3 retries |
| Approval timeout (1hr) | Cancel action, include in next digest as "expired approval" |
| Agent loop exceeds 10 tool calls | Hard stop, post partial results with note to Slack |
| Vercel function timeout (300s) | Partial results posted to Slack with a note |

---

## Extensibility

Adding a new workflow requires:
1. Create `src/workflows/<name>.ts` implementing the `Workflow` interface
2. Register it in `src/workflows/registry.ts`
3. Add a cron route in `api/cron/` or a Slack command in `src/slack/bot.ts` if needed
4. No changes to agent core or tool layer

**Future workflows (not in v1 scope):**
- Pre-meeting brief (pull context 10min before calendar event)
- Weekly rollup (Friday EOD summary)
- HubSpot CRM sync
- Investor update draft generator
- Board meeting prep package

---

## Success Criteria for Demo

1. Daily digest posts to Slack at 7am with real email/calendar/Notion data
2. `/triage` command processes inbox and posts categorized summary
3. `/task "..."` creates a populated Notion task from a real email thread
4. At least one HIGH-RISK action surfaces an approval button in Slack
5. System handles an unavailable API gracefully without crashing
6. All secrets are stored in Vercel Environment Variables, none in the repo

