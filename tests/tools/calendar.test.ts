import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({ setCredentials: vi.fn() })),
    },
    calendar: vi.fn().mockReturnValue({
      events: {
        list: vi.fn(),
      },
    }),
  },
}));

import { google } from 'googleapis';
import { listTodayEvents, detectConflicts } from '@/tools/calendar';

beforeEach(() => vi.clearAllMocks());

describe('listTodayEvents', () => {
  it('returns formatted events for today', async () => {
    const calendar = google.calendar({ version: 'v3' });
    vi.mocked(calendar.events.list).mockResolvedValue({
      data: {
        items: [
          {
            id: 'evt1',
            summary: 'Team Standup',
            start: { dateTime: '2026-04-12T10:00:00Z' },
            end: { dateTime: '2026-04-12T10:30:00Z' },
            attendees: [{ email: 'alice@example.com' }],
          },
        ],
      },
    } as never);

    const result = await listTodayEvents({});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'evt1',
      title: 'Team Standup',
      attendees: ['alice@example.com'],
    });
  });
});

describe('detectConflicts', () => {
  it('identifies overlapping events', async () => {
    const calendar = google.calendar({ version: 'v3' });
    vi.mocked(calendar.events.list).mockResolvedValue({
      data: {
        items: [
          {
            id: 'evt1',
            summary: 'Meeting A',
            start: { dateTime: '2026-04-12T10:00:00Z' },
            end: { dateTime: '2026-04-12T11:00:00Z' },
          },
          {
            id: 'evt2',
            summary: 'Meeting B',
            start: { dateTime: '2026-04-12T10:30:00Z' },
            end: { dateTime: '2026-04-12T11:30:00Z' },
          },
        ],
      },
    } as never);

    const result = await detectConflicts({});
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      event1: 'Meeting A',
      event2: 'Meeting B',
    });
    expect(result.conflicts[0].overlapMinutes).toBe(30);
  });

  it('returns no conflicts when events do not overlap', async () => {
    const calendar = google.calendar({ version: 'v3' });
    vi.mocked(calendar.events.list).mockResolvedValue({
      data: {
        items: [
          {
            id: 'evt1',
            summary: 'Meeting A',
            start: { dateTime: '2026-04-12T09:00:00Z' },
            end: { dateTime: '2026-04-12T10:00:00Z' },
          },
          {
            id: 'evt2',
            summary: 'Meeting B',
            start: { dateTime: '2026-04-12T10:00:00Z' },
            end: { dateTime: '2026-04-12T11:00:00Z' },
          },
        ],
      },
    } as never);

    const result = await detectConflicts({});
    expect(result.conflicts).toHaveLength(0);
  });
});
