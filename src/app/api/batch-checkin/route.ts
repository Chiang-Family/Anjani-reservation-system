import { NextResponse } from 'next/server';
import { findCoachByName } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getLatestPaymentByStudent } from '@/lib/notion/payments';
import { getEventsForDateRange } from '@/lib/google/calendar';
import { createCheckinRecord, findCheckinToday } from '@/lib/notion/checkins';
import { computeDurationMinutes } from '@/lib/utils/date';
import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

function todayString(): string {
  return format(toZonedTime(new Date(), 'Asia/Taipei'), 'yyyy-MM-dd');
}

function nowIso(): string {
  return format(toZonedTime(new Date(), 'Asia/Taipei'), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('execute') !== 'true';

  try {
    const coach = await findCoachByName('Winnie');
    if (!coach) {
      return NextResponse.json({ error: 'Coach Winnie not found' }, { status: 404 });
    }

    const students = await getStudentsByCoachId(coach.id);
    const today = todayString();
    const checkinTime = nowIso();

    const allResults: Array<{
      studentName: string;
      paymentDate: string | null;
      eventsFound: number;
      checkins: Array<{ date: string; time: string; status: string }>;
    }> = [];

    for (const student of students) {
      // Get latest payment date
      const latestPayment = await getLatestPaymentByStudent(student.id);
      if (!latestPayment) {
        allResults.push({
          studentName: student.name,
          paymentDate: null,
          eventsFound: 0,
          checkins: [],
        });
        continue;
      }

      const fromDate = latestPayment.createdAt;
      // Fetch calendar events from payment date to today
      const events = await getEventsForDateRange(fromDate, today);
      const matched = events.filter((e) => e.summary.trim() === student.name);

      const checkins: Array<{ date: string; time: string; status: string }> = [];

      for (const event of matched) {
        // Check if already checked in
        const existing = await findCheckinToday(student.id, event.date);
        if (existing) {
          checkins.push({ date: event.date, time: `${event.startTime}-${event.endTime}`, status: 'ALREADY_EXISTS' });
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }

        if (dryRun) {
          checkins.push({ date: event.date, time: `${event.startTime}-${event.endTime}`, status: 'DRY_RUN' });
          continue;
        }

        const classStartTime = `${event.date}T${event.startTime}:00+08:00`;
        const classEndTime = `${event.date}T${event.endTime}:00+08:00`;

        await createCheckinRecord({
          studentName: student.name,
          studentId: student.id,
          coachId: coach.id,
          classDate: event.date,
          classStartTime,
          classEndTime,
          checkinTime,
        });

        checkins.push({ date: event.date, time: `${event.startTime}-${event.endTime}`, status: 'CREATED' });
        // Rate limit
        await new Promise((r) => setTimeout(r, 350));
      }

      allResults.push({
        studentName: student.name,
        paymentDate: fromDate,
        eventsFound: matched.length,
        checkins,
      });
    }

    const totalCreated = allResults.reduce(
      (sum, r) => sum + r.checkins.filter((c) => c.status === 'CREATED' || c.status === 'DRY_RUN').length, 0
    );

    return NextResponse.json({
      dryRun,
      coach: coach.name,
      totalStudents: students.length,
      totalCheckins: totalCreated,
      results: allResults,
    });
  } catch (error) {
    console.error('Batch checkin error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
