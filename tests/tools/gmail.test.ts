import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    gmail: vi.fn().mockReturnValue({
      users: {
        messages: {
          list: vi.fn(),
          get: vi.fn(),
          send: vi.fn(),
          modify: vi.fn(),
        },
        drafts: {
          create: vi.fn(),
        },
        labels: {
          list: vi.fn(),
          create: vi.fn(),
        },
      },
    }),
  },
}));

import { google } from 'googleapis';
import {
  listEmails,
  searchThread,
  saveDraft,
  sendEmail,
  labelEmail,
} from '@/tools/gmail';

beforeEach(() => vi.clearAllMocks());

describe('listEmails', () => {
  it('returns a list of email summaries', async () => {
    const mockMessages = {
      data: {
        messages: [{ id: 'msg1' }, { id: 'msg2' }],
      },
    };
    const mockMessage = {
      data: {
        id: 'msg1',
        snippet: 'Hello world',
        payload: {
          headers: [
            { name: 'From', value: 'alice@example.com' },
            { name: 'Subject', value: 'Test Subject' },
            { name: 'Date', value: '2026-04-12' },
          ],
        },
        labelIds: ['UNREAD'],
      },
    };

    const gmail = google.gmail({ version: 'v1' });
    vi.mocked(gmail.users.messages.list).mockResolvedValue(mockMessages as never);
    vi.mocked(gmail.users.messages.get).mockResolvedValue(mockMessage as never);

    const result = await listEmails({ maxResults: 2 });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'msg1',
      from: 'alice@example.com',
      subject: 'Test Subject',
      snippet: 'Hello world',
    });
  });
});

describe('searchThread', () => {
  it('returns the most recent matching thread', async () => {
    const mockList = { data: { messages: [{ id: 'thread1', threadId: 't1' }] } };
    const mockGet = {
      data: {
        id: 'thread1',
        snippet: 'Thread content',
        payload: {
          headers: [
            { name: 'From', value: 'bob@example.com' },
            { name: 'Subject', value: 'Investor follow-up' },
            { name: 'Date', value: '2026-04-12' },
          ],
          body: { data: Buffer.from('Email body text').toString('base64') },
        },
        labelIds: [],
      },
    };
    const gmail = google.gmail({ version: 'v1' });
    vi.mocked(gmail.users.messages.list).mockResolvedValue(mockList as never);
    vi.mocked(gmail.users.messages.get).mockResolvedValue(mockGet as never);

    const result = await searchThread({ query: 'investor follow-up' });

    expect(result).not.toBeNull();
    expect(result?.subject).toBe('Investor follow-up');
  });

  it('returns null when no thread found', async () => {
    const gmail = google.gmail({ version: 'v1' });
    vi.mocked(gmail.users.messages.list).mockResolvedValue({
      data: { messages: [] },
    } as never);

    const result = await searchThread({ query: 'nonexistent' });
    expect(result).toBeNull();
  });
});

describe('labelEmail', () => {
  it('creates label and applies it when label does not exist', async () => {
    const gmail = google.gmail({ version: 'v1' });
    vi.mocked(gmail.users.labels.list).mockResolvedValue({
      data: { labels: [] },
    } as never);
    vi.mocked(gmail.users.labels.create).mockResolvedValue({
      data: { id: 'Label_urgent123' },
    } as never);
    vi.mocked(gmail.users.messages.modify).mockResolvedValue({
      data: { id: 'msg1' },
    } as never);

    const result = await labelEmail({ messageId: 'msg1', label: 'urgent' });
    expect(result).toEqual({ success: true, messageId: 'msg1' });
    expect(gmail.users.labels.list).toHaveBeenCalledWith({ userId: 'me' });
    expect(gmail.users.labels.create).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: { name: 'urgent' },
    });
    expect(gmail.users.messages.modify).toHaveBeenCalledWith({
      userId: 'me',
      id: 'msg1',
      requestBody: { addLabelIds: ['Label_urgent123'] },
    });
  });

  it('uses existing label ID without creating when label already exists', async () => {
    const gmail = google.gmail({ version: 'v1' });
    vi.mocked(gmail.users.labels.list).mockResolvedValue({
      data: {
        labels: [
          { id: 'Label_existing456', name: 'Urgent' },
        ],
      },
    } as never);
    vi.mocked(gmail.users.messages.modify).mockResolvedValue({
      data: { id: 'msg2' },
    } as never);

    const result = await labelEmail({ messageId: 'msg2', label: 'urgent' });
    expect(result).toEqual({ success: true, messageId: 'msg2' });
    expect(gmail.users.labels.list).toHaveBeenCalledWith({ userId: 'me' });
    expect(gmail.users.labels.create).not.toHaveBeenCalled();
    expect(gmail.users.messages.modify).toHaveBeenCalledWith({
      userId: 'me',
      id: 'msg2',
      requestBody: { addLabelIds: ['Label_existing456'] },
    });
  });
});
