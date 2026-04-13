// src/tools/gmail.ts
import { google } from "googleapis";
function getGmailClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth });
}
function getHeader(headers, name) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}
function extractBody(payload) {
  const direct = payload?.body?.data;
  if (direct) return Buffer.from(direct, "base64").toString("utf-8");
  const part = payload?.parts?.[0]?.body?.data;
  if (part) return Buffer.from(part, "base64").toString("utf-8");
  return "";
}
async function listEmails(args) {
  const maxResults = args.maxResults ?? 50;
  const gmail = getGmailClient();
  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["UNREAD"],
    maxResults
  });
  const messages = listRes.data.messages ?? [];
  const summaries = await Promise.all(
    messages.map(async (msg) => {
      const msgId = msg.id;
      if (!msgId) throw new Error("Gmail API returned message without id");
      const getRes = await gmail.users.messages.get({
        userId: "me",
        id: msgId,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"]
      });
      const id = getRes.data.id;
      if (!id) throw new Error("Gmail API returned message without id");
      const headers = getRes.data.payload?.headers ?? [];
      return {
        id,
        threadId: getRes.data.threadId ?? "",
        from: getHeader(headers, "From"),
        subject: getHeader(headers, "Subject"),
        date: getHeader(headers, "Date"),
        snippet: getRes.data.snippet ?? "",
        labels: getRes.data.labelIds ?? []
      };
    })
  );
  return summaries;
}
async function searchThread(args) {
  if (typeof args.query !== "string" || args.query.trim() === "") {
    throw new Error("searchThread requires a non-empty query string");
  }
  const query = args.query;
  const gmail = getGmailClient();
  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 1
  });
  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return null;
  const firstMsgId = messages[0].id;
  if (!firstMsgId) throw new Error("Gmail API returned message without id");
  const getRes = await gmail.users.messages.get({
    userId: "me",
    id: firstMsgId,
    format: "full"
  });
  const id = getRes.data.id;
  if (!id) throw new Error("Gmail API returned message without id");
  const headers = getRes.data.payload?.headers ?? [];
  const body = extractBody(getRes.data.payload) || (getRes.data.snippet ?? "");
  return {
    id,
    threadId: getRes.data.threadId ?? "",
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),
    date: getHeader(headers, "Date"),
    body,
    snippet: getRes.data.snippet ?? ""
  };
}
async function saveDraft(args) {
  if (typeof args.to !== "string" || !args.to) throw new Error('saveDraft requires a non-empty "to" string');
  if (typeof args.subject !== "string" || !args.subject) throw new Error('saveDraft requires a non-empty "subject" string');
  if (typeof args.body !== "string" || !args.body) throw new Error('saveDraft requires a non-empty "body" string');
  const { to, subject, body } = args;
  const gmail = getGmailClient();
  const rawMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body
  ].join("\n");
  const encoded = Buffer.from(rawMessage).toString("base64url");
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw: encoded } }
  });
  const draftId = res.data.id;
  if (!draftId) throw new Error("Gmail API returned draft without id");
  return { draftId };
}
async function sendEmail(args) {
  if (typeof args.to !== "string" || !args.to) throw new Error('sendEmail requires a non-empty "to" string');
  if (typeof args.subject !== "string" || !args.subject) throw new Error('sendEmail requires a non-empty "subject" string');
  if (typeof args.body !== "string" || !args.body) throw new Error('sendEmail requires a non-empty "body" string');
  const { to, subject, body } = args;
  const gmail = getGmailClient();
  const rawMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body
  ].join("\n");
  const encoded = Buffer.from(rawMessage).toString("base64url");
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded }
  });
  const messageId = res.data.id;
  if (!messageId) throw new Error("Gmail API returned message without id");
  return { messageId };
}
async function getOrCreateLabel(gmail, name) {
  const listRes = await gmail.users.labels.list({ userId: "me" });
  const existing = (listRes.data.labels ?? []).find(
    (l) => l.name?.toLowerCase() === name.toLowerCase()
  );
  if (existing?.id) return existing.id;
  const createRes = await gmail.users.labels.create({
    userId: "me",
    requestBody: { name }
  });
  if (!createRes.data.id) throw new Error(`Failed to create label "${name}"`);
  return createRes.data.id;
}
async function labelEmail(args) {
  if (typeof args.messageId !== "string" || !args.messageId) throw new Error('labelEmail requires a non-empty "messageId" string');
  if (typeof args.label !== "string" || !args.label) throw new Error('labelEmail requires a non-empty "label" string');
  const { messageId, label } = args;
  const gmail = getGmailClient();
  const labelId = await getOrCreateLabel(gmail, label);
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { addLabelIds: [labelId] }
  });
  return { success: true, messageId };
}

