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
