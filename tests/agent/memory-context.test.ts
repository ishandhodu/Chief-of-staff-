import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/tools/notion', () => ({
  listMemories: vi.fn(),
}));

import { listMemories } from '@/tools/notion';
import { buildMemoryContext } from '@/agent/memory-context';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildMemoryContext', () => {
  it('returns empty string when there are no memories', async () => {
    vi.mocked(listMemories).mockResolvedValue([]);
    const result = await buildMemoryContext();
    expect(result).toBe('');
  });

  it('returns a formatted contacts block', async () => {
    vi.mocked(listMemories).mockResolvedValue([
      {
        pageId: 'p1',
        subject: 'ishan@example.com',
        type: 'Contact',
        rule: 'lead investor, always urgent',
        expires: null,
        raw: 'ishan@example.com is my lead investor',
      },
    ]);

    const result = await buildMemoryContext();
    expect(result).toContain('Contacts:');
    expect(result).toContain('- ishan@example.com: lead investor, always urgent');
    expect(result).not.toContain('Deadlines');
  });

  it('returns a formatted deadlines block with due date', async () => {
    vi.mocked(listMemories).mockResolvedValue([
      {
        pageId: 'p2',
        subject: 'home insurance renewal',
        type: 'Deadline',
        rule: 'flag any related emails as urgent',
        expires: '2026-05-15',
        raw: 'home insurance renewal due May 15',
      },
    ]);

    const result = await buildMemoryContext();
    expect(result).toContain('Deadlines to watch for:');
    expect(result).toContain('- home insurance renewal (due 2026-05-15): flag any related emails as urgent');
    expect(result).not.toContain('Contacts:');
  });

  it('returns both sections when both types are present', async () => {
    vi.mocked(listMemories).mockResolvedValue([
      {
        pageId: 'p1',
        subject: 'ishan@example.com',
        type: 'Contact',
        rule: 'lead investor, always urgent',
        expires: null,
        raw: 'ishan@example.com is my lead investor',
      },
      {
        pageId: 'p2',
        subject: 'home insurance renewal',
        type: 'Deadline',
        rule: 'flag any related emails as urgent',
        expires: '2026-05-15',
        raw: 'home insurance renewal due May 15',
      },
    ]);

    const result = await buildMemoryContext();
    expect(result).toContain('Contacts:');
    expect(result).toContain('Deadlines to watch for:');
  });
});
