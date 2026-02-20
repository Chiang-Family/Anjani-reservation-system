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
  if (prop.type === 'phone_number') {
    return (prop.phone_number as string) ?? '';
  }
  return '';
}

function getNumberValue(prop: Record<string, unknown>): number {
  if (!prop) return 0;
  return (prop.number as number) ?? 0;
}

function extractStudent(page: Record<string, unknown>): Student {
  const props = (page as { properties: Record<string, unknown> }).properties as Record<string, Record<string, unknown>>;
  return {
    id: (page as { id: string }).id,
    name: getRichTextValue(props[STUDENT_PROPS.NAME]),
    lineUserId: getRichTextValue(props[STUDENT_PROPS.LINE_USER_ID]),
    remainingClasses: getNumberValue(props[STUDENT_PROPS.REMAINING_CLASSES]),
    phone: getRichTextValue(props[STUDENT_PROPS.PHONE]) || undefined,
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

export async function updateRemainingClasses(
  studentId: string,
  newCount: number
): Promise<void> {
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: studentId,
    properties: {
      [STUDENT_PROPS.REMAINING_CLASSES]: { number: newCount },
    },
  });
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

export async function getStudentById(studentId: string): Promise<Student | null> {
  const notion = getNotionClient();
  try {
    const page = await notion.pages.retrieve({ page_id: studentId });
    return extractStudent(page as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}
