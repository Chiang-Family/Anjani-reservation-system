import { getNotionClient } from './client';
import { getEnv } from '@/lib/config/env';
import { CHECKIN_PROPS } from './types';
import type { CheckinRecord } from '@/types';

type NotionFilter = Parameters<InstanceType<typeof import('@notionhq/client').Client>['databases']['query']>[0]['filter'];

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
  return '';
}

function getCheckboxValue(prop: Record<string, unknown>): boolean {
  if (!prop) return false;
  return (prop.checkbox as boolean) ?? false;
}

function getRelationIds(prop: Record<string, unknown>): string[] {
  if (!prop) return [];
  const relations = prop.relation as Array<{ id: string }> | undefined;
  return relations?.map((r) => r.id) ?? [];
}

function getDateValue(prop: Record<string, unknown>): string {
  if (!prop) return '';
  const dateObj = prop.date as { start: string } | null;
  return dateObj?.start ?? '';
}

function extractCheckin(page: Record<string, unknown>): CheckinRecord {
  const props = (page as { properties: Record<string, unknown> }).properties as Record<string, Record<string, unknown>>;
  const studentRelation = getRelationIds(props[CHECKIN_PROPS.STUDENT]);
  const coachRelation = getRelationIds(props[CHECKIN_PROPS.COACH]);
  const checkinTime = getDateValue(props[CHECKIN_PROPS.CHECKIN_TIME]);
  const classTimeSlot = getRichTextValue(props[CHECKIN_PROPS.CLASS_TIME_SLOT]);
  const title = getRichTextValue(props[CHECKIN_PROPS.TITLE]);

  return {
    id: (page as { id: string }).id,
    studentId: studentRelation[0] || '',
    coachId: coachRelation[0] || '',
    checkinTime,
    classDate: checkinTime ? checkinTime.slice(0, 10) : '',
    classTimeSlot,
    studentName: title.split(' - ')[0] || undefined,
    studentChecked: getCheckboxValue(props[CHECKIN_PROPS.STUDENT_CHECKED]),
    coachChecked: getCheckboxValue(props[CHECKIN_PROPS.COACH_CHECKED]),
  };
}

export async function createCheckinRecord(params: {
  studentName: string;
  studentId: string;
  coachId: string;
  checkinTime: string;
  classDate: string;
  classTimeSlot: string;
  studentChecked: boolean;
  coachChecked: boolean;
}): Promise<CheckinRecord> {
  const notion = getNotionClient();
  const title = `${params.studentName} - ${params.classDate}`;

  const properties = {
    [CHECKIN_PROPS.TITLE]: {
      title: [{ type: 'text', text: { content: title } }],
    },
    [CHECKIN_PROPS.STUDENT]: {
      relation: [{ id: params.studentId }],
    },
    [CHECKIN_PROPS.COACH]: {
      relation: [{ id: params.coachId }],
    },
    [CHECKIN_PROPS.CHECKIN_TIME]: {
      date: { start: params.checkinTime },
    },
    [CHECKIN_PROPS.CLASS_TIME_SLOT]: {
      rich_text: [{ type: 'text', text: { content: params.classTimeSlot } }],
    },
    [CHECKIN_PROPS.STUDENT_CHECKED]: {
      checkbox: params.studentChecked,
    },
    [CHECKIN_PROPS.COACH_CHECKED]: {
      checkbox: params.coachChecked,
    },
  } as Parameters<typeof notion.pages.create>[0]['properties'];

  const page = await notion.pages.create({
    parent: { database_id: getEnv().NOTION_CHECKIN_DB_ID },
    properties,
  });

  return extractCheckin(page as unknown as Record<string, unknown>);
}

export async function updateCheckinFlags(
  checkinId: string,
  flags: { studentChecked?: boolean; coachChecked?: boolean }
): Promise<void> {
  const notion = getNotionClient();
  const properties: Record<string, unknown> = {};
  if (flags.studentChecked !== undefined) {
    properties[CHECKIN_PROPS.STUDENT_CHECKED] = { checkbox: flags.studentChecked };
  }
  if (flags.coachChecked !== undefined) {
    properties[CHECKIN_PROPS.COACH_CHECKED] = { checkbox: flags.coachChecked };
  }
  await notion.pages.update({
    page_id: checkinId,
    properties: properties as Parameters<typeof notion.pages.update>[0]['properties'],
  });
}

export async function findCheckinToday(
  studentId: string,
  classDate: string
): Promise<CheckinRecord | null> {
  const notion = getNotionClient();
  const filter = {
    and: [
      {
        property: CHECKIN_PROPS.STUDENT,
        relation: { contains: studentId },
      },
      {
        property: CHECKIN_PROPS.CHECKIN_TIME,
        date: { equals: classDate },
      },
    ],
  } as NotionFilter;

  const res = await notion.databases.query({
    database_id: getEnv().NOTION_CHECKIN_DB_ID,
    filter,
    page_size: 1,
  });

  if (res.results.length === 0) return null;
  return extractCheckin(res.results[0] as unknown as Record<string, unknown>);
}

export async function getCheckinsByStudent(studentId: string): Promise<CheckinRecord[]> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_CHECKIN_DB_ID,
    filter: {
      property: CHECKIN_PROPS.STUDENT,
      relation: { contains: studentId },
    },
    sorts: [{ property: CHECKIN_PROPS.CHECKIN_TIME, direction: 'descending' }],
  });

  return res.results.map((page) =>
    extractCheckin(page as unknown as Record<string, unknown>)
  );
}

export async function getCheckinsByDateRange(
  from: string,
  to: string
): Promise<CheckinRecord[]> {
  const notion = getNotionClient();
  const filter = {
    and: [
      {
        property: CHECKIN_PROPS.CHECKIN_TIME,
        date: { on_or_after: from },
      },
      {
        property: CHECKIN_PROPS.CHECKIN_TIME,
        date: { on_or_before: to },
      },
    ],
  } as NotionFilter;

  const res = await notion.databases.query({
    database_id: getEnv().NOTION_CHECKIN_DB_ID,
    filter,
    sorts: [{ property: CHECKIN_PROPS.CHECKIN_TIME, direction: 'descending' }],
  });

  return res.results.map((page) =>
    extractCheckin(page as unknown as Record<string, unknown>)
  );
}
