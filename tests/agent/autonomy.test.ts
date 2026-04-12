import { describe, it, expect } from 'vitest';
import { getRiskLevel } from '@/agent/autonomy';

describe('getRiskLevel', () => {
  it('returns low for read/label/create operations', () => {
    expect(getRiskLevel('list_emails')).toBe('low');
    expect(getRiskLevel('label_email')).toBe('low');
    expect(getRiskLevel('save_draft')).toBe('low');
    expect(getRiskLevel('list_today_events')).toBe('low');
    expect(getRiskLevel('detect_conflicts')).toBe('low');
    expect(getRiskLevel('create_task')).toBe('low');
    expect(getRiskLevel('update_page')).toBe('low');
    expect(getRiskLevel('search_pages')).toBe('low');
    expect(getRiskLevel('search_thread')).toBe('low');
  });

  it('returns high for send/delete/modify operations', () => {
    expect(getRiskLevel('send_email')).toBe('high');
  });

  it('defaults to high for unknown tool names', () => {
    expect(getRiskLevel('unknown_tool')).toBe('high');
  });
});
