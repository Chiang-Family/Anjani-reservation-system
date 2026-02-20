import { getNotionClient } from './client';
import { getEnv } from '@/lib/config/env';
import { CLASS_SLOT_PROPS } from './types';
import type { ClassSlot } from '@/types';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TZ = 'Asia/Taipei';

function getRichTextValue(prop: Record<string, unknown>): string {
  if (!prop) return '';
  if (prop.type === 'title') {
    const titleArr = prop.title as Array<{ plain_text: string }>;
    return titleArr?.[0]?.plain_text ?? '';
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

function getRelationIds(prop: Record<string, unknown>): string[] {
  if (!prop) return [];
  const relations = prop.relation as Array<{ id: string }> | undefined;
  return relations?.map((r) => r.id) ?? [];
}

/** 從 Notion date 屬性提取日期、開始時間、結束時間 */
function parseDateProp(prop: Record<string, unknown>): {
  date: string;
  startTime: string;
  endTime: string;
} {
  if (!prop || prop.type !== 'date') {
    return { date: '', startTime: '', endTime: '' };
  }

  const dateObj = prop.date as { start?: string; end?: string } | null;
  if (!dateObj?.start) {
    return { date: '', startTime: '', endTime: '' };
  }

  const startStr = dateObj.start; // e.g. "2026-02-20T10:00:00.000+08:00" or "2026-02-20"
  const endStr = dateObj.end; // e.g. "2026-02-20T11:00:00.000+08:00" or null

  const startDate = toZonedTime(new Date(startStr), TZ);
  const dateFormatted = format(startDate, 'yyyy-MM-dd');

  // 如果包含時間資訊（含 T），提取 HH:mm
  const startTime = startStr.includes('T')
    ? format(startDate, 'HH:mm')
    : '';

  let endTime = '';
  if (endStr) {
    const endDate = toZonedTime(new Date(endStr), TZ);
    endTime = endStr.includes('T')
      ? format(endDate, 'HH:mm')
      : '';
  }

  return { date: dateFormatted, startTime, endTime };
}

function extractClassSlot(page: Record<string, unknown>): ClassSlot {
  const props = (page as { properties: Record<string, unknown> }).properties as Record<string, Record<string, unknown>>;
  const coachRelation = getRelationIds(props[CLASS_SLOT_PROPS.COACH]);
  const { date, startTime, endTime } = parseDateProp(props[CLASS_SLOT_PROPS.DATE]);

  return {
    id: (page as { id: string }).id,
    title: getRichTextValue(props[CLASS_SLOT_PROPS.TITLE]),
    coachId: coachRelation[0] ?? '',
    date,
    startTime,
    endTime,
    maxCapacity: getNumberValue(props[CLASS_SLOT_PROPS.MAX_CAPACITY]),
    currentCount: getNumberValue(props[CLASS_SLOT_PROPS.CURRENT_COUNT]),
    status: getRichTextValue(props[CLASS_SLOT_PROPS.STATUS]) || undefined,
  };
}

export async function getAvailableSlots(fromDate: string): Promise<ClassSlot[]> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_CLASS_SLOTS_DB_ID,
    filter: {
      property: CLASS_SLOT_PROPS.DATE,
      date: { on_or_after: fromDate },
    },
    sorts: [
      { property: CLASS_SLOT_PROPS.DATE, direction: 'ascending' },
    ],
    page_size: 20,
  });

  return res.results
    .map((p) => extractClassSlot(p as unknown as Record<string, unknown>))
    .filter((slot) => slot.currentCount < slot.maxCapacity);
}

export async function getSlotsByDate(date: string): Promise<ClassSlot[]> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_CLASS_SLOTS_DB_ID,
    filter: {
      property: CLASS_SLOT_PROPS.DATE,
      date: { equals: date },
    },
    sorts: [
      { property: CLASS_SLOT_PROPS.DATE, direction: 'ascending' },
    ],
  });

  return res.results.map((p) => extractClassSlot(p as unknown as Record<string, unknown>));
}

export async function getSlotsByCoachAndDateRange(
  coachId: string,
  fromDate: string,
  toDate?: string
): Promise<ClassSlot[]> {
  const notion = getNotionClient();

  const andFilters: Array<{
    property: string;
    relation?: { contains: string };
    date?: { on_or_after?: string; on_or_before?: string };
  }> = [
    {
      property: CLASS_SLOT_PROPS.COACH,
      relation: { contains: coachId },
    },
    {
      property: CLASS_SLOT_PROPS.DATE,
      date: { on_or_after: fromDate },
    },
  ];

  if (toDate) {
    andFilters.push({
      property: CLASS_SLOT_PROPS.DATE,
      date: { on_or_before: toDate },
    });
  }

  const res = await notion.databases.query({
    database_id: getEnv().NOTION_CLASS_SLOTS_DB_ID,
    filter: { and: andFilters } as Parameters<typeof notion.databases.query>[0]['filter'],
    sorts: [
      { property: CLASS_SLOT_PROPS.DATE, direction: 'ascending' },
    ],
    page_size: 20,
  });

  return res.results.map((p) => extractClassSlot(p as unknown as Record<string, unknown>));
}

export async function getSlotById(slotId: string): Promise<ClassSlot | null> {
  const notion = getNotionClient();
  try {
    const page = await notion.pages.retrieve({ page_id: slotId });
    return extractClassSlot(page as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function updateSlotCurrentCount(
  slotId: string,
  newCount: number
): Promise<void> {
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: slotId,
    properties: {
      [CLASS_SLOT_PROPS.CURRENT_COUNT]: { number: newCount },
    },
  });
}
