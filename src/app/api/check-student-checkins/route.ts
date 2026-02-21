import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';
import { getNotionClient } from '@/lib/notion/client';
import { getEnv } from '@/lib/config/env';
import { findStudentByName } from '@/lib/notion/students';
import { getCheckinsByStudent } from '@/lib/notion/checkins';

const TZ = 'Asia/Taipei';

/**
 * 檢查學員的打卡紀錄是否與行事曆完全匹配
 *
 * GET  /api/check-student-checkins?name=洪上祐          → dry run
 * POST /api/check-student-checkins?name=洪上祐&run=true → 刪除不匹配的紀錄
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: '請提供 name 參數' }, { status: 400 });
  }

  const result = await analyzeStudent(name);
  return NextResponse.json({ mode: 'dry-run', ...result });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  if (!name || url.searchParams.get('run') !== 'true') {
    return NextResponse.json({ error: '請提供 name 及 ?run=true' }, { status: 400 });
  }

  const result = await analyzeStudent(name);
  const notion = getNotionClient();

  let deleted = 0;
  for (const r of result.toDelete) {
    await notion.pages.update({ page_id: r.checkinId, archived: true });
    deleted++;
  }

  return NextResponse.json({ mode: 'executed', deleted, details: result.toDelete });
}

async function analyzeStudent(name: string) {
  const env = getEnv();
  const student = await findStudentByName(name);
  if (!student) {
    return { error: '找不到學員', checkins: [], calendarEvents: [], toDelete: [] };
  }

  const checkins = await getCheckinsByStudent(student.id);

  // Get calendar events covering the full checkin date range
  const dates = checkins.map(c => c.classDate).filter(Boolean).sort();
  if (dates.length === 0) {
    return { studentName: name, checkins: [], calendarEvents: [], toDelete: [] };
  }

  const from = dates[0];
  const to = dates[dates.length - 1];

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
      timeMin: `${from}T00:00:00+08:00`,
      timeMax: `${to}T23:59:59+08:00`,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      pageToken,
    });
    allRawEvents = allRawEvents.concat(res.data.items || []);
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  // Build a set of dates where the calendar has an exact-match event for this student
  const exactMatchDates = new Set<string>();
  const fuzzyMatchDates = new Map<string, string>(); // date → calendar summary

  for (const item of allRawEvents) {
    const startStr = item.start?.dateTime || item.start?.date;
    if (!startStr || !item.summary) continue;

    const summary = item.summary.trim();
    const startDate = toZonedTime(new Date(startStr), TZ);
    const dateStr = format(startDate, 'yyyy-MM-dd');

    if (summary === name) {
      exactMatchDates.add(dateStr);
    } else if (summary.includes(name) || name.includes(summary)) {
      fuzzyMatchDates.set(dateStr, summary);
    }
  }

  const toDelete: Array<{
    checkinId: string;
    classDate: string;
    calendarSummary: string;
    reason: string;
  }> = [];

  const matched: Array<{ classDate: string; status: string }> = [];

  for (const c of checkins) {
    if (exactMatchDates.has(c.classDate)) {
      matched.push({ classDate: c.classDate, status: 'exact_match' });
    } else if (fuzzyMatchDates.has(c.classDate)) {
      toDelete.push({
        checkinId: c.id,
        classDate: c.classDate,
        calendarSummary: fuzzyMatchDates.get(c.classDate)!,
        reason: 'fuzzy_match_only',
      });
    } else {
      matched.push({ classDate: c.classDate, status: 'no_calendar_event' });
    }
  }

  return {
    studentName: name,
    totalCheckins: checkins.length,
    exactMatches: matched.filter(m => m.status === 'exact_match').length,
    toDeleteCount: toDelete.length,
    matched,
    toDelete,
  };
}
