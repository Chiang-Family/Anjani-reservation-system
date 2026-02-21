import { NextResponse } from 'next/server';
import { findStudentByName } from '@/lib/notion/students';
import { getPaymentsByStudent } from '@/lib/notion/payments';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('student') || '林香吟';
  try {
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
