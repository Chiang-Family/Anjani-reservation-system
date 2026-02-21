import { google } from 'googleapis';
import { getEnv } from '@/lib/config/env';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { CalendarEvent } from '@/types';

const TZ = 'Asia/Taipei';

function getCalendarClient() {
  const env = getEnv();
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
  return google.calendar({ version: 'v3', auth });
}

function toCalendarEvent(event: {
  id?: string | null;
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  colorId?: string | null;
}): CalendarEvent | null {
  const startStr = event.start?.dateTime || event.start?.date;
  const endStr = event.end?.dateTime || event.end?.date;
  if (!startStr || !endStr || !event.summary) return null;

  const startDate = toZonedTime(new Date(startStr), TZ);
  const endDate = toZonedTime(new Date(endStr), TZ);

  return {
    id: event.id || '',
    summary: event.summary.trim(),
    start: startStr,
    end: endStr,
    colorId: event.colorId || undefined,
    date: format(startDate, 'yyyy-MM-dd'),
    startTime: format(startDate, 'HH:mm'),
    endTime: format(endDate, 'HH:mm'),
  };
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient();
  const env = getEnv();

  // Use ISO 8601 with +08:00 offset directly — timezone-safe on any server
  const now = toZonedTime(new Date(), TZ);
  const todayStr = format(now, 'yyyy-MM-dd');
  const timeMin = `${todayStr}T00:00:00+08:00`;
  const timeMax = `${todayStr}T23:59:59+08:00`;

  console.log(`[Calendar] getTodayEvents: ${timeMin} ~ ${timeMax}`);

  const res = await calendar.events.list({
    calendarId: env.GOOGLE_CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const rawItems = res.data.items || [];
  console.log(`[Calendar] Found ${rawItems.length} raw events`);

  const events: CalendarEvent[] = [];
  for (const item of rawItems) {
    console.log(`[Calendar] Event: "${item.summary}" colorId=${item.colorId} start=${item.start?.dateTime}`);
    const ev = toCalendarEvent(item);
    if (ev) events.push(ev);
  }
  return events;
}

export async function getEventsForDate(dateStr: string): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient();
  const env = getEnv();

  const timeMin = `${dateStr}T00:00:00+08:00`;
  const timeMax = `${dateStr}T23:59:59+08:00`;

  const res = await calendar.events.list({
    calendarId: env.GOOGLE_CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events: CalendarEvent[] = [];
  for (const item of res.data.items || []) {
    const ev = toCalendarEvent(item);
    if (ev) events.push(ev);
  }
  return events;
}

export async function getMonthEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient();
  const env = getEnv();

  const startDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const timeMin = `${startDay}T00:00:00+08:00`;
  const timeMax = `${endDay}T23:59:59+08:00`;

  const events: CalendarEvent[] = [];
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

    for (const item of res.data.items || []) {
      const ev = toCalendarEvent(item);
      if (ev) events.push(ev);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

export async function getEventsForDateRange(fromDate: string, toDate: string): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient();
  const env = getEnv();

  const timeMin = `${fromDate}T00:00:00+08:00`;
  const timeMax = `${toDate}T23:59:59+08:00`;

  const events: CalendarEvent[] = [];
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

    for (const item of res.data.items || []) {
      const ev = toCalendarEvent(item);
      if (ev) events.push(ev);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

export function getEventsByColorId(events: CalendarEvent[], colorId: number): CalendarEvent[] {
  const filtered = events.filter((e) => e.colorId === String(colorId));
  console.log(`[Calendar] Filter by colorId=${colorId}: ${filtered.length}/${events.length} events matched`);
  return filtered;
}
