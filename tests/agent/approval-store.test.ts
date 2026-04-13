import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ioredis', () => {
  const mockRedis = {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  };
  return { default: vi.fn(() => mockRedis) };
});

import Redis from 'ioredis';
import { saveApproval, getApproval, deleteApproval } from '@/agent/approval-store';
import type { ApprovalRequest } from '@/types';

const mockRedis = new (Redis as any)();

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
    mockRedis.set.mockResolvedValue('OK');
    await saveApproval(mockRequest);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `approval:${mockRequest.id}`,
      JSON.stringify(mockRequest),
      'EX',
      3600
    );
  });
});

describe('getApproval', () => {
  it('retrieves an approval request by ID', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(mockRequest));
    const result = await getApproval(mockRequest.id);
    expect(result).toEqual(mockRequest);
  });

  it('returns null when not found', async () => {
    mockRedis.get.mockResolvedValue(null);
    const result = await getApproval('nonexistent');
    expect(result).toBeNull();
  });
});

describe('deleteApproval', () => {
  it('deletes an approval request from KV', async () => {
    mockRedis.del.mockResolvedValue(1);
    await deleteApproval(mockRequest.id);
    expect(mockRedis.del).toHaveBeenCalledWith(`approval:${mockRequest.id}`);
  });
});
