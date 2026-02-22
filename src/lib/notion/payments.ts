import { getNotionClient } from './client';
import { getEnv } from '@/lib/config/env';
import { PAYMENT_PROPS } from './types';
import type { PaymentRecord } from '@/types';
import { format } from 'date-fns';
import { nowTaipei } from '@/lib/utils/date';
import { clearStudentHoursCache } from './hours';

type NotionFilter = Parameters<ReturnType<typeof getNotionClient>['databases']['query']>[0] extends { filter?: infer F } ? F : never;

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

function getNumberValue(prop: Record<string, unknown>): number {
  if (!prop) return 0;
  return (prop.number as number) ?? 0;
}

function getFormulaNumberValue(prop: Record<string, unknown>): number {
  if (!prop) return 0;
  if (prop.type === 'formula') {
    const formula = prop.formula as { type: string; number?: number | null };
    return formula.type === 'number' ? (formula.number ?? 0) : 0;
  }
  // Fallback for number type (migration safety)
  return (prop.number as number) ?? 0;
}

function getSelectValue(prop: Record<string, unknown>): string {
  if (!prop) return '';
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

function getDateValue(prop: Record<string, unknown>): string {
  if (!prop) return '';
  if (prop.type === 'date') {
    const d = prop.date as { start: string } | null;
    return d?.start ?? '';
  }
  return '';
}

/** 單堂繳費標題標記 */
const SESSION_PAYMENT_TAG = '[單堂]';

function extractPayment(page: Record<string, unknown>): PaymentRecord {
  const props = (page as { properties: Record<string, unknown> }).properties as Record<string, Record<string, unknown>>;
  const studentRelation = getRelationIds(props[PAYMENT_PROPS.STUDENT]);
  const coachRelation = getRelationIds(props[PAYMENT_PROPS.COACH]);
  const status = getSelectValue(props[PAYMENT_PROPS.STATUS]);
  const paidAmount = getNumberValue(props[PAYMENT_PROPS.PAID_AMOUNT]);
  const fullTitle = getRichTextValue(props[PAYMENT_PROPS.TITLE]);
  const isSessionPayment = fullTitle.includes(SESSION_PAYMENT_TAG);
  const cleanTitle = fullTitle.replace(SESSION_PAYMENT_TAG, '').trim();
  return {
    id: (page as { id: string }).id,
    studentId: studentRelation[0] || '',
    coachId: coachRelation[0] || '',
    studentName: cleanTitle.split(' - ')[0] || '',
    purchasedHours: getNumberValue(props[PAYMENT_PROPS.PURCHASED_HOURS]),
    pricePerHour: getNumberValue(props[PAYMENT_PROPS.PRICE_PER_HOUR]),
    totalAmount: getFormulaNumberValue(props[PAYMENT_PROPS.TOTAL_AMOUNT]),
    paidAmount,
    status: status === '已繳費' ? '已繳費' : status === '部分繳費' ? '部分繳費' : '未繳費',
    createdAt: cleanTitle.split(' - ')[1]?.trim() || getDateValue(props[PAYMENT_PROPS.CREATED_AT]),
    actualDate: getDateValue(props[PAYMENT_PROPS.CREATED_AT]),
    isSessionPayment,
  };
}

export async function createPaymentRecord(params: {
  studentId: string;
  studentName: string;
  coachId: string;
  purchasedHours: number;
  pricePerHour: number;
  status: '已繳費' | '部分繳費' | '未繳費';
  paidAmount?: number;
  periodDate?: string;
  /** 覆寫建立日期（用於單堂補繳，讓日期對齊課程日期） */
  overrideDate?: string;
  /** 標記為單堂繳費（標題加 [單堂] 標記） */
  isSessionPayment?: boolean;
}): Promise<PaymentRecord> {
  const notion = getNotionClient();
  const now = nowTaipei();
  const actualDateStr = params.overrideDate ?? format(now, 'yyyy-MM-dd');
  const titleDateStr = params.periodDate ?? actualDateStr;
  const title = params.isSessionPayment
    ? `${SESSION_PAYMENT_TAG} ${params.studentName} - ${titleDateStr}`
    : `${params.studentName} - ${titleDateStr}`;

  const properties = {
    [PAYMENT_PROPS.TITLE]: {
      title: [{ type: 'text', text: { content: title } }],
    },
    [PAYMENT_PROPS.STUDENT]: {
      relation: [{ id: params.studentId }],
    },
    [PAYMENT_PROPS.COACH]: {
      relation: [{ id: params.coachId }],
    },
    [PAYMENT_PROPS.PURCHASED_HOURS]: {
      number: params.purchasedHours,
    },
    [PAYMENT_PROPS.PRICE_PER_HOUR]: {
      number: params.pricePerHour,
    },
    [PAYMENT_PROPS.PAID_AMOUNT]: {
      number: params.paidAmount ?? 0,
    },
    [PAYMENT_PROPS.STATUS]: {
      select: { name: params.status },
    },
    [PAYMENT_PROPS.CREATED_AT]: {
      date: { start: actualDateStr },
    },
  } as Parameters<typeof notion.pages.create>[0]['properties'];

  const page = await notion.pages.create({
    parent: { database_id: getEnv().NOTION_PAYMENTS_DB_ID },
    properties,
  });

  clearStudentHoursCache(params.studentId); // Added this line

  return extractPayment(page as unknown as Record<string, unknown>);
}

export async function getPaymentsByStudent(studentId: string): Promise<PaymentRecord[]> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_PAYMENTS_DB_ID,
    filter: {
      property: PAYMENT_PROPS.STUDENT,
      relation: { contains: studentId },
    },
    sorts: [{ property: PAYMENT_PROPS.CREATED_AT, direction: 'descending' }],
  });

  const payments = res.results.map((page) =>
    extractPayment(page as unknown as Record<string, unknown>)
  );
  // 依標題日期重新排序（降序），確保與期數計算一致
  payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return payments;
}

