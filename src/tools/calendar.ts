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

function toEastern(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value, 10);
  return { year: get('year'), month: get('month') - 1, day: get('day') };
}

export async function listTodayEvents(_args: Record<string, unknown>): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient();
  const { year, month, day } = toEastern(new Date());
  const startOfDay = new Date(Date.UTC(year, month, day, 4, 0, 0)).toISOString(); // midnight ET = 4am UTC (EST) or 4am UTC
  const endOfDay = new Date(Date.UTC(year, month, day + 1, 3, 59, 59)).toISOString(); // 11:59pm ET

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay,
    timeMax: endOfDay,
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: 'America/New_York',
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
  // Filter to timed events only — all-day events have date-only strings without 'T'
  const timedEvents = events.filter(e => e.start.includes('T'));
  const conflicts: ConflictReport['conflicts'] = [];

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
          overlapMinutes: Math.round((overlapEnd - overlapStart) / 60000),
        });
      }
    }
  }

  return { conflicts };
}

export async function listEvents(args: Record<string, unknown>): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient();
  const date = args.date as string | undefined;
  if (!date || typeof date !== 'string') {
    throw new Error('listEvents requires a date in YYYY-MM-DD format');
  }

  const timeMin = `${date}T00:00:00-04:00`;
  const timeMax = `${date}T23:59:59-04:00`;

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: 'America/New_York',
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

export async function updateEvent(args: Record<string, unknown>): Promise<{ success: boolean; eventId: string }> {
  const eventId = args.eventId as string | undefined;
  if (!eventId || typeof eventId !== 'string') {
    throw new Error('updateEvent requires a non-empty eventId string');
  }

  const calendar = getCalendarClient();

  // Fetch the existing event first so we can merge changes
  const existing = await calendar.events.get({ calendarId: 'primary', eventId });

  const updates: Record<string, unknown> = {};

  const summary = args.summary as string | undefined;
  if (summary) updates.summary = summary;

  const startTime = args.startTime as string | undefined;
  const endTime = args.endTime as string | undefined;
  if (startTime) {
    updates.start = { dateTime: startTime, timeZone: existing.data.start?.timeZone ?? 'America/New_York' };
  }
  if (endTime) {
    updates.end = { dateTime: endTime, timeZone: existing.data.end?.timeZone ?? 'America/New_York' };
  }

  const description = args.description as string | undefined;
  if (description) updates.description = description;

  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: updates,
  });

  return { success: true, eventId };
}

export async function deleteEvent(args: Record<string, unknown>): Promise<{ success: boolean; eventId: string }> {
  const eventId = args.eventId as string | undefined;
  if (!eventId || typeof eventId !== 'string') {
    throw new Error('deleteEvent requires a non-empty eventId string');
  }

  const calendar = getCalendarClient();
  await calendar.events.delete({ calendarId: 'primary', eventId });

  return { success: true, eventId };
}
