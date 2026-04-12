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

function extractBody(payload: { body?: { data?: string | null } | null; parts?: Array<{ body?: { data?: string | null } | null }> | null } | null | undefined): string {
  const direct = payload?.body?.data;
  if (direct) return Buffer.from(direct, 'base64').toString('utf-8');
  const part = payload?.parts?.[0]?.body?.data;
  if (part) return Buffer.from(part, 'base64').toString('utf-8');
  return '';
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
      const msgId = msg.id;
      if (!msgId) throw new Error('Gmail API returned message without id');
      const getRes = await gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      const id = getRes.data.id;
      if (!id) throw new Error('Gmail API returned message without id');
      const headers = getRes.data.payload?.headers ?? [];
      return {
        id,
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
  if (typeof args.query !== 'string' || args.query.trim() === '') {
    throw new Error('searchThread requires a non-empty query string');
  }
  const query = args.query;
  const gmail = getGmailClient();

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 1,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return null;

  const firstMsgId = messages[0].id;
  if (!firstMsgId) throw new Error('Gmail API returned message without id');

  const getRes = await gmail.users.messages.get({
    userId: 'me',
    id: firstMsgId,
    format: 'full',
  });

  const id = getRes.data.id;
  if (!id) throw new Error('Gmail API returned message without id');

  const headers = getRes.data.payload?.headers ?? [];
  const body = extractBody(getRes.data.payload) || (getRes.data.snippet ?? '');

  return {
    id,
    threadId: getRes.data.threadId ?? '',
    subject: getHeader(headers, 'Subject'),
    from: getHeader(headers, 'From'),
    date: getHeader(headers, 'Date'),
    body,
    snippet: getRes.data.snippet ?? '',
  };
}

export async function saveDraft(args: Record<string, unknown>): Promise<{ draftId: string }> {
  if (typeof args.to !== 'string' || !args.to) throw new Error('saveDraft requires a non-empty "to" string');
  if (typeof args.subject !== 'string' || !args.subject) throw new Error('saveDraft requires a non-empty "subject" string');
  if (typeof args.body !== 'string' || !args.body) throw new Error('saveDraft requires a non-empty "body" string');
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

  const draftId = res.data.id;
  if (!draftId) throw new Error('Gmail API returned draft without id');
  return { draftId };
}

export async function sendEmail(args: Record<string, unknown>): Promise<{ messageId: string }> {
  if (typeof args.to !== 'string' || !args.to) throw new Error('sendEmail requires a non-empty "to" string');
  if (typeof args.subject !== 'string' || !args.subject) throw new Error('sendEmail requires a non-empty "subject" string');
  if (typeof args.body !== 'string' || !args.body) throw new Error('sendEmail requires a non-empty "body" string');
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

  const messageId = res.data.id;
  if (!messageId) throw new Error('Gmail API returned message without id');
  return { messageId };
}

export async function labelEmail(args: Record<string, unknown>): Promise<{ success: boolean; messageId: string }> {
  if (typeof args.messageId !== 'string' || !args.messageId) throw new Error('labelEmail requires a non-empty "messageId" string');
  if (typeof args.label !== 'string' || !args.label) throw new Error('labelEmail requires a non-empty "label" string');
  const { messageId, label } = args as { messageId: string; label: string };
  const gmail = getGmailClient();

  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: [label.toUpperCase()] },
  });

  return { success: true, messageId };
}
