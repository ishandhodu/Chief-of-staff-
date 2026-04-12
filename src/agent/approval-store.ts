import { kv } from '@vercel/kv';
import type { ApprovalRequest } from '@/types';

const KEY_PREFIX = 'approval:';

export async function saveApproval(request: ApprovalRequest): Promise<void> {
  await kv.set(`${KEY_PREFIX}${request.id}`, request, { ex: 3600 });
}

export async function getApproval(id: string): Promise<ApprovalRequest | null> {
  return kv.get<ApprovalRequest>(`${KEY_PREFIX}${id}`);
}

export async function deleteApproval(id: string): Promise<void> {
  await kv.del(`${KEY_PREFIX}${id}`);
}
