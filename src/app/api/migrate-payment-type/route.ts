import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron/auth';
import { getAllStudents } from '@/lib/notion/students';
import { getPaymentsByStudent } from '@/lib/notion/payments';
import { getNotionClient } from '@/lib/notion/client';
import { STUDENT_PROPS } from '@/lib/notion/types';

/**
 * 一次性遷移：根據繳費紀錄自動設定學員的「收費方式」和「單堂費用」
 * 判斷邏輯：所有繳費紀錄的 purchasedHours = 1 → 單堂學員
 * 單堂費用 = 最新一筆繳費的 pricePerHour
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
    paymentType: string;
    perSessionFee: number | null;
    paymentCount: number;
  }> = [];

  for (const student of students) {
    const payments = await getPaymentsByStudent(student.id);
    if (payments.length === 0) continue;

    const alreadyMarked = student.paymentType === '單堂';
    const allSingleSession = payments.every(p => p.purchasedHours === 1);

    if (allSingleSession || (alreadyMarked && !student.perSessionFee)) {
      // 取最新一筆的 pricePerHour 作為單堂費用
      const latestPayment = payments[0]; // already sorted desc
      const fee = latestPayment.pricePerHour;

      results.push({
        name: student.name,
        id: student.id,
        paymentType: '單堂',
        perSessionFee: fee,
        paymentCount: payments.length,
      });

      if (!dryRun) {
        const notion = getNotionClient();
        await notion.pages.update({
          page_id: student.id,
          properties: {
            [STUDENT_PROPS.PAYMENT_TYPE]: {
              select: { name: '單堂' },
            },
            [STUDENT_PROPS.PER_SESSION_FEE]: {
              number: fee,
            },
          } as Parameters<typeof notion.pages.update>[0]['properties'],
        });
      }
    }
  }

  return NextResponse.json({
    dryRun,
    totalStudents: students.length,
    perSessionStudents: results.length,
    details: results,
  });
}
