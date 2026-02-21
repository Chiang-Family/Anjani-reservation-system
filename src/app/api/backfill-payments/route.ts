import { NextResponse } from 'next/server';
import { getNotionClient } from '@/lib/notion/client';
import { getEnv } from '@/lib/config/env';
import { PAYMENT_PROPS } from '@/lib/notion/types';
import { findStudentByName } from '@/lib/notion/students';

/**
 * 一次性建立繳費紀錄
 * GET /api/backfill-payments?student=林香吟&coach_id=xxx
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry') === '1';

  try {
    const student = await findStudentByName('林香吟');
    if (!student) {
      return NextResponse.json({ success: false, error: '找不到學員 林香吟' }, { status: 404 });
    }
    if (!student.coachId) {
      return NextResponse.json({ success: false, error: '林香吟 沒有教練' }, { status: 400 });
    }

    const entries = [
      {
        studentName: '林香吟',
        studentId: student.id,
        coachId: student.coachId,
        date: '2025-12-16',
        pricePerHour: 1300,
        purchasedHours: 4.6,
        paidAmount: 6000,
        status: '已繳費' as const,
      },
      {
        studentName: '林香吟',
        studentId: student.id,
        coachId: student.coachId,
        date: '2025-12-16',  // 同一期，用相同日期
        pricePerHour: 1300,
        purchasedHours: 0.4,
        paidAmount: 500,
        status: '已繳費' as const,
      },
    ];

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        studentId: student.id,
        coachId: student.coachId,
        entries,
        totalHours: entries.reduce((s, e) => s + e.purchasedHours, 0),
        totalAmount: entries.reduce((s, e) => s + e.paidAmount, 0),
      });
    }

    const notion = getNotionClient();
    const env = getEnv();
    const results = [];

    for (const entry of entries) {
      const title = `${entry.studentName} - ${entry.date}`;
      const properties = {
        [PAYMENT_PROPS.TITLE]: {
          title: [{ type: 'text', text: { content: title } }],
        },
        [PAYMENT_PROPS.STUDENT]: {
          relation: [{ id: entry.studentId }],
        },
        [PAYMENT_PROPS.COACH]: {
          relation: [{ id: entry.coachId }],
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

      results.push({ ...entry, result: 'created' });
      await new Promise((r) => setTimeout(r, 350));
    }

    return NextResponse.json({
      success: true,
      totalHours: entries.reduce((s, e) => s + e.purchasedHours, 0),
      totalAmount: entries.reduce((s, e) => s + e.paidAmount, 0),
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
