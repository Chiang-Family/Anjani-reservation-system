import { NextResponse } from 'next/server';
import { getAllStudents } from '@/lib/notion/students';
import { getPaymentsByStudent } from '@/lib/notion/payments';
import { getNotionClient } from '@/lib/notion/client';
import { STUDENT_PROPS } from '@/lib/notion/types';

/**
 * 一次性遷移：從繳費紀錄的 pricePerHour 填入學員的「單堂費用」
 * 已有單堂費用的學員會跳過
 *
 * GET /api/migrate-payment-type?dryRun=true  → 預覽（不寫入）
 * GET /api/migrate-payment-type              → 實際執行
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  const students = await getAllStudents();
  const results: Array<{
    name: string;
    id: string;
    perSessionFee: number;
  }> = [];
  const skipped: string[] = [];

  for (const student of students) {
    if (student.perSessionFee) {
      skipped.push(student.name);
      continue;
    }

    const payments = await getPaymentsByStudent(student.id);
    if (payments.length === 0) continue;

    const fee = payments[0].pricePerHour; // 最新一筆的每小時單價
    if (!fee) continue;

    results.push({ name: student.name, id: student.id, perSessionFee: fee });

    if (!dryRun) {
      const notion = getNotionClient();
      await notion.pages.update({
        page_id: student.id,
        properties: {
          [STUDENT_PROPS.PER_SESSION_FEE]: { number: fee },
        } as Parameters<typeof notion.pages.update>[0]['properties'],
      });
    }
  }

  return NextResponse.json({
    dryRun,
    totalStudents: students.length,
    updated: results.length,
    skipped: skipped.length,
    skippedNames: skipped,
    details: results,
  });
}