export async function getPaymentsByStudents(studentIds: string[]): Promise<PaymentRecord[]> {
  if (studentIds.length === 0) return [];
  if (studentIds.length === 1) return getPaymentsByStudent(studentIds[0]);

  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_PAYMENTS_DB_ID,
    filter: {
      or: studentIds.map((id) => ({
        property: PAYMENT_PROPS.STUDENT,
        relation: { contains: id },
      })),
    } as NotionFilter,
    sorts: [{ property: PAYMENT_PROPS.CREATED_AT, direction: 'descending' }],
  });

  const payments = res.results.map((page) =>
    extractPayment(page as unknown as Record<string, unknown>)
  );
  payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return payments;
}

export async function getLatestPaymentByStudent(studentId: string): Promise<PaymentRecord | null> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_PAYMENTS_DB_ID,
    filter: {
      property: PAYMENT_PROPS.STUDENT,
      relation: { contains: studentId },
    },
    sorts: [{ property: PAYMENT_PROPS.CREATED_AT, direction: 'descending' }],
    page_size: 1,
  });

  if (res.results.length === 0) return null;
  return extractPayment(res.results[0] as unknown as Record<string, unknown>);
}

export async function getPaymentsByCoachStudents(coachId: string): Promise<PaymentRecord[]> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_PAYMENTS_DB_ID,
    filter: {
      property: PAYMENT_PROPS.COACH,
      relation: { contains: coachId },
    },
    sorts: [{ property: PAYMENT_PROPS.CREATED_AT, direction: 'descending' }],
  });

  return res.results.map((page) =>
    extractPayment(page as unknown as Record<string, unknown>)
  );
}

export async function updatePaymentStatus(
  paymentId: string,
  status: '已繳費' | '部分繳費' | '未繳費'
): Promise<void> {
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: paymentId,
    properties: {
      [PAYMENT_PROPS.STATUS]: {
        select: { name: status },
      },
    } as Parameters<typeof notion.pages.update>[0]['properties'],
  });
}

export async function recordPaymentAmount(
  paymentId: string,
  amount: number,
  currentPaid: number,
  totalAmount: number
): Promise<{ newPaidAmount: number; newStatus: '已繳費' | '部分繳費' }> {
  const notion = getNotionClient();
  const newPaid = currentPaid + amount;
  const fullyPaid = newPaid >= totalAmount;
  const newPaidAmount = fullyPaid ? totalAmount : newPaid;
  const newStatus = fullyPaid ? '已繳費' as const : '部分繳費' as const;

  await notion.pages.update({
    page_id: paymentId,
    properties: {
      [PAYMENT_PROPS.PAID_AMOUNT]: {
        number: newPaidAmount,
      },
      [PAYMENT_PROPS.STATUS]: {
        select: { name: newStatus },
      },
    } as Parameters<typeof notion.pages.update>[0]['properties'],
  });

  return { newPaidAmount, newStatus };
}

export async function updatePaymentHours(
  paymentId: string,
  purchasedHours: number
): Promise<void> {
  const notion = getNotionClient();
  await notion.pages.update({
    page_id: paymentId,
    properties: {
      [PAYMENT_PROPS.PURCHASED_HOURS]: {
        number: purchasedHours,
      },
    } as Parameters<typeof notion.pages.update>[0]['properties'],
  });
}

export async function getPaymentsByDate(dateStr: string): Promise<PaymentRecord[]> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_PAYMENTS_DB_ID,
    filter: {
      property: PAYMENT_PROPS.CREATED_AT,
      date: { equals: dateStr },
    },
  });

  return res.results.map((page) =>
    extractPayment(page as unknown as Record<string, unknown>)
  );
}

export async function getLatestUnpaidPayment(studentId: string): Promise<PaymentRecord | null> {
  const notion = getNotionClient();
  const res = await notion.databases.query({
    database_id: getEnv().NOTION_PAYMENTS_DB_ID,
    filter: {
      and: [
        {
          property: PAYMENT_PROPS.STUDENT,
          relation: { contains: studentId },
        },
        {
          property: PAYMENT_PROPS.STATUS,
          select: { does_not_equal: '已繳費' },
        },
      ],
    } as NotionFilter,
    sorts: [{ property: PAYMENT_PROPS.CREATED_AT, direction: 'descending' }],
    page_size: 1,
  });

  if (res.results.length === 0) return null;
  return extractPayment(res.results[0] as unknown as Record<string, unknown>);
}
