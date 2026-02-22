import { getNotionClient } from './client';
import { getEnv } from '@/lib/config/env';
import { STUDENT_PROPS } from './types';
import type { Student } from '@/types';

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

function getRelationIds(prop: Record<string, unknown>): string[] {
  if (!prop) return [];
  const relations = prop.relation as Array<{ id: string }> | undefined;
  return relations?.map((r) => r.id) ?? [];
}

function getNumberValue(prop: Record<string, unknown>): number | undefined {
  if (!prop) return undefined;
  const val = prop.number as number | null | undefined;
  return val ?? undefined;
}

function extractStudent(page: Record<string, unknown>): Student {
  const props = (page as { properties: Record<string, unknown> }).properties as Record<string, Record<string, unknown>>;
  const coachRelation = getRelationIds(props[STUDENT_PROPS.COACH]);
  const paymentType = getRichTextValue(props[STUDENT_PROPS.PAYMENT_TYPE]) || undefined;
  const relatedIds = getRelationIds(props[STUDENT_PROPS.RELATED_STUDENTS]);
  return {
    id: (page as { id: string }).id,
    name: getRichTextValue(props[STUDENT_PROPS.NAME]),
    lineUserId: getRichTextValue(props[STUDENT_PROPS.LINE_USER_ID]),
    coachId: coachRelation[0] || undefined,
    status: getRichTextValue(props[STUDENT_PROPS.STATUS]) || undefined,
    paymentType: paymentType === '單堂' ? '單堂' : paymentType === '多堂' ? '套時數' : undefined,
    perSessionFee: getNumberValue(props[STUDENT_PROPS.PER_SESSION_FEE]),
    relatedStudentIds: relatedIds.length > 0 ? relatedIds : undefined,
  };
}

/** 回傳學員本人 + 所有關聯學員的 ID 陣列 */
export function getAllStudentIds(student: Student): string[] {
  return [student.id, ...(student.relatedStudentIds ?? [])];
}

export async function findStudentByLineId(lineUserId: string): Promise<Student | null> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_STUDENTS_DB_ID,
    filter: {
      property: STUDENT_PROPS.LINE_USER_ID,
      rich_text: { equals: lineUserId },
    },
    page_size: 1,
  });

  if (res.results.length === 0) return null;
  return extractStudent(res.results[0] as unknown as Record<string, unknown>);
}

export async function findStudentByName(name: string): Promise<Student | null> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_STUDENTS_DB_ID,
    filter: {
      property: STUDENT_PROPS.NAME,
      title: { equals: name },
    },
    page_size: 1,
  });

  if (res.results.length === 0) return null;
  return extractStudent(res.results[0] as unknown as Record<string, unknown>);
}

export async function bindStudentLineId(
  studentId: string,
  lineUserId: string
): Promise<void> {
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: studentId,
    properties: {
      [STUDENT_PROPS.LINE_USER_ID]: {
        rich_text: [{ type: 'text', text: { content: lineUserId } }],
      },
    },
  });
}

export async function createStudent(params: {
  name: string;
  coachId: string;
  paymentType?: '單堂' | '多堂';
  perSessionFee?: number;
}): Promise<Student> {
  const notion = getNotionClient();
  const properties: Record<string, unknown> = {
    [STUDENT_PROPS.NAME]: {
      title: [{ type: 'text', text: { content: params.name } }],
    },
    [STUDENT_PROPS.COACH]: {
      relation: [{ id: params.coachId }],
    },
  };
  if (params.paymentType) {
    properties[STUDENT_PROPS.PAYMENT_TYPE] = {
      select: { name: params.paymentType },
    };
  }
  if (params.perSessionFee != null) {
    properties[STUDENT_PROPS.PER_SESSION_FEE] = {
      number: params.perSessionFee,
    };
  }

  const page = await notion.pages.create({
    parent: { database_id: getEnv().NOTION_STUDENTS_DB_ID },
    properties: properties as Parameters<typeof notion.pages.create>[0]['properties'],
  });

  return extractStudent(page as unknown as Record<string, unknown>);
}

export async function getAllStudents(): Promise<Student[]> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_STUDENTS_DB_ID,
    sorts: [{ property: STUDENT_PROPS.NAME, direction: 'ascending' }],
  });

  return res.results.map((page) =>
    extractStudent(page as unknown as Record<string, unknown>)
  );
}

export async function getStudentsByCoachId(coachId: string): Promise<Student[]> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_STUDENTS_DB_ID,
    filter: {
      property: STUDENT_PROPS.COACH,
      relation: { contains: coachId },
    },
  });

  return res.results.map((page) =>
    extractStudent(page as unknown as Record<string, unknown>)
  );
}

export async function getStudentById(studentId: string): Promise<Student | null> {
  const notion = getNotionClient();
  try {
    const page = await notion.pages.retrieve({ page_id: studentId });
    return extractStudent(page as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}
