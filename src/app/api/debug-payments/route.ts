import { NextResponse } from 'next/server';
import { findStudentByName } from '@/lib/notion/students';
import { getPaymentsByStudent } from '@/lib/notion/payments';
import { getNotionClient } from '@/lib/notion/client';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('student') || '林香吟';
  const deleteIds = url.searchParams.get('delete');
  const fixDateId = url.searchParams.get('fixDateId');
  const fixDateVal = url.searchParams.get('fixDateVal');

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

    if (fixDateId && fixDateVal) {
      await notion.pages.update({
        page_id: fixDateId,
        properties: { 'Title': { title: [{ text: { content: fixDateVal } }] } },
      });
      return NextResponse.json({ success: true, updated: { id: fixDateId, newTitle: fixDateVal } });
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
