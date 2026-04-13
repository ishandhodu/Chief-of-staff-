import Redis from 'ioredis';
import type { ApprovalRequest } from '../types.js';

const redis = new Redis(process.env.chief_of_staff_REDIS_URL!);

const KEY_PREFIX = 'approval:';
const TTL_SECONDS = 3600;

export async function saveApproval(request: ApprovalRequest): Promise<void> {
  await redis.set(`${KEY_PREFIX}${request.id}`, JSON.stringify(request), 'EX', TTL_SECONDS);
}

export async function getApproval(id: string): Promise<ApprovalRequest | null> {
  const raw = await redis.get(`${KEY_PREFIX}${id}`);
  return raw ? (JSON.parse(raw) as ApprovalRequest) : null;
}

export async function deleteApproval(id: string): Promise<void> {
  await redis.del(`${KEY_PREFIX}${id}`);
}
