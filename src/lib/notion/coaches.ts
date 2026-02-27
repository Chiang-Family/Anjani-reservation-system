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

function getNumberValue(prop: Record<string, unknown>): number {
  if (!prop) return 0;
  return (prop.number as number) ?? 0;
}

function getUrlValue(prop: Record<string, unknown>): string {
  if (!prop) return '';
  return (prop.url as string) ?? '';
}

function extractCoach(page: Record<string, unknown>): Coach {
  const props = (page as { properties: Record<string, unknown> }).properties as Record<string, Record<string, unknown>>;
  const colorId = getNumberValue(props[COACH_PROPS.CALENDAR_COLOR_ID]);
  const googleEmail = getRichTextValue(props[COACH_PROPS.GOOGLE_EMAIL]);
  return {
    id: (page as { id: string }).id,
    name: getRichTextValue(props[COACH_PROPS.NAME]),
    lineUserId: getRichTextValue(props[COACH_PROPS.LINE_USER_ID]),
    lineUrl: getUrlValue(props[COACH_PROPS.LINE_URL]) || undefined,
    calendarColorId: colorId || undefined,
    googleEmail: googleEmail || undefined,
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

export async function findCoachByName(name: string): Promise<Coach | null> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_COACHES_DB_ID,
    filter: {
      property: COACH_PROPS.NAME,
      title: { equals: name },
    },
    page_size: 1,
  });

  if (res.results.length === 0) return null;
  return extractCoach(res.results[0] as unknown as Record<string, unknown>);
}

export async function bindCoachLineId(
  coachId: string,
  lineUserId: string
): Promise<void> {
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: coachId,
    properties: {
      [COACH_PROPS.LINE_USER_ID]: {
        rich_text: [{ type: 'text', text: { content: lineUserId } }],
      },
    },
  });
}

export async function getAllCoaches(): Promise<Coach[]> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_COACHES_DB_ID,
    sorts: [{ property: COACH_PROPS.NAME, direction: 'ascending' }],
  });

  return res.results.map((page) =>
    extractCoach(page as unknown as Record<string, unknown>)
  );
}

export async function updateCoachGoogleEmail(coachId: string, email: string): Promise<void> {
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: coachId,
    properties: {
      [COACH_PROPS.GOOGLE_EMAIL]: {
        rich_text: [{ type: 'text', text: { content: email } }],
      },
    },
  });
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
