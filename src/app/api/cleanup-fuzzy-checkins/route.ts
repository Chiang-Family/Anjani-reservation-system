import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';
import { getNotionClient } from '@/lib/notion/client';
import { getEnv } from '@/lib/config/env';
import { getAllStudents } from '@/lib/notion/students';
import { getCheckinsByStudent } from '@/lib/notion/checkins';

const TZ = 'Asia/Taipei';

/**
 * 檢查所有學員的打卡紀錄，刪除模糊比對產生的錯誤紀錄
 *
 * GET  /api/cleanup-fuzzy-checkins          → dry run
 * POST /api/cleanup-fuzzy-checkins?run=true → 刪除
 */

interface DeleteItem {
  studentName: string;
  checkinId: string;
  classDate: string;
  calendarSummary: string;
}

async function computeFuzzyDeletions() {
  const env = getEnv();
  const students = await getAllStudents();
  const studentNames = new Set(students.map(s => s.name));

  // Collect all checkin dates to determine calendar query range
  const allCheckins: Array<{ student: typeof students[0]; checkins: Awaited<ReturnType<typeof getCheckinsByStudent>> }> = [];
  let minDate = '9999-12-31';
  let maxDate = '0000-01-01';

  for (const student of students) {
    const checkins = await getCheckinsByStudent(student.id);
    if (checkins.length === 0) continue;
    allCheckins.push({ student, checkins });
    for (const c of checkins) {
      if (c.classDate && c.classDate < minDate) minDate = c.classDate;
      if (c.classDate && c.classDate > maxDate) maxDate = c.classDate;
    }
  }

  if (allCheckins.length === 0) {
    return { toDelete: [], summary: [] };
  }

  // Fetch all calendar events in the date range
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
  const calendar = google.calendar({ version: 'v3', auth });

  let allRawEvents: Array<{
    summary?: string | null;
    start?: { dateTime?: string | null; date?: string | null } | null;
  }> = [];

  let pageToken: string | undefined;
  do {
    const res = await calendar.events.list({
      calendarId: env.GOOGLE_CALENDAR_ID,
      timeMin: `${minDate}T00:00:00+08:00`,
      timeMax: `${maxDate}T23:59:59+08:00`,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      pageToken,
    });
    allRawEvents = allRawEvents.concat(res.data.items || []);
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  // Build map: date → set of exact student name events
  // For each date, track which exact student names appear
  const dateExactNames = new Map<string, Set<string>>();
  const dateSummaries = new Map<string, Map<string, string>>(); // date → (fuzzy-matched-name → summary)

  for (const item of allRawEvents) {
    const startStr = item.start?.dateTime || item.start?.date;
    if (!startStr || !item.summary) continue;
    const summary = item.summary.trim();
    const startDate = toZonedTime(new Date(startStr), TZ);
    const dateStr = format(startDate, 'yyyy-MM-dd');

    if (studentNames.has(summary)) {
      // Exact match
      if (!dateExactNames.has(dateStr)) dateExactNames.set(dateStr, new Set());
      dateExactNames.get(dateStr)!.add(summary);
    }
  }

  // For each event, check if it fuzzy-matches a student but isn't exact
  for (const item of allRawEvents) {
    const startStr = item.start?.dateTime || item.start?.date;
    if (!startStr || !item.summary) continue;
    const summary = item.summary.trim();
    if (studentNames.has(summary)) continue; // exact match, skip

    const startDate = toZonedTime(new Date(startStr), TZ);
    const dateStr = format(startDate, 'yyyy-MM-dd');

    // Check if this summary fuzzy-matches any student
    for (const name of studentNames) {
      if (summary.includes(name) || name.includes(summary)) {
        if (!dateSummaries.has(dateStr)) dateSummaries.set(dateStr, new Map());
        dateSummaries.get(dateStr)!.set(name, summary);
      }
    }
  }

  // Find checkins that exist on dates where only fuzzy match exists (no exact match)
  const toDelete: DeleteItem[] = [];
  const summaryByStudent = new Map<string, number>();

  for (const { student, checkins } of allCheckins) {
    for (const c of checkins) {
      const exactNames = dateExactNames.get(c.classDate);
      const hasExact = exactNames?.has(student.name);
      const fuzzyMap = dateSummaries.get(c.classDate);
      const fuzzySummary = fuzzyMap?.get(student.name);

      if (!hasExact && fuzzySummary) {
        toDelete.push({
          studentName: student.name,
          checkinId: c.id,
          classDate: c.classDate,
          calendarSummary: fuzzySummary,
        });
        summaryByStudent.set(student.name, (summaryByStudent.get(student.name) ?? 0) + 1);
      }
    }
  }

  const summary = Array.from(summaryByStudent.entries()).map(([name, count]) => ({
    studentName: name,
    toDelete: count,
  }));

  return { toDelete, summary };
}

export async function GET() {
  const { toDelete, summary } = await computeFuzzyDeletions();
  return NextResponse.json({
    mode: 'dry-run',
    totalToDelete: toDelete.length,
    studentsAffected: summary.length,
    summary,
    details: toDelete,
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('run') !== 'true') {
    return NextResponse.json({ error: '請加上 ?run=true' }, { status: 400 });
  }

  const { toDelete } = await computeFuzzyDeletions();
  const notion = getNotionClient();

  let deleted = 0;
  for (const item of toDelete) {
    await notion.pages.update({ page_id: item.checkinId, archived: true });
    deleted++;
  }

  return NextResponse.json({ mode: 'executed', deleted });
}
