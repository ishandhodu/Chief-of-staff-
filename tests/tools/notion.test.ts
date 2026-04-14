import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPagesCreate = vi.fn();
const mockPagesUpdate = vi.fn();
const mockDatabasesQuery = vi.fn();

vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation(() => ({
    pages: {
      create: mockPagesCreate,
      update: mockPagesUpdate,
    },
    databases: {
      query: mockDatabasesQuery,
    },
  })),
}));

import { createTask, searchPages, updatePage, saveMemory, listMemories } from '@/tools/notion';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NOTION_API_KEY = 'test-api-key';
  process.env.NOTION_DATABASE_ID = 'test-database-id';
  process.env.NOTION_MEMORY_DATABASE_ID = 'test-memory-db-id'; // add this line
});

describe('createTask', () => {
  it('creates a Notion page and returns its URL', async () => {
    mockPagesCreate.mockResolvedValue({
      id: 'page123',
      url: 'https://notion.so/page123',
    });

    const result = await createTask({
      title: 'Send investor deck',
      deadline: '2026-04-18',
      stakeholders: 'Sarah Chen',
      context: 'Investor wants deck before Friday call',
      sourceId: 'thread_abc',
    });

    expect(result).toMatchObject({
      pageId: 'page123',
      url: 'https://notion.so/page123',
    });

    expect(mockPagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: { database_id: 'test-database-id' },
        properties: expect.objectContaining({
          Name: { title: [{ text: { content: 'Send investor deck' } }] },
          Status: { select: { name: 'To Do' } },
          Deadline: { date: { start: '2026-04-18' } },
        }),
      })
    );
  });
});

describe('searchPages', () => {
  it('returns matching pages from the database', async () => {
    mockDatabasesQuery.mockResolvedValue({
      results: [
        {
          id: 'page1',
          url: 'https://notion.so/page1',
          properties: {
            Name: { title: [{ plain_text: 'Send investor deck' }] },
          },
        },
      ],
    });

    const result = await searchPages({ query: 'investor' });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Send investor deck');

    expect(mockDatabasesQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        database_id: 'test-database-id',
        filter: { property: 'Name', title: { contains: 'investor' } },
      })
    );
  });
});

describe('updatePage', () => {
  it('updates a page property and returns success', async () => {
    mockPagesUpdate.mockResolvedValue({ id: 'page1' });

    const result = await updatePage({
      pageId: 'page1',
      status: 'In Progress',
    });

    expect(result).toEqual({ success: true, pageId: 'page1' });

    expect(mockPagesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        page_id: 'page1',
        properties: expect.objectContaining({
          Status: { select: { name: 'In Progress' } },
        }),
      })
    );
  });
});

describe('input validation', () => {
  it('createTask throws when title is missing', async () => {
    await expect(createTask({ deadline: '2026-04-18' })).rejects.toThrow('title');
  });

  it('searchPages throws when query is missing', async () => {
    await expect(searchPages({})).rejects.toThrow('query');
  });

  it('updatePage throws when pageId is missing', async () => {
    await expect(updatePage({ status: 'Done' })).rejects.toThrow('pageId');
  });

  it('updatePage throws when status is missing', async () => {
    await expect(updatePage({ pageId: 'page1' })).rejects.toThrow('status');
  });
});

describe('saveMemory', () => {
  it('creates a memory page with correct properties', async () => {
    mockPagesCreate.mockResolvedValue({ id: 'mem123' });

    const result = await saveMemory({
      subject: 'ishan@example.com',
      type: 'Contact',
      rule: 'lead investor, always treat as urgent',
      raw: 'ishan@example.com is my lead investor, always urgent',
    });

    expect(result).toEqual({ pageId: 'mem123' });
    expect(mockPagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: { database_id: 'test-memory-db-id' },
        properties: expect.objectContaining({
          Name: { title: [{ text: { content: 'ishan@example.com' } }] },
          Type: { select: { name: 'Contact' } },
          Rule: { rich_text: [{ text: { content: 'lead investor, always treat as urgent' } }] },
        }),
      })
    );
  });

  it('sets the Expires field when expires is provided', async () => {
    mockPagesCreate.mockResolvedValue({ id: 'mem456' });

    await saveMemory({
      subject: 'home insurance renewal',
      type: 'Deadline',
      rule: 'flag any related emails as urgent',
      expires: '2026-05-15',
      raw: 'home insurance renewal due May 15',
    });

    expect(mockPagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          Expires: { date: { start: '2026-05-15' } },
        }),
      })
    );
  });

  it('throws when NOTION_MEMORY_DATABASE_ID is not set', async () => {
    delete process.env.NOTION_MEMORY_DATABASE_ID;
    await expect(
      saveMemory({ subject: 'x', type: 'Contact', rule: 'y', raw: 'z' })
    ).rejects.toThrow('NOTION_MEMORY_DATABASE_ID');
  });
});

describe('listMemories', () => {
  it('returns non-expired memory entries', async () => {
    mockDatabasesQuery.mockResolvedValue({
      results: [
        {
          id: 'mem1',
          properties: {
            Name: { title: [{ plain_text: 'ishan@example.com' }] },
            Type: { select: { name: 'Contact' } },
            Rule: { rich_text: [{ plain_text: 'lead investor, always urgent' }] },
            Expires: { date: null },
            Raw: { rich_text: [{ plain_text: 'ishan@example.com is my lead investor' }] },
          },
        },
        {
          id: 'mem2',
          properties: {
            Name: { title: [{ plain_text: 'home insurance' }] },
            Type: { select: { name: 'Deadline' } },
            Rule: { rich_text: [{ plain_text: 'flag related emails' }] },
            Expires: { date: { start: '2099-12-31' } },
            Raw: { rich_text: [{ plain_text: 'home insurance due Dec 31 2099' }] },
          },
        },
      ],
    });

    const result = await listMemories();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ pageId: 'mem1', subject: 'ishan@example.com', type: 'Contact' });
    expect(result[1]).toMatchObject({ pageId: 'mem2', subject: 'home insurance', expires: '2099-12-31' });
  });

  it('filters out entries where expires is in the past', async () => {
    mockDatabasesQuery.mockResolvedValue({
      results: [
        {
          id: 'expired',
          properties: {
            Name: { title: [{ plain_text: 'old deadline' }] },
            Type: { select: { name: 'Deadline' } },
            Rule: { rich_text: [{ plain_text: 'some rule' }] },
            Expires: { date: { start: '2020-01-01' } },
            Raw: { rich_text: [{ plain_text: 'old deadline' }] },
          },
        },
        {
          id: 'active',
          properties: {
            Name: { title: [{ plain_text: 'active contact' }] },
            Type: { select: { name: 'Contact' } },
            Rule: { rich_text: [{ plain_text: 'important' }] },
            Expires: { date: null },
            Raw: { rich_text: [{ plain_text: 'active contact' }] },
          },
        },
      ],
    });

    const result = await listMemories();
    expect(result).toHaveLength(1);
    expect(result[0].pageId).toBe('active');
  });

  it('throws when NOTION_MEMORY_DATABASE_ID is not set', async () => {
    delete process.env.NOTION_MEMORY_DATABASE_ID;
    await expect(listMemories()).rejects.toThrow('NOTION_MEMORY_DATABASE_ID');
  });
});
