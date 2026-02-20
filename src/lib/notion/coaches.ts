import { getNotionClient } from './client';
import { getEnv } from '@/lib/config/env';
import { COACH_PROPS } from './types';
import type { Coach } from '@/types';

function getRichTextValue(prop: Record<string, unknown>): string {
  if (!prop) return '';
  if (prop.type === 'title') {
    const titleArr = prop.title as Array<{ plain_text: string }>;
    return titleArr?.[0]?.plain_text ?? '';
  }
  if (prop.type === 'rich_text') {
    const rtArr = prop.rich_text as Array<{ plain_text: string }>;
    return rtArr?.[0]?.plain_text ?? '';
  }
  if (prop.type === 'select') {
    const sel = prop.select as { name: string } | null;
    return sel?.name ?? '';
  }
  return '';
}

function extractCoach(page: Record<string, unknown>): Coach {
  const props = (page as { properties: Record<string, unknown> }).properties as Record<string, Record<string, unknown>>;
  return {
    id: (page as { id: string }).id,
    name: getRichTextValue(props[COACH_PROPS.NAME]),
    lineUserId: getRichTextValue(props[COACH_PROPS.LINE_USER_ID]),
    status: getRichTextValue(props[COACH_PROPS.STATUS]) || undefined,
  };
}

export async function findCoachByLineId(lineUserId: string): Promise<Coach | null> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_COACHES_DB_ID,
    filter: {
      property: COACH_PROPS.LINE_USER_ID,
      rich_text: { equals: lineUserId },
    },
    page_size: 1,
  });

  if (res.results.length === 0) return null;
  return extractCoach(res.results[0] as unknown as Record<string, unknown>);
}

export async function getCoachById(coachId: string): Promise<Coach | null> {
  const notion = getNotionClient();
  try {
    const page = await notion.pages.retrieve({ page_id: coachId });
    return extractCoach(page as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}
