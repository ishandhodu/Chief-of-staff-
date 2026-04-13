import { describe, it, expect, beforeEach } from 'vitest';
import { saveApproval, getApproval, deleteApproval } from '@/agent/approval-store';
import type { ApprovalRequest } from '@/types';

const mockRequest: ApprovalRequest = {
  id: 'test-uuid-1234',
  toolName: 'send_email',
  args: { to: 'sarah@example.com', subject: 'Follow up', body: 'Hi Sarah' },
  description: 'Send follow-up email to Sarah',
  createdAt: Date.now(),
};

beforeEach(async () => {
  await deleteApproval(mockRequest.id);
});

describe('saveApproval', () => {
  it('saves an approval request with 1hr TTL', async () => {
    await saveApproval(mockRequest);
    const result = await getApproval(mockRequest.id);
    expect(result).toEqual(mockRequest);
  });
});

describe('getApproval', () => {
  it('retrieves an approval request by ID', async () => {
    await saveApproval(mockRequest);
    const result = await getApproval(mockRequest.id);
    expect(result).toEqual(mockRequest);
  });

  it('returns null when not found', async () => {
    const result = await getApproval('nonexistent');
    expect(result).toBeNull();
  });
});

describe('deleteApproval', () => {
  it('deletes an approval request', async () => {
    await saveApproval(mockRequest);
    await deleteApproval(mockRequest.id);
    const result = await getApproval(mockRequest.id);
    expect(result).toBeNull();
  });
});
