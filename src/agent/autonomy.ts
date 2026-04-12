const LOW_RISK_TOOLS = new Set([
  'list_emails',
  'search_thread',
  'save_draft',
  'label_email',
  'list_today_events',
  'detect_conflicts',
  'create_task',
  'search_pages',
  'update_page',
  'post_message',
]);

export function getRiskLevel(toolName: string): 'low' | 'high' {
  return LOW_RISK_TOOLS.has(toolName) ? 'low' : 'high';
}
