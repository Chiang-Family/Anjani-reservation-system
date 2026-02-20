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

function getNumberValue(prop: Record<string, unknown>): number {
  if (!prop) return 0;
  return (prop.number as number) ?? 0;
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

function extractStudent(page: Record<string, unknown>): Student {
  const props = (page as { properties: Record<string, unknown> }).properties as Record<string, Record<string, unknown>>;
  const coachRelation = getRelationIds(props[STUDENT_PROPS.COACH]);
  return {
    id: (page as { id: string }).id,
    name: getRichTextValue(props[STUDENT_PROPS.NAME]),
    lineUserId: getRichTextValue(props[STUDENT_PROPS.LINE_USER_ID]),
    coachId: coachRelation[0] || undefined,
    purchasedClasses: getNumberValue(props[STUDENT_PROPS.PURCHASED_CLASSES]),
    pricePerClass: getNumberValue(props[STUDENT_PROPS.PRICE_PER_CLASS]),
    completedClasses: getNumberValue(props[STUDENT_PROPS.COMPLETED_CLASSES]),
    isPaid: getCheckboxValue(props[STUDENT_PROPS.IS_PAID]),
    status: getRichTextValue(props[STUDENT_PROPS.STATUS]) || undefined,
  };
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

export async function updateCompletedClasses(
  studentId: string,
  newCount: number
): Promise<void> {
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: studentId,
    properties: {
      [STUDENT_PROPS.COMPLETED_CLASSES]: { number: newCount },
    },
  });
}

export async function updateStudent(
  studentId: string,
  fields: {
    purchasedClasses?: number;
    pricePerClass?: number;
    isPaid?: boolean;
  }
): Promise<void> {
  const notion = getNotionClient();
  const properties: Record<string, unknown> = {};
  if (fields.purchasedClasses !== undefined) {
    properties[STUDENT_PROPS.PURCHASED_CLASSES] = { number: fields.purchasedClasses };
  }
  if (fields.pricePerClass !== undefined) {
    properties[STUDENT_PROPS.PRICE_PER_CLASS] = { number: fields.pricePerClass };
  }
  if (fields.isPaid !== undefined) {
    properties[STUDENT_PROPS.IS_PAID] = { checkbox: fields.isPaid };
  }
  await notion.pages.update({
    page_id: studentId,
    properties: properties as Parameters<typeof notion.pages.update>[0]['properties'],
  });
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
  purchasedClasses: number;
  pricePerClass: number;
  isPaid: boolean;
}): Promise<Student> {
  const notion = getNotionClient();
  const properties = {
    [STUDENT_PROPS.NAME]: {
      title: [{ type: 'text', text: { content: params.name } }],
    },
    [STUDENT_PROPS.COACH]: {
      relation: [{ id: params.coachId }],
    },
    [STUDENT_PROPS.PURCHASED_CLASSES]: {
      number: params.purchasedClasses,
    },
    [STUDENT_PROPS.PRICE_PER_CLASS]: {
      number: params.pricePerClass,
    },
    [STUDENT_PROPS.COMPLETED_CLASSES]: {
      number: 0,
    },
    [STUDENT_PROPS.IS_PAID]: {
      checkbox: params.isPaid,
    },
  } as Parameters<typeof notion.pages.create>[0]['properties'];

  const page = await notion.pages.create({
    parent: { database_id: getEnv().NOTION_STUDENTS_DB_ID },
    properties,
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
