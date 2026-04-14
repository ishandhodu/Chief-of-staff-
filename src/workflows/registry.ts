import type { Workflow } from '../types.js';
import { inboxTriageWorkflow } from './inbox-triage.js';
import { threadToTaskWorkflow } from './thread-to-task.js';
import { dailyDigestWorkflow } from './daily-digest.js';
import { calendarManageWorkflow } from './calendar-manage.js';
import { listTodosWorkflow } from './list-todos.js';
import { learnMemoryWorkflow } from './learn-memory.js';

const workflows: Map<string, Workflow> = new Map([
  ['inbox-triage', inboxTriageWorkflow],
  ['thread-to-task', threadToTaskWorkflow],
  ['daily-digest', dailyDigestWorkflow],
  ['calendar-manage', calendarManageWorkflow],
  ['list-todos', listTodosWorkflow],
  ['learn-memory', learnMemoryWorkflow],
]);

export function getWorkflow(name: string): Workflow | undefined {
  return workflows.get(name);
}

export function getAllWorkflows(): Workflow[] {
  return Array.from(workflows.values());
}
