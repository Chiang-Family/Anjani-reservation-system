import { NextResponse } from 'next/server';
import { getNotionClient } from '@/lib/notion/client';
import { getEnv } from '@/lib/config/env';
import { PAYMENT_PROPS } from '@/lib/notion/types';
import { findStudentByName } from '@/lib/notion/students';
import { findCoachByName } from '@/lib/notion/coaches';

interface ImportEntry {
  studentName: string;
  pricePerHour: number;
  purchasedHours: number;
  rocDate: string; // e.g. "115-02-13"
}

function rocToIso(rocDate: string): string {
  const [rocYear, month, day] = rocDate.split('-');
  const year = parseInt(rocYear, 10) + 1911;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

const entries: ImportEntry[] = [
  { studentName: '宋沛慈', pricePerHour: 1300, purchasedHours: 10, rocDate: '115-02-13' },
  { studentName: '謝幸㚬', pricePerHour: 1350, purchasedHours: 10, rocDate: '115-02-03' },
  { studentName: '洪慧瑩', pricePerHour: 1300, purchasedHours: 10, rocDate: '115-01-12' },
  { studentName: '黃鈺華', pricePerHour: 1300, purchasedHours: 10, rocDate: '114-11-10' },
  { studentName: '陳彤安', pricePerHour: 1350, purchasedHours: 10, rocDate: '114-11-26' },
  { studentName: '蔡惠珍', pricePerHour: 1350, purchasedHours: 10, rocDate: '114-04-23' },
  { studentName: '鍾旻', pricePerHour: 1300, purchasedHours: 10, rocDate: '114-07-17' },
  { studentName: '葉秋艷', pricePerHour: 1200, purchasedHours: 10.5, rocDate: '114-12-29' },
  { studentName: '詹麗馨', pricePerHour: 1400, purchasedHours: 10, rocDate: '115-01-08' },
  { studentName: '彭富美', pricePerHour: 1300, purchasedHours: 10, rocDate: '115-01-28' },
  { studentName: '林香吟', pricePerHour: 1300, purchasedHours: 5, rocDate: '115-02-03' },
  { studentName: '徐思敏', pricePerHour: 1350, purchasedHours: 5, rocDate: '115-01-21' },
  { studentName: '洪繪雅', pricePerHour: 1300, purchasedHours: 10, rocDate: '114-11-24' },
  { studentName: '楊芳枝', pricePerHour: 1300, purchasedHours: 10, rocDate: '115-02-03' },
  { studentName: '瑜勳', pricePerHour: 1200, purchasedHours: 1, rocDate: '115-02-12' },
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('execute') !== 'true';

  try {
    const coach = await findCoachByName('Winnie');
    if (!coach) {
      return NextResponse.json({ error: 'Coach Winnie not found' }, { status: 404 });
    }

    const results: Array<{ studentName: string; status: string; date?: string }> = [];

    for (const entry of entries) {
      const student = await findStudentByName(entry.studentName);
      if (!student) {
        results.push({ studentName: entry.studentName, status: 'STUDENT_NOT_FOUND' });
        continue;
      }

      const isoDate = rocToIso(entry.rocDate);
      const title = `${entry.studentName} - ${isoDate}`;
      const paidAmount = entry.purchasedHours * entry.pricePerHour;

      if (dryRun) {
        results.push({
          studentName: entry.studentName,
          status: 'DRY_RUN',
          date: isoDate,
        });
        continue;
      }

      const notion = getNotionClient();
      await notion.pages.create({
        parent: { database_id: getEnv().NOTION_PAYMENTS_DB_ID },
        properties: {
          [PAYMENT_PROPS.TITLE]: {
            title: [{ type: 'text', text: { content: title } }],
          },
          [PAYMENT_PROPS.STUDENT]: {
            relation: [{ id: student.id }],
          },
          [PAYMENT_PROPS.COACH]: {
            relation: [{ id: coach.id }],
          },
          [PAYMENT_PROPS.PURCHASED_HOURS]: {
            number: entry.purchasedHours,
          },
          [PAYMENT_PROPS.PRICE_PER_HOUR]: {
            number: entry.pricePerHour,
          },
          [PAYMENT_PROPS.PAID_AMOUNT]: {
            number: paidAmount,
          },
          [PAYMENT_PROPS.STATUS]: {
            select: { name: '已繳費' },
          },
          [PAYMENT_PROPS.CREATED_AT]: {
            date: { start: isoDate },
          },
        } as Parameters<typeof notion.pages.create>[0]['properties'],
      });

      // Rate limit: wait 350ms between API calls
      await new Promise((r) => setTimeout(r, 350));

      results.push({
        studentName: entry.studentName,
        status: 'CREATED',
        date: isoDate,
      });
    }

    return NextResponse.json({
      dryRun,
      coach: coach.name,
      total: entries.length,
      results,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