// src/tools/calendar.ts
import { google as google2 } from "googleapis";
function getCalendarClient() {
  const auth = new google2.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google2.calendar({ version: "v3", auth });
}
async function listTodayEvents(_args) {
  const calendar = getCalendarClient();
  const now = /* @__PURE__ */ new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: startOfDay,
    timeMax: endOfDay,
    singleEvents: true,
    orderBy: "startTime"
  });
  return (res.data.items ?? []).map((item) => ({
    id: item.id ?? "",
    title: item.summary ?? "(no title)",
    start: item.start?.dateTime ?? item.start?.date ?? "",
    end: item.end?.dateTime ?? item.end?.date ?? "",
    attendees: (item.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
    description: item.description ?? ""
  }));
}
async function detectConflicts(_args) {
  const events = await listTodayEvents({});
  const timedEvents = events.filter((e) => e.start.includes("T"));
  const conflicts = [];
  for (let i = 0; i < timedEvents.length; i++) {
    for (let j = i + 1; j < timedEvents.length; j++) {
      const a = timedEvents[i];
      const b = timedEvents[j];
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
          overlapMinutes: Math.round((overlapEnd - overlapStart) / 6e4)
        });
      }
    }
  }
  return { conflicts };
}

// src/tools/notion.ts
import { Client } from "@notionhq/client";
function getNotionClient() {
  return new Client({ auth: process.env.NOTION_API_KEY });
}
async function createTask(args) {
  const title = args.title;
  if (!title || typeof title !== "string") {
    throw new Error("createTask requires a non-empty title string");
  }
  const { deadline, stakeholders, context, sourceId } = args;
  const notion = getNotionClient();
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) throw new Error("NOTION_DATABASE_ID environment variable is not set");
  const properties = {
    Name: { title: [{ text: { content: title } }] },
    Status: { select: { name: "To Do" } }
  };
  if (deadline) {
    properties["Deadline"] = { date: { start: deadline } };
  }
  if (stakeholders) {
    properties["Stakeholders"] = { rich_text: [{ text: { content: stakeholders } }] };
  }
  if (context) {
    properties["Context"] = { rich_text: [{ text: { content: context } }] };
  }
  if (sourceId) {
    properties["Source"] = { rich_text: [{ text: { content: sourceId } }] };
  }
  const res = await notion.pages.create({
    parent: { database_id: databaseId },
    properties
  });
  const page = res;
  if (!page.id) throw new Error("Notion API returned page without id");
  return { pageId: page.id, url: page.url };
}
async function searchPages(args) {
  const query = args.query;
  if (!query || typeof query !== "string") {
    throw new Error("searchPages requires a non-empty query string");
  }
  const notion = getNotionClient();
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) throw new Error("NOTION_DATABASE_ID environment variable is not set");
  const res = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: "Name",
      title: { contains: query }
    },
    page_size: 10
  });
  return res.results.map((page) => {
    const p = page;
    return {
      pageId: p.id,
      title: p.properties.Name.title[0]?.plain_text ?? "",
      url: p.url
    };
  });
}
async function updatePage(args) {
  const pageId = args.pageId;
  const status = args.status;
  if (!pageId || typeof pageId !== "string") {
    throw new Error("updatePage requires a non-empty pageId string");
  }
  if (!status || typeof status !== "string") {
    throw new Error("updatePage requires a non-empty status string");
  }
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Status: { select: { name: status } }
    }
  });
  return { success: true, pageId };
}

// src/tools/slack.ts
import { WebClient } from "@slack/web-api";
function getSlackClient() {
  return new WebClient(process.env.SLACK_BOT_TOKEN);
}
async function postMessage(args) {
  const channel = args.channel;
  const text = args.text;
  if (!channel || typeof channel !== "string") {
    throw new Error("postMessage requires a non-empty channel string");
  }
  if (!text || typeof text !== "string") {
    throw new Error("postMessage requires a non-empty text string");
  }
  const blocks = args.blocks;
  const client = getSlackClient();
  const res = await client.chat.postMessage({
    channel,
    text,
    blocks
  });
  return { ok: res.ok ?? false, ts: res.ts };
}

// src/agent/autonomy.ts
var LOW_RISK_TOOLS = /* @__PURE__ */ new Set([
  "list_emails",
  "search_thread",
  "save_draft",
  "label_email",
  "list_today_events",
  "detect_conflicts",
  "create_task",
  "search_pages",
  "update_page",
  "post_message"
]);
function getRiskLevel(toolName) {
  return LOW_RISK_TOOLS.has(toolName) ? "low" : "high";
}

