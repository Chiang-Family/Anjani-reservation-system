import { getTodayEvents, getEventsForDate } from '@/lib/google/calendar';
import type { CalendarEvent } from '@/types';

/** 從今日事件中比對學員名稱 */
export async function findStudentEventToday(studentName: string): Promise<CalendarEvent | null> {
  const events = await getTodayEvents();
  return matchEventByName(events, studentName);
}

/** 從指定日期事件中比對學員名稱 */
export async function findStudentEventForDate(studentName: string, dateStr: string): Promise<CalendarEvent | null> {
  const events = await getEventsForDate(dateStr);
  return matchEventByName(events, studentName);
}

function matchEventByName(events: CalendarEvent[], studentName: string): CalendarEvent | null {
  for (const event of events) {
    if (event.summary.trim() === studentName) {
      return event;
    }
  }
  return null;
}
