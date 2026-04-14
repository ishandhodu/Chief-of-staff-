import type { Tool } from '../types.js';
import { listEmails, searchThread, saveDraft, sendEmail, labelEmail } from '../tools/gmail.js';
import { listTodayEvents, listEvents, detectConflicts, updateEvent, deleteEvent } from '../tools/calendar.js';
import { createTask, searchPages, updatePage } from '../tools/notion.js';
import { postMessage } from '../tools/slack.js';
import { getRiskLevel } from './autonomy.js';

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
    name: 'list_events',
    description: 'Get all calendar events for a specific date (any date, not just today).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format, e.g. 2026-04-14' },
      },
      required: ['date'],
    },
    execute: listEvents,
  },
  {
    name: 'detect_conflicts',
    description: 'Identify overlapping calendar events today.',
    input_schema: { type: 'object', properties: {}, required: [] },
    execute: detectConflicts,
  },
  {
    name: 'update_event',
    description: 'Update a Google Calendar event (change time, title, or description).',
    input_schema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Google Calendar event ID' },
        summary: { type: 'string', description: 'New event title (optional)' },
        startTime: { type: 'string', description: 'New start time in ISO 8601 format, e.g. 2026-04-14T10:00:00-04:00 (optional)' },
        endTime: { type: 'string', description: 'New end time in ISO 8601 format, e.g. 2026-04-14T11:00:00-04:00 (optional)' },
        description: { type: 'string', description: 'New event description (optional)' },
      },
      required: ['eventId'],
    },
    execute: updateEvent,
  },
  {
    name: 'delete_event',
    description: 'Delete/cancel a Google Calendar event.',
    input_schema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Google Calendar event ID' },
      },
      required: ['eventId'],
    },
    execute: deleteEvent,
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
        priority: { type: 'string', description: 'Task priority: High, Medium, or Low' },
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
