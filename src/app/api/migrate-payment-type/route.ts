import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron/auth';
import { getAllStudents } from '@/lib/notion/students';
import { getPaymentsByStudent } from '@/lib/notion/payments';
import { getNotionClient } from '@/lib/notion/client';
import { STUDENT_PROPS } from '@/lib/notion/types';

/**
 * 一次性遷移：為已標為「單堂」的學員，從繳費紀錄的 pricePerHour 填入「單堂費用」
 *
 * GET /api/migrate-payment-type?dryRun=true  → 預覽（不寫入）
 * GET /api/migrate-payment-type              → 實際執行
 */
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  const students = await getAllStudents();
  const results: Array<{
    name: string;
    id: string;
    perSessionFee: number;
  }> = [];

  for (const student of students) {
    if (student.paymentType !== '單堂' || student.perSessionFee) continue;

    const payments = await getPaymentsByStudent(student.id);
    if (payments.length === 0) continue;

    const fee = payments[0].pricePerHour; // 最新一筆的每小時單價

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
    details: results,
  });
}
