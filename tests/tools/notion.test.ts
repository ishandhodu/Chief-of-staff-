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

import { createTask, searchPages, updatePage } from '@/tools/notion';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NOTION_API_KEY = 'test-api-key';
  process.env.NOTION_DATABASE_ID = 'test-database-id';
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
  });
});
