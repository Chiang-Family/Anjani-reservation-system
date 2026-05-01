import { NextRequest, NextResponse } from 'next/server';
import { findCoachByName } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getCheckinsByCoach } from '@/lib/notion/checkins';
import { getEventsForDateRange } from '@/lib/google/calendar';
import { parseEventSummary } from '@/lib/utils/event';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const coachName = searchParams.get('coach');
  const yearStr = searchParams.get('year');
  const monthStr = searchParams.get('month');

  if (!coachName || !yearStr || !monthStr) {
    return NextResponse.json({ error: 'Missing params: coach, year, month' }, { status: 400 });
  }

  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthStart = `${monthPrefix}-01`;
  const monthEnd = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`;

  const coach = await findCoachByName(coachName);
  if (!coach) return NextResponse.json({ error: `Coach not found: ${coachName}` }, { status: 404 });

  const [students, allCheckins, allEvents] = await Promise.all([
    getStudentsByCoachId(coach.id),
    getCheckinsByCoach(coach.id),
    getEventsForDateRange(monthStart, monthEnd),
  ]);

  const studentNames = new Set(students.map(s => s.name));
  const studentById = new Map(students.map(s => [s.id, s]));

  // 本月打卡紀錄
  const monthCheckins = allCheckins.filter(c => c.classDate.startsWith(monthPrefix));

  // 本月行事曆事件（匹配學員名稱）
  const monthEvents = allEvents.filter(e => {
    const { studentName } = parseEventSummary(e.summary);
    return studentNames.has(studentName);
  });

  // 建立行事曆 key: studentName:date
  const eventKeys = new Set(
    monthEvents.map(e => {
      const { studentName } = parseEventSummary(e.summary);
      return `${studentName}:${e.date}`;
    })
  );

  // 找出打卡沒有對應行事曆事件的紀錄
  const orphanCheckins = monthCheckins
    .map(c => {
      const student = studentById.get(c.studentId);
      const studentName = student?.name ?? `(unknown: ${c.studentId})`;
      const key = `${studentName}:${c.classDate}`;
      return { ...c, studentName, hasCalendarEvent: eventKeys.has(key) };
    })
    .filter(c => !c.hasCalendarEvent);

  // 找出行事曆事件沒有對應打卡的紀錄（今天以前）
  const today = new Date().toISOString().slice(0, 10);
  const checkinKeys = new Set(
    monthCheckins.map(c => {
      const student = studentById.get(c.studentId);
      return `${student?.name ?? ''}:${c.classDate}`;
    })
  );
  const orphanEvents = monthEvents
    .filter(e => e.date <= today)
    .map(e => {
      const { studentName, isMassage } = parseEventSummary(e.summary);
      const key = `${studentName}:${e.date}`;
      return { date: e.date, studentName, isMassage, time: `${e.startTime}-${e.endTime}`, hasCheckin: checkinKeys.has(key) };
    })
    .filter(e => !e.hasCheckin);

  return NextResponse.json({
    coach: coach.name,
    month: `${year}年${month}月`,
    scheduledClasses: monthEvents.length,
    checkedInClasses: monthCheckins.length,
    diff: monthCheckins.length - monthEvents.length,
    // 打卡有、行事曆沒有
    checkinsWithoutEvent: orphanCheckins.map(c => ({
      date: c.classDate,
      studentName: c.studentName,
      timeSlot: c.classTimeSlot,
      isMassage: c.isMassage,
      checkinId: c.id,
    })),
    // 行事曆有、打卡沒有（過去日期）
    eventsWithoutCheckin: orphanEvents.map(e => ({
      date: e.date,
      studentName: e.studentName,
      time: e.time,
      isMassage: e.isMassage,
    })),
  });
}
