import type { Workflow, WorkflowContext } from '../types.js';
import { listTasks } from '../tools/notion.js';

export const listTodosWorkflow: Workflow = {
  name: 'list-todos',
  async run(ctx: WorkflowContext) {
    const tasks = await listTasks({});

    if (tasks.length === 0) {
      await ctx.postToSlack('No open tasks found in Notion.');
      return;
    }

    // Group by status
    const grouped: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      const key = task.status;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(task);
    }

    const databaseId = process.env.NOTION_DATABASE_ID ?? '';
    const dbUrl = `https://www.notion.so/${databaseId.replace(/-/g, '')}`;

    const lines: string[] = [`*Open Tasks (${tasks.length})*\n`];

    for (const [status, items] of Object.entries(grouped)) {
      lines.push(`*${status}*`);
      for (const item of items) {
        lines.push(`  • ${item.title}`);
      }
      lines.push('');
    }

    lines.push(`<${dbUrl}|View all in Notion>`);

    await ctx.postToSlack(lines.join('\n'));
  },
};
