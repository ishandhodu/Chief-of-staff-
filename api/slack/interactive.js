// src/slack/verify.ts
import { createHmac, timingSafeEqual } from "crypto";
function verifySlackSignature(signingSecret, signature, timestamp, body) {
  const now = Math.floor(Date.now() / 1e3);
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts) || Math.abs(now - ts) > 300) {
    return false;
  }
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", signingSecret);
  const expected = `v0=${hmac.update(baseString).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// src/slack/raw-body.ts
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// src/agent/approval-store.ts
var store = /* @__PURE__ */ new Map();
var KEY_PREFIX = "approval:";
var TTL_MS = 3600 * 1e3;
async function getApproval(id) {
  return store.get(`${KEY_PREFIX}${id}`) ?? null;
}
async function deleteApproval(id) {
  store.delete(`${KEY_PREFIX}${id}`);
}

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

// src/handlers/slack/interactive.ts
var config = {
  api: {
    bodyParser: false
  }
};
async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }
  const rawBody = await getRawBody(req);
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return res.status(500).json({ error: "SLACK_SIGNING_SECRET not configured" });
  }
  const signature = req.headers["x-slack-signature"];
  const timestamp = req.headers["x-slack-request-timestamp"];
  if (typeof signature !== "string" || typeof timestamp !== "string") {
    return res.status(401).json({ error: "Missing Slack headers" });
  }
  if (!verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  res.status(200).end();
  const channelId = process.env.DIGEST_CHANNEL_ID;
  if (!channelId) {
    console.error("DIGEST_CHANNEL_ID not configured");
    return;
  }
  try {
    let payload;
    try {
      const params = new URLSearchParams(rawBody);
      const payloadStr = params.get("payload");
      if (!payloadStr) return;
      payload = JSON.parse(payloadStr);
    } catch {
      return;
    }
    if (!payload.actions?.length) return;
    const action = payload.actions[0];
    const approvalId = action.value;
    const approval = await getApproval(approvalId);
    if (!approval) {
      await postMessage({ channel: channelId, text: `Approval \`${approvalId}\` has expired or was already processed.` });
      return;
    }
    if (action.action_id === "cancel_action") {
      await deleteApproval(approvalId);
      await postMessage({ channel: channelId, text: `Cancelled: ${approval.description}` });
      return;
    }
    if (action.action_id === "approve_action") {
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
          text: `Done: ${approval.description}
\`\`\`${JSON.stringify(result, null, 2)}\`\`\``
        });
      } catch (err) {
        await postMessage({
          channel: channelId,
          text: `Error executing ${approval.toolName}: ${err instanceof Error ? err.message : String(err)}`
        });
      }
    }
  } catch (err) {
    try {
      await postMessage({ channel: channelId, text: `Error processing approval: ${err instanceof Error ? err.message : String(err)}` });
    } catch {
    }
  }
}
export {
  config,
  handler as default
};
