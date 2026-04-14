import { listMemories } from '../tools/notion.js';

export async function buildMemoryContext(): Promise<string> {
  let memories;
  try {
    memories = await listMemories();
  } catch {
    return '';
  }

  if (memories.length === 0) return '';

  const contacts = memories.filter((m) => m.type === 'Contact');
  const deadlines = memories.filter((m) => m.type === 'Deadline');

  const lines: string[] = ['Your personalized context:\n'];

  if (contacts.length > 0) {
    lines.push('Contacts:');
    for (const c of contacts) {
      lines.push(`- ${c.subject}: ${c.rule}`);
    }
    lines.push('');
  }

  if (deadlines.length > 0) {
    lines.push('Deadlines to watch for:');
    for (const d of deadlines) {
      const due = d.expires ? ` (due ${d.expires})` : '';
      lines.push(`- ${d.subject}${due}: ${d.rule}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
