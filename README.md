# Chief of Staff

An AI agent that manages your inbox, tasks, and calendar — entirely from Slack.

---

## Why I Built This

Senior executives spend a disproportionate amount of their time on work that is important but not strategic: reading emails, deciding what to act on, creating tasks, rescheduling meetings. A human chief of staff handles this layer so the executive can focus on decisions only they can make.

This project is that, but built as software. The agent reads your Gmail, makes judgment calls about what matters, drafts replies in the right context and tone, creates and tracks tasks in Notion, manages your calendar, and learns over time through plain-English instructions from Slack. It never sends an email without your approval.

The core design principle: the agent should do the work, not summarize it for you to do.

---

## What It Does

### Slash Commands

| Command | What it does |
|---------|-------------|
| `/triage` | Reads your 10 most recent unread emails, classifies each one, writes draft replies for anything urgent or needing a response, and creates Notion tasks |
| `/task [query]` | Searches for a specific email thread and turns it into a structured Notion task with deadline, stakeholders, priority, and context |
| `/cal [instruction]` | Manages your Google Calendar in plain English: move events, cancel them, reschedule them, with automatic conflict detection |
| `/todos` | Lists all open tasks from your Notion database |
| `/learn [instruction]` | Teaches the agent something new, a contact rule: a deadline, or a current priority — with optional expiry dates |

### Automated Runs

| Trigger | What it does |
|---------|-------------|
| Every 2 hours | Runs inbox triage automatically |
| Every day at 7am | Posts a daily digest summarizing the day ahead |

---

## How It Works

### The Agent Loop

Every command runs through the same core loop:

1. A Slack slash command hits a Vercel serverless function
2. The function returns a 200 immediately — Slack has a hard 3-second timeout, so the agent acknowledges instantly and does the real work async via `waitUntil()`
3. The agent sends a prompt to Claude Sonnet 4.6 along with a set of available tools
4. Claude responds with tool calls — read emails, create tasks, save drafts, move calendar events
5. The loop executes each tool call, feeds the result back to Claude, and continues
6. When Claude is done, the summary posts back to Slack

The loop runs for a maximum of 10 iterations and handles tool errors gracefully without stopping.

### Memory and Context

The agent has a two-layer context system that shapes every workflow run.

**Live memory** is stored in a Notion database. Every time a workflow runs, the agent fetches all active memory entries and prepends them to the prompt before calling Claude. Instructions you teach the agent via `/learn` immediately affect every future run — no redeployment, no config changes.

Memory has two types:
- **Contact** — a rule tied to a person or email address (e.g. "always treat as urgent", "no forward-looking statements")
- **Deadline** — a time-sensitive topic to watch for across all emails (e.g. "board meeting tomorrow", "Series B closing May 1")

Both types support an optional expiry date. Expired entries are filtered out automatically. The agent's context stays sharp because memory ages out on its own, you don't have to clean it up.

**The prompt** is the second layer. Each workflow has a base prompt defining its standing behavior. The memory context is prepended to this prompt at runtime, so the agent always has both the fixed instructions and the current personal context. Changing the prompt changes the behavior permanently; changing memory changes it temporarily and contextually.

### Trust and Autonomy

Every tool is classified as either low-risk or high-risk before executing.

**Low-risk tools** execute immediately with no approval:
- Reading emails, drafts, and calendar events
- Labeling emails
- Saving Gmail drafts
- Creating and updating Notion tasks
- Moving and deleting calendar events
- Posting Slack messages

**High-risk tools** are queued for human approval before executing:
- `send_email` — the agent composes the email, posts Approve/Cancel buttons in Slack, and waits. Nothing sends until you click Approve. Pending approvals expire after 1 hour.

This boundary is intentional. Drafts let the agent do the work while keeping you in control of what actually goes out. The trust model can expand as confidence in the agent's judgment grows.

### Workflow Architecture

Each capability is a self-contained workflow — a named function that takes a context object and runs an agent loop with a specific prompt and tool set.

```
Slack command
    ↓
Handler (verify signature → return 200 → run async)
    ↓
Workflow (base prompt + memory context + tools)
    ↓
Agent loop (Claude Sonnet 4.6, up to 10 iterations)
    ↓
Tool calls execute (Gmail / Notion / Calendar / Slack)
    ↓
Summary posted to Slack
```

Workflows are registered in a central registry. Adding a new workflow means writing a new file and adding one line to the registry — nothing else changes.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Vercel Serverless Functions (Node.js) |
| AI model | Claude Sonnet 4.6 via Anthropic SDK |
| Email | Gmail API (Google OAuth) |
| Tasks | Notion API |
| Calendar | Google Calendar API |
| Slack | Slack Web API + slash commands |
| Approval state | Vercel KV (Redis) — 1-hour TTL |
| Scheduling | Vercel Cron |
| Language | TypeScript (ESM) |
| Build | tsup |
| Tests | Vitest |

---

## Tools

The agent has access to 14 tools across 4 integrations. Each tool has a name, a description, a JSON input schema, an execute function, and a risk classification.

### Gmail
| Tool | Risk | Description |
|------|------|-------------|
| `list_emails` | Low | Fetch most recent unread emails |
| `search_thread` | Low | Search for a thread by query |
| `save_draft` | Low | Save an email reply as a Gmail draft |
| `send_email` | **High** | Send an email — requires approval |
| `label_email` | Low | Apply a label (urgent, needs-reply, FYI, newsletter, can-ignore) |

### Google Calendar
| Tool | Risk | Description |
|------|------|-------------|
| `list_today_events` | Low | Get today's calendar events |
| `list_events` | Low | Get events for any specific date |
| `detect_conflicts` | Low | Find overlapping events |
| `update_event` | Low | Change event time, title, or description |
| `delete_event` | Low | Cancel an event |

### Notion
| Tool | Risk | Description |
|------|------|-------------|
| `create_task` | Low | Create a task with title, deadline, stakeholders, priority, and source |
| `search_pages` | Low | Search tasks by title keyword |
| `update_page` | Low | Update a task's status |

### Slack
| Tool | Risk | Description |
|------|------|-------------|
| `post_message` | Low | Post a message to a channel |

---

## Extensibility

The system is designed to grow in two directions: new tools and new workflows.

### Adding New Tools

A tool is a TypeScript object with a name, a description, a JSON schema for its inputs, an execute function, and a risk level. Adding one means:

1. Implement the API client function in `src/tools/`
2. Add the tool definition to `src/agent/tools.ts`
3. Classify it in `src/agent/autonomy.ts`

Any workflow that uses `ALL_TOOLS` immediately has access to the new tool on the next deploy.

Popular services like HubSpot, Linear, and Salesforce expose MCP (Model Context Protocol) servers. The tool layer can proxy MCP calls, which means new integrations can be onboarded without writing API client code from scratch — you point the agent at the MCP server and the tools become available automatically.

### Adding New Workflows

A workflow is a prompt plus a set of tools. The behavior lives in the prompt, the agent figures out the execution. Adding one means:

1. Write a `src/workflows/my-workflow.ts` file with the prompt and a call to `runAgentLoop`
2. Register it in `src/workflows/registry.ts`
3. Add a slash command handler in `src/handlers/slack/commands.ts`

Because workflows are just prompts with tools attached, new behaviors can be described in plain English and translated directly into a workflow file. This opens the door to a workflow builder where non-engineers describe what they want in a sentence, the system handles the translation using the same Claude API that powers the agent itself.

---