// src/agent/tools.ts
var toolDefs = [
  {
    name: "list_emails",
    description: "Fetch the most recent unread emails from Gmail.",
    input_schema: {
      type: "object",
      properties: {
        maxResults: { type: "number", description: "Max number of emails to fetch (default 50)" }
      },
      required: []
    },
    execute: listEmails
  },
  {
    name: "search_thread",
    description: "Search Gmail for a thread matching the query. Returns the most recent match.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'Gmail search query (e.g. "investor follow-up from:sarah")' }
      },
      required: ["query"]
    },
    execute: searchThread
  },
  {
    name: "save_draft",
    description: "Save an email reply as a Gmail draft (does NOT send it).",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body text" }
      },
      required: ["to", "subject", "body"]
    },
    execute: saveDraft
  },
  {
    name: "send_email",
    description: "Send an email. HIGH RISK \u2014 requires CEO approval.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body text" }
      },
      required: ["to", "subject", "body"]
    },
    execute: sendEmail
  },
  {
    name: "label_email",
    description: "Apply a label to an email (urgent, needs-reply, FYI, newsletter, can-ignore).",
    input_schema: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "Gmail message ID" },
        label: { type: "string", description: "Label to apply" }
      },
      required: ["messageId", "label"]
    },
    execute: labelEmail
  },
  {
    name: "list_today_events",
    description: "Get all calendar events scheduled for today.",
    input_schema: { type: "object", properties: {}, required: [] },
    execute: listTodayEvents
  },
  {
    name: "detect_conflicts",
    description: "Identify overlapping calendar events today.",
    input_schema: { type: "object", properties: {}, required: [] },
    execute: detectConflicts
  },
  {
    name: "create_task",
    description: "Create a structured task in the Notion CEO task database.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        deadline: { type: "string", description: "Deadline in YYYY-MM-DD format" },
        stakeholders: { type: "string", description: "Comma-separated stakeholder names or emails" },
        context: { type: "string", description: "Brief context summary" },
        sourceId: { type: "string", description: "Gmail message or thread ID this task came from" }
      },
      required: ["title"]
    },
    execute: createTask
  },
  {
    name: "search_pages",
    description: "Search the Notion task database by title keyword.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword" }
      },
      required: ["query"]
    },
    execute: searchPages
  },
  {
    name: "update_page",
    description: "Update the status of a Notion task page.",
    input_schema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "Notion page ID" },
        status: { type: "string", description: "New status: To Do, In Progress, or Done" }
      },
      required: ["pageId", "status"]
    },
    execute: updatePage
  },
  {
    name: "post_message",
    description: "Post a message to a Slack channel.",
    input_schema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Slack channel ID" },
        text: { type: "string", description: "Message text" }
      },
      required: ["channel", "text"]
    },
    execute: postMessage
  }
];
var ALL_TOOLS = toolDefs.map((t) => ({
  ...t,
  riskLevel: getRiskLevel(t.name)
}));

// src/agent/loop.ts
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

// src/agent/approval-store.ts
import Redis from "ioredis";
var redis = new Redis(process.env.chief_of_staff_REDIS_URL);
var KEY_PREFIX = "approval:";
var TTL_SECONDS = 3600;
async function saveApproval(request) {
  await redis.set(`${KEY_PREFIX}${request.id}`, JSON.stringify(request), "EX", TTL_SECONDS);
}

// src/agent/loop.ts
async function runAgentLoop(prompt, tools, digestChannelId, maxIterations = 10) {
  const client = new Anthropic();
  const pendingApprovals = [];
  const messages = [
    { role: "user", content: prompt }
  ];
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema
  }));
  for (let i = 0; i < maxIterations; i++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      tools: anthropicTools,
      messages
    });
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      const summary = textBlock ? textBlock.text : "";
      return { summary, pendingApprovals };
    }
    if (response.stop_reason !== "tool_use") {
      break;
    }
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const tool = tools.find((t) => t.name === block.name);
      if (!tool) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: unknown tool "${block.name}"`
        });
        continue;
      }
      if (tool.riskLevel === "high") {
        const approval = {
          id: randomUUID(),
          toolName: block.name,
          args: block.input,
          description: `${block.name}: ${JSON.stringify(block.input).slice(0, 200)}`,
          createdAt: Date.now()
        };
        await saveApproval(approval);
        pendingApprovals.push(approval);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Action "${block.name}" queued for CEO approval (ID: ${approval.id}). Do not retry this action.`
        });
        continue;
      }
      try {
        const result = await tool.execute(block.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result)
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error executing ${block.name}: ${err instanceof Error ? err.message : String(err)}`
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
  return {
    summary: `Agent reached max iterations (${maxIterations}). Partial results above.`,
    pendingApprovals
  };
}

// src/slack/approval.ts
import { WebClient as WebClient2 } from "@slack/web-api";
async function postApprovalMessage(approval, channelId) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN environment variable is not set");
  const client = new WebClient2(token);
  await client.chat.postMessage({
    channel: channelId,
    text: `Action requires your approval: ${approval.description}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Action requires your approval*

*Tool:* \`${approval.toolName}\`
*Details:* ${approval.description}`
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Approve" },
            style: "primary",
            action_id: "approve_action",
            value: approval.id
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Cancel" },
            style: "danger",
            action_id: "cancel_action",
            value: approval.id
          }
        ]
      }
    ]
  });
}

