import { NextResponse } from 'next/server';
import { findStudentByName } from '@/lib/notion/students';
import { getPaymentsByStudent } from '@/lib/notion/payments';
import { getNotionClient } from '@/lib/notion/client';

/**
 * 查詢/刪除學員繳費紀錄
 * GET /api/debug-payments?student=林香吟
 * GET /api/debug-payments?student=林香吟&delete=id1,id2
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('student') || '林香吟';
  const deleteIds = url.searchParams.get('delete');

  try {
    const student = await findStudentByName(name);
    if (!student) {
      return NextResponse.json({ success: false, error: `找不到學員 ${name}` }, { status: 404 });
    }

    if (deleteIds) {
      const notion = getNotionClient();
      const ids = deleteIds.split(',');
      const results = [];
      for (const id of ids) {
        await notion.pages.update({ page_id: id.trim(), archived: true });
        results.push({ id: id.trim(), status: 'archived' });
        await new Promise((r) => setTimeout(r, 350));
      }
      return NextResponse.json({ success: true, deleted: results });
    }

    const payments = await getPaymentsByStudent(student.id);
    return NextResponse.json({
      success: true,
      studentId: student.id,
      count: payments.length,
      payments: payments.map(p => ({
        id: p.id,
        date: p.createdAt,
        hours: p.purchasedHours,
        price: p.pricePerHour,
        paidAmount: p.paidAmount,
        totalAmount: p.totalAmount,
        status: p.status,
      })),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
