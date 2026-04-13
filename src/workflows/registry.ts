import type { Workflow } from '../types.js';
import { inboxTriageWorkflow } from './inbox-triage.js';
import { threadToTaskWorkflow } from './thread-to-task.js';
import { dailyDigestWorkflow } from './daily-digest.js';

const workflows: Map<string, Workflow> = new Map([
  ['inbox-triage', inboxTriageWorkflow],
  ['thread-to-task', threadToTaskWorkflow],
  ['daily-digest', dailyDigestWorkflow],
]);

export function getWorkflow(name: string): Workflow | undefined {
  return workflows.get(name);
}

export function getAllWorkflows(): Workflow[] {
  return Array.from(workflows.values());
}
