import { Client } from '@notionhq/client';

function getNotionClient() {
  return new Client({ auth: process.env.NOTION_API_KEY });
}

export interface NotionTask {
  pageId: string;
  url: string;
}

export async function createTask(args: Record<string, unknown>): Promise<NotionTask> {
  const title = args.title as string | undefined;
  if (!title || typeof title !== 'string') {
    throw new Error('createTask requires a non-empty title string');
  }

  const { deadline, stakeholders, context, sourceId, priority } = args as {
    deadline?: string;
    stakeholders?: string;
    context?: string;
    sourceId?: string;
    priority?: string;
  };

  const notion = getNotionClient();
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) throw new Error('NOTION_DATABASE_ID environment variable is not set');

  const properties: Record<string, unknown> = {
    Name: { title: [{ text: { content: title } }] },
    Status: { select: { name: 'To Do' } },
  };

  if (deadline) {
    properties['Deadline'] = { date: { start: deadline } };
  }
  if (stakeholders) {
    properties['Stakeholders'] = { rich_text: [{ text: { content: stakeholders } }] };
  }
  if (context) {
    properties['Context'] = { rich_text: [{ text: { content: context } }] };
  }
  if (sourceId) {
    properties['Source'] = { rich_text: [{ text: { content: sourceId } }] };
  }
  if (priority) {
    properties['Priority'] = { select: { name: priority } };
  }

  const res = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: properties as never,
  });

  const page = res as { id: string; url: string };
  if (!page.id) throw new Error('Notion API returned page without id');

  return { pageId: page.id, url: page.url };
}

export interface PageResult {
  pageId: string;
  title: string;
  url: string;
}

export async function searchPages(args: Record<string, unknown>): Promise<PageResult[]> {
  const query = args.query as string | undefined;
  if (!query || typeof query !== 'string') {
    throw new Error('searchPages requires a non-empty query string');
  }

  const notion = getNotionClient();
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) throw new Error('NOTION_DATABASE_ID environment variable is not set');

  const res = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'Name',
      title: { contains: query },
    },
    page_size: 10,
  });

  return res.results.map((page: unknown) => {
    const p = page as {
      id: string;
      url: string;
      properties: { Name: { title: Array<{ plain_text: string }> } };
    };
    return {
      pageId: p.id,
      title: p.properties.Name.title[0]?.plain_text ?? '',
      url: p.url,
    };
  });
}

export interface TaskListItem {
  pageId: string;
  title: string;
  status: string;
  url: string;
}

export async function listTasks(_args: Record<string, unknown>): Promise<TaskListItem[]> {
  const notion = getNotionClient();
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) throw new Error('NOTION_DATABASE_ID environment variable is not set');

  const res = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'Status',
      select: { does_not_equal: 'Done' },
    },
    page_size: 50,
  });

  return res.results.map((page: unknown) => {
    const p = page as {
      id: string;
      url: string;
      properties: {
        Name: { title: Array<{ plain_text: string }> };
        Status: { select: { name: string } | null };
      };
    };
    return {
      pageId: p.id,
      title: p.properties.Name.title[0]?.plain_text ?? '(untitled)',
      status: p.properties.Status.select?.name ?? 'Unknown',
      url: p.url,
    };
  });
}

export async function updatePage(args: Record<string, unknown>): Promise<{ success: boolean; pageId: string }> {
  const pageId = args.pageId as string | undefined;
  const status = args.status as string | undefined;

  if (!pageId || typeof pageId !== 'string') {
    throw new Error('updatePage requires a non-empty pageId string');
  }
  if (!status || typeof status !== 'string') {
    throw new Error('updatePage requires a non-empty status string');
  }

  const notion = getNotionClient();

  await notion.pages.update({
    page_id: pageId,
    properties: {
      Status: { select: { name: status } },
    } as never,
  });

  return { success: true, pageId };
}

export interface MemoryEntry {
  pageId: string;
  subject: string;
  type: 'Contact' | 'Deadline';
  rule: string;
  expires: string | null;
  raw: string;
}

export async function saveMemory(args: {
  subject: string;
  type: 'Contact' | 'Deadline';
  rule: string;
  expires?: string | null;
  raw: string;
}): Promise<{ pageId: string }> {
  const notion = getNotionClient();
  const databaseId = process.env.NOTION_MEMORY_DATABASE_ID;
  if (!databaseId) throw new Error('NOTION_MEMORY_DATABASE_ID environment variable is not set');

  const properties: Record<string, unknown> = {
    Name: { title: [{ text: { content: args.subject } }] },
    Type: { select: { name: args.type } },
    Rule: { rich_text: [{ text: { content: args.rule } }] },
    Raw: { rich_text: [{ text: { content: args.raw } }] },
  };

  if (args.expires) {
    properties['Expires'] = { date: { start: args.expires } };
  }

  const res = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: properties as never,
  });

  const page = res as { id: string };
  if (!page.id) throw new Error('Notion API returned page without id');
  return { pageId: page.id };
}

export async function listMemories(): Promise<MemoryEntry[]> {
  const notion = getNotionClient();
  const databaseId = process.env.NOTION_MEMORY_DATABASE_ID;
  if (!databaseId) throw new Error('NOTION_MEMORY_DATABASE_ID environment variable is not set');

  const res = await notion.databases.query({
    database_id: databaseId,
    page_size: 100,
  });

  const today = new Date().toISOString().split('T')[0];

  return res.results
    .map((page: unknown) => {
      const p = page as {
        id: string;
        properties: {
          Name: { title: Array<{ plain_text: string }> };
          Type: { select: { name: string } | null };
          Rule: { rich_text: Array<{ plain_text: string }> };
          Expires: { date: { start: string } | null };
          Raw: { rich_text: Array<{ plain_text: string }> };
        };
      };
      return {
        pageId: p.id,
        subject: p.properties.Name.title[0]?.plain_text ?? '',
        type: (p.properties.Type.select?.name ?? 'Contact') as 'Contact' | 'Deadline',
        rule: p.properties.Rule.rich_text[0]?.plain_text ?? '',
        expires: p.properties.Expires.date?.start ?? null,
        raw: p.properties.Raw.rich_text[0]?.plain_text ?? '',
      };
    })
    .filter((entry) => !entry.expires || entry.expires >= today);
}
