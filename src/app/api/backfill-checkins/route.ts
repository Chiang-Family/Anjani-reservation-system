import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';
import { getEnv } from '@/lib/config/env';
import { getAllStudents } from '@/lib/notion/students';
import { createCheckinRecord, findCheckinToday } from '@/lib/notion/checkins';
import type { CalendarEvent } from '@/types';

const TZ = 'Asia/Taipei';

/**
 * 一次性回填打卡紀錄 API
 * GET /api/backfill-checkins?from=2026-01-01&to=2026-02-20
 *
 * 從 Google Calendar 讀取指定日期範圍的所有事件，
 * 比對 Notion 學員姓名，自動建立打卡紀錄。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get('from') || '2026-01-01';
  const to = url.searchParams.get('to') || '2026-02-20';

  try {
    const env = getEnv();

    // 1. Get all calendar events in date range
    const auth = new google.auth.JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    const timeMin = `${from}T00:00:00+08:00`;
    const timeMax = `${to}T23:59:59+08:00`;

    // Calendar API paginates with pageToken; collect all events
    let allRawEvents: Array<{
      id?: string | null;
      summary?: string | null;
      start?: { dateTime?: string | null; date?: string | null } | null;
      end?: { dateTime?: string | null; date?: string | null } | null;
      colorId?: string | null;
    }> = [];

    let pageToken: string | undefined;
    do {
      const res = await calendar.events.list({
        calendarId: env.GOOGLE_CALENDAR_ID,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
        pageToken,
      });
      allRawEvents = allRawEvents.concat(res.data.items || []);
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    // Convert to CalendarEvent
    const events: CalendarEvent[] = [];
    for (const item of allRawEvents) {
      const startStr = item.start?.dateTime || item.start?.date;
      const endStr = item.end?.dateTime || item.end?.date;
      if (!startStr || !endStr || !item.summary) continue;

      const startDate = toZonedTime(new Date(startStr), TZ);
      const endDate = toZonedTime(new Date(endStr), TZ);

      events.push({
        id: item.id || '',
        summary: item.summary.trim(),
        start: startStr,
        end: endStr,
        colorId: item.colorId || undefined,
        date: format(startDate, 'yyyy-MM-dd'),
        startTime: format(startDate, 'HH:mm'),
        endTime: format(endDate, 'HH:mm'),
      });
    }

    // 2. Get all students from Notion
    const students = await getAllStudents();

    // 3. Match events to students and create checkin records
    const results: Array<{ date: string; student: string; status: string }> = [];
    let created = 0;
    let skipped = 0;
    let noMatch = 0;

    for (const event of events) {
      const summary = event.summary.trim();

      // Find matching student by name
      const student = students.find(
        (s) => summary === s.name || summary.includes(s.name) || s.name.includes(summary)
      );

      if (!student) {
        results.push({ date: event.date, student: summary, status: 'no_match' });
        noMatch++;
        continue;
      }

      if (!student.coachId) {
        results.push({ date: event.date, student: student.name, status: 'no_coach' });
        skipped++;
        continue;
      }

      // Check if already checked in
      const existing = await findCheckinToday(student.id, event.date);
      if (existing) {
        results.push({ date: event.date, student: student.name, status: 'already_exists' });
        skipped++;
        continue;
      }

      // Create checkin record
      const classStartTime = `${event.date}T${event.startTime}:00+08:00`;
      const classEndTime = `${event.date}T${event.endTime}:00+08:00`;
      const checkinTime = `${event.date}T${event.endTime}:00+08:00`; // Use class end time as checkin time

      await createCheckinRecord({
        studentName: student.name,
        studentId: student.id,
        coachId: student.coachId,
        classDate: event.date,
        classStartTime,
        classEndTime,
        checkinTime,
      });

      results.push({ date: event.date, student: student.name, status: 'created' });
      created++;
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalEvents: events.length,
        created,
        skipped,
        noMatch,
      },
      details: results,
    });
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
