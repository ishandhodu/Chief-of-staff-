import type { ApprovalRequest } from '../types.js';

// In-memory store — sufficient for single-function-invocation approval flows
const store = new Map<string, ApprovalRequest>();

const KEY_PREFIX = 'approval:';
const TTL_MS = 3600 * 1000;

export async function saveApproval(request: ApprovalRequest): Promise<void> {
  store.set(`${KEY_PREFIX}${request.id}`, request);
  setTimeout(() => store.delete(`${KEY_PREFIX}${request.id}`), TTL_MS).unref();
}

export async function getApproval(id: string): Promise<ApprovalRequest | null> {
  return store.get(`${KEY_PREFIX}${id}`) ?? null;
}

export async function deleteApproval(id: string): Promise<void> {
  store.delete(`${KEY_PREFIX}${id}`);
}
