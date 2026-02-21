import { NextResponse } from 'next/server';
import { findStudentByName } from '@/lib/notion/students';
import { getPaymentsByStudent } from '@/lib/notion/payments';
import { getNotionClient } from '@/lib/notion/client';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('student') || '林香吟';
  const deleteIds = url.searchParams.get('delete');
  const action = url.searchParams.get('action');

  try {
    const notion = getNotionClient();

    if (deleteIds) {
      const ids = deleteIds.split(',');
      const results = [];
      for (const id of ids) {
        await notion.pages.update({ page_id: id.trim(), archived: true });
        results.push({ id: id.trim(), status: 'archived' });
        await new Promise(r => setTimeout(r, 350));
      }
      return NextResponse.json({ success: true, deleted: results });
    }

    // action=fixTitle 把 $500 紀錄的標題日期改為 2025-12-16
    if (action === 'fixTitle') {
      const pageId = '30e39a35-8049-81b2-b3f2-cfd21421cdfd';
      const newTitle = '林香吟 - 2025-12-16';
      await notion.pages.update({
        page_id: pageId,
        properties: {
          '標題': { title: [{ type: 'text' as const, text: { content: newTitle } }] },
        },
      });
      return NextResponse.json({ success: true, updated: { id: pageId, newTitle } });
    }

    const student = await findStudentByName(name);
    if (!student) return NextResponse.json({ error: `找不到 ${name}` }, { status: 404 });
    const payments = await getPaymentsByStudent(student.id);
    return NextResponse.json({
      count: payments.length,
      payments: payments.map(p => ({
        id: p.id, date: p.createdAt, hours: p.purchasedHours,
        paidAmount: p.paidAmount, totalAmount: p.totalAmount,
      })),
    });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
