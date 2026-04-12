import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/kv', () => ({
  kv: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
}));

import { kv } from '@vercel/kv';
import { saveApproval, getApproval, deleteApproval } from '@/agent/approval-store';
import type { ApprovalRequest } from '@/types';

const mockRequest: ApprovalRequest = {
  id: 'test-uuid-1234',
  toolName: 'send_email',
  args: { to: 'sarah@example.com', subject: 'Follow up', body: 'Hi Sarah' },
  description: 'Send follow-up email to Sarah',
  createdAt: Date.now(),
};

beforeEach(() => vi.clearAllMocks());

describe('saveApproval', () => {
  it('saves an approval request to KV with 1hr TTL', async () => {
    vi.mocked(kv.set).mockResolvedValue('OK');
    await saveApproval(mockRequest);
    expect(kv.set).toHaveBeenCalledWith(
      `approval:${mockRequest.id}`,
      mockRequest,
      { ex: 3600 }
    );
  });
});

describe('getApproval', () => {
  it('retrieves an approval request by ID', async () => {
    vi.mocked(kv.get).mockResolvedValue(mockRequest);
    const result = await getApproval(mockRequest.id);
    expect(result).toEqual(mockRequest);
  });

  it('returns null when not found', async () => {
    vi.mocked(kv.get).mockResolvedValue(null);
    const result = await getApproval('nonexistent');
    expect(result).toBeNull();
  });
});

describe('deleteApproval', () => {
  it('deletes an approval request from KV', async () => {
    vi.mocked(kv.del).mockResolvedValue(1);
    await deleteApproval(mockRequest.id);
    expect(kv.del).toHaveBeenCalledWith(`approval:${mockRequest.id}`);
  });
});
