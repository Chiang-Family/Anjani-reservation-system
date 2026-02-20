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

  const now = toZonedTime(new Date(), TZ);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  // Convert Taipei time boundaries to UTC for API call
  const timeMin = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(todayEnd.getTime() - 8 * 60 * 60 * 1000).toISOString();

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

  // Month boundaries in Taipei time
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const timeMin = new Date(monthStart.getTime() - 8 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(monthEnd.getTime() - 8 * 60 * 60 * 1000).toISOString();

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

export function getEventsByColorId(events: CalendarEvent[], colorId: number): CalendarEvent[] {
  return events.filter((e) => e.colorId === String(colorId));
}
