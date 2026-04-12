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
