import { NextResponse } from 'next/server';
import { getNotionClient } from '@/lib/notion/client';
import { getEnv } from '@/lib/config/env';

export async function GET() {
  try {
    const notion = getNotionClient();
    const res = await notion.databases.query({
      database_id: getEnv().NOTION_COACHES_DB_ID,
      page_size: 3,
    });
    const raw = res.results.map((page: unknown) => {
      const p = page as { properties: Record<string, unknown> };
      return {
        props: Object.entries(p.properties).map(([key, val]) => ({
          key,
          type: (val as Record<string, unknown>).type,
          value: val,
        })),
      };
    });
    return NextResponse.json(raw);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
