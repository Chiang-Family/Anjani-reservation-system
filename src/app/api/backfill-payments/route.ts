import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { getNotionClient } from '@/lib/notion/client';
import { getEnv } from '@/lib/config/env';
import { PAYMENT_PROPS } from '@/lib/notion/types';
import { findStudentByName } from '@/lib/notion/students';
import { getAllCoaches } from '@/lib/notion/coaches';

interface PaymentEntry {
  studentName: string;
  pricePerHour: number;
  purchasedHours: number;
  date: string;        // yyyy-MM-dd
  paidAmount: number;
  status: '已繳費' | '部分繳費' | '未繳費';
}

function parseCsv(content: string, year: number, month: number): PaymentEntry[] {
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length < 5) return [];

  // Row 2 (index 1) has the date numbers in columns 5+
  const dateRow = lines[1].split(',');

  const entries: PaymentEntry[] = [];

  // Data rows start at index 4 (row 5 in 1-based)
  for (let i = 4; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const name = cols[0]?.trim();
    if (!name || name === '運動按摩') break; // Stop at footer section

    const pricePerHour = parseFloat(cols[1]) || 0;
    const purchasedHours = parseFloat(cols[2]) || 0;
    const received = parseFloat(cols[3]) || 0;

    if (pricePerHour === 0 || purchasedHours === 0) continue;

    // Find all "1V" cells in this row (columns 5+)
    const oneVDates: string[] = [];
    for (let col = 5; col < cols.length; col++) {
      const cell = cols[col]?.trim();
      if (cell === '1V') {
        const day = parseInt(dateRow[col]?.trim(), 10);
        if (!day || day < 1 || day > 31) continue;

        // Validate the date exists (e.g., Feb 29-31 invalid for non-leap year)
        const maxDay = new Date(year, month, 0).getDate();
        if (day > maxDay) continue;

        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        oneVDates.push(dateStr);
      }
    }

    if (oneVDates.length === 0) continue;

    // Distribute 已收 across payment periods chronologically
    const totalPerPeriod = pricePerHour * purchasedHours;
    let remainingReceived = received;

    for (const date of oneVDates) {
      let paidAmount = 0;
      let status: '已繳費' | '部分繳費' | '未繳費' = '未繳費';

      if (remainingReceived >= totalPerPeriod) {
        paidAmount = totalPerPeriod;
        status = '已繳費';
        remainingReceived -= totalPerPeriod;
      } else if (remainingReceived > 0) {
        paidAmount = remainingReceived;
        status = '部分繳費';
        remainingReceived = 0;
      }

      entries.push({
        studentName: name,
        pricePerHour,
        purchasedHours,
        date,
        paidAmount,
        status,
      });
    }
  }

  return entries;
}

/**
 * 一次性回填繳費紀錄 API
 * GET /api/backfill-payments
 *
 * 從 CSV 解析 1V 欄位，自動建立繳費紀錄。
 */
export async function GET() {
  try {
    // Read CSV files
    const jan = readFileSync(
      '/Users/pinhsuchiang/Downloads/2026堂數表 - 鄒京甫11501.csv',
      'utf-8'
    );
    const feb = readFileSync(
      '/Users/pinhsuchiang/Downloads/2026堂數表 - 鄒京甫11502.csv',
      'utf-8'
    );

    // Parse entries
    const janEntries = parseCsv(jan, 2026, 1);
    const febEntries = parseCsv(feb, 2026, 2);
    const allEntries = [...janEntries, ...febEntries];

    // Find coach 鄒京甫
    const coaches = await getAllCoaches();
    const coach = coaches.find((c) => c.name.includes('鄒京甫'));
    if (!coach) {
      return NextResponse.json({ success: false, error: '找不到教練 鄒京甫' }, { status: 404 });
    }

    const notion = getNotionClient();
    const env = getEnv();

    const results: Array<{
      student: string;
      date: string;
      hours: number;
      price: number;
      paid: number;
      status: string;
      result: string;
    }> = [];

    let created = 0;
    let skipped = 0;
    let notFound = 0;

    for (const entry of allEntries) {
      // Find student in Notion
      const student = await findStudentByName(entry.studentName);
      if (!student) {
        results.push({
          student: entry.studentName,
          date: entry.date,
          hours: entry.purchasedHours,
          price: entry.pricePerHour,
          paid: entry.paidAmount,
          status: entry.status,
          result: 'student_not_found',
        });
        notFound++;
        continue;
      }

      // Create payment record with custom date and paid amount
      const title = `${entry.studentName} - ${entry.date}`;
      const properties = {
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
          number: entry.paidAmount,
        },
        [PAYMENT_PROPS.STATUS]: {
          select: { name: entry.status },
        },
        [PAYMENT_PROPS.CREATED_AT]: {
          date: { start: entry.date },
        },
      } as Parameters<typeof notion.pages.create>[0]['properties'];

      await notion.pages.create({
        parent: { database_id: env.NOTION_PAYMENTS_DB_ID },
        properties,
      });

      results.push({
        student: entry.studentName,
        date: entry.date,
        hours: entry.purchasedHours,
        price: entry.pricePerHour,
        paid: entry.paidAmount,
        status: entry.status,
        result: 'created',
      });
      created++;

      // Rate limit: ~3 req/s for Notion API
      await new Promise((r) => setTimeout(r, 350));
    }

    return NextResponse.json({
      success: true,
      coach: coach.name,
      summary: { total: allEntries.length, created, skipped, notFound },
      details: results,
    });
  } catch (error) {
    console.error('Backfill payments error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
