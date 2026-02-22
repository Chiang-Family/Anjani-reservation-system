import { NextResponse } from 'next/server';
import { findStudentByName } from '@/lib/notion/students';
import { getPaymentsByDate, getPaymentsByStudent } from '@/lib/notion/payments';
import { todayDateString } from '@/lib/utils/date';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get('name') ?? '蔡宜庭';
  const date = url.searchParams.get('date') ?? todayDateString();

  const student = await findStudentByName(name);
  if (!student) return NextResponse.json({ error: 'Student not found' });

  const [paymentsOnDate, allPayments] = await Promise.all([
    getPaymentsByDate(date),
    getPaymentsByStudent(student.id),
  ]);

  const studentPaymentsOnDate = paymentsOnDate.filter(p => p.studentId === student.id);

  return NextResponse.json({
    student,
    date,
    studentPaymentsOnDate,
    recentPayments: allPayments.slice(0, 5),
  });
}