// src/workflows/inbox-triage.ts
var TRIAGE_PROMPT = `
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

Be concise. Do not explain your reasoning for every email \u2014 just do it and summarize.
`.trim();
var inboxTriageWorkflow = {
  name: "inbox-triage",
  async run(ctx) {
    const channelId = process.env.DIGEST_CHANNEL_ID;
    if (!channelId) throw new Error("DIGEST_CHANNEL_ID environment variable is not set");
    const result = await runAgentLoop(TRIAGE_PROMPT, ALL_TOOLS, channelId);
    await ctx.postToSlack(`*Inbox Triage Complete*

${result.summary}`);
    for (const approval of result.pendingApprovals) {
      await postApprovalMessage(approval, channelId);
    }
  }
};

// src/workflows/thread-to-task.ts
var threadToTaskWorkflow = {
  name: "thread-to-task",
  async run(ctx) {
    if (!ctx.input) {
      await ctx.postToSlack(
        "Please provide a search query. Usage: `/task [email subject or keywords]`"
      );
      return;
    }
    const channelId = process.env.DIGEST_CHANNEL_ID;
    if (!channelId) throw new Error("DIGEST_CHANNEL_ID environment variable is not set");
    const prompt = `
You are an AI Chief of Staff. The CEO wants to create a Notion task from an email thread.

Search query: "${ctx.input}"

Steps:
1. Call search_thread with the query to find the relevant email thread.
2. Read the thread content carefully.
3. Extract:
   - A clear, actionable task title (imperative form, e.g. "Send investor deck to Sarah")
   - Deadline (if mentioned, in YYYY-MM-DD format; otherwise omit)
   - Stakeholders (people involved \u2014 names and/or emails)
   - A 1-2 sentence context summary
4. Call create_task with the extracted information and set sourceId to the email message ID.
5. Report the Notion page URL in your final response.

If no thread is found, report that clearly.
    `.trim();
    const result = await runAgentLoop(prompt, ALL_TOOLS, channelId);
    await ctx.postToSlack(result.summary);
  }
};

// src/workflows/daily-digest.ts
var DIGEST_PROMPT = `
You are an AI Chief of Staff preparing the CEO's morning briefing for today.

Run these steps in parallel (call all three tools before synthesizing):
1. list_emails \u2014 fetch the 50 most recent unread emails
2. list_today_events \u2014 get today's calendar
3. search_pages \u2014 search Notion for tasks with query "To Do" to find open tasks

Then synthesize a structured morning briefing with these sections:

**Good morning.** Here is your briefing for [today's date].

**\u{1F4E7} Top Emails** (max 3 most urgent)
- For each: sender, subject, one-sentence summary, suggested action

**\u{1F4C5} Today's Calendar**
- List each event with time and attendees
- Flag any scheduling conflicts detected by detect_conflicts

**\u2705 Open Tasks**
- List overdue or due-today Notion tasks

Keep it tight. The CEO reads this in 2 minutes.
`.trim();
var dailyDigestWorkflow = {
  name: "daily-digest",
  async run(ctx) {
    const channelId = process.env.DIGEST_CHANNEL_ID;
    if (!channelId) throw new Error("DIGEST_CHANNEL_ID environment variable is not set");
    const result = await runAgentLoop(DIGEST_PROMPT, ALL_TOOLS, channelId);
    await ctx.postToSlack(result.summary);
  }
};

// src/workflows/registry.ts
var workflows = /* @__PURE__ */ new Map([
  ["inbox-triage", inboxTriageWorkflow],
  ["thread-to-task", threadToTaskWorkflow],
  ["daily-digest", dailyDigestWorkflow]
]);
function getWorkflow(name) {
  return workflows.get(name);
}

// api/cron/digest.ts
async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const channelId = process.env.DIGEST_CHANNEL_ID;
  if (!channelId) {
    return res.status(500).json({ error: "DIGEST_CHANNEL_ID not configured" });
  }
  const postToSlack = async (message) => {
    await postMessage({ channel: channelId, text: message });
  };
  try {
    const workflow = getWorkflow("daily-digest");
    if (!workflow) {
      await postMessage({ channel: channelId, text: "Daily digest workflow not found in registry." });
      res.status(500).json({ error: "workflow not found" });
      return;
    }
    await workflow.run({ postToSlack });
    res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await postMessage({ channel: channelId, text: `Daily digest failed: ${message}` });
    } catch {
    }
    res.status(500).json({ error: message });
  }
}
export {
  handler as default
};
