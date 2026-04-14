# /learn Memory Feature Design

**Date:** 2026-04-14  
**Status:** Approved

## Overview

Add a `/learn` Slack slash command that lets the user teach the AI Chief of Staff personalized context — contact profiles and upcoming deadlines. Memories are stored in a dedicated Notion database and injected into the triage and digest prompts so the agent can apply user-defined logic when sorting and prioritizing emails.

---

## Data Model

A new Notion database called **"Memory"** — separate from the existing tasks database, identified by env var `NOTION_MEMORY_DATABASE_ID`.

| Field | Notion Type | Purpose |
|---|---|---|
| Name | Title | Subject — email address for contacts, keyword/topic for deadlines |
| Type | Select | `Contact` or `Deadline` |
| Rule | Rich text | The full memory instruction (e.g. "lead investor, always treat as urgent") |
| Expires | Date | Optional — deadline entries expire after this date and are excluded from injection |
| Raw | Rich text | Original freeform text the user typed via `/learn` |

**Expiry behavior:** `listMemories()` filters out any entry where `Expires` is set and is in the past. This prevents stale deadline entries from polluting prompts.

---

## `/learn` Command Flow

**Input:** `/learn <freeform text>`

Examples:
- `/learn ishan@example.com is my lead investor, always urgent`
- `/learn home insurance renewal due May 15`

**Steps:**

1. Commands handler (`src/handlers/slack/commands.ts`) routes `/learn` to the `learn-memory` workflow — same pattern as existing commands.
2. `learn-memory` workflow makes a single Claude call (not a full agent loop) to extract structured fields from the freeform text:
   ```json
   { "type": "Contact", "subject": "ishan@example.com", "rule": "lead investor, always treat as urgent", "expires": null }
   ```
   For deadline entries, Claude extracts an ISO date for `expires`:
   ```json
   { "type": "Deadline", "subject": "home insurance renewal", "rule": "flag any related emails as urgent", "expires": "2026-05-15" }
   ```
3. Calls `saveMemory()` to write the parsed entry to the Notion Memory database.
4. Posts a confirmation to Slack (to `DIGEST_CHANNEL_ID`, same as all other commands):
   - Contact: `Got it! I'll remember that ishan@example.com is your lead investor and treat their emails as urgent.`
   - Deadline: `Got it! I'll flag any emails related to home insurance renewal until May 15.`

---

## Prompt Injection

At the start of both `inbox-triage.ts` and `daily-digest.ts`, before `runAgentLoop` is called:

1. Call `listMemories()` — fetches all non-expired entries from the Memory database.
2. If entries exist, format into a context block and prepend to the prompt:

```
Your personalized context:

Contacts:
- ishan@example.com: lead investor, always treat as urgent
- mom@gmail.com: family, always high priority

Deadlines to watch for:
- Home insurance renewal (due May 15): flag any related emails as urgent
```

3. If no memories exist, the block is omitted entirely — no change to existing behavior.

---

## New Code Surface

| File | Change |
|---|---|
| `src/tools/notion.ts` | Add `saveMemory()` and `listMemories()` functions |
| `src/workflows/learn-memory.ts` | New workflow — single Claude extraction call + Notion save |
| `src/workflows/registry.ts` | Register `learn-memory` workflow |
| `src/workflows/inbox-triage.ts` | Fetch memories and prepend context block before `runAgentLoop` |
| `src/workflows/daily-digest.ts` | Same as above |
| `src/handlers/slack/commands.ts` | Add `/learn` else-if branch |

**New environment variable:** `NOTION_MEMORY_DATABASE_ID`

---

## Out of Scope

- Editing or deleting memories via Slack (user edits directly in Notion)
- Sorting rules beyond contact profiles and deadlines (e.g. "always archive newsletters from X")
- Memory search tool for the agent (all memories loaded upfront; revisit if volume becomes a problem)
- Multi-user memory isolation (single user for now)
