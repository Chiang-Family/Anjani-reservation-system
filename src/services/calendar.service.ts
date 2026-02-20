import { getTodayEvents, getMonthEvents, getEventsByColorId } from '@/lib/google/calendar';
import type { CalendarEvent } from '@/types';

/** 從今日事件中比對學員名稱 */
export async function findStudentEventToday(studentName: string): Promise<CalendarEvent | null> {
  const events = await getTodayEvents();
  return matchEventByName(events, studentName);
}

/** 取得某教練今天的課表 */
export async function getTodayEventsForCoach(calendarColorId: number): Promise<CalendarEvent[]> {
  const events = await getTodayEvents();
  return getEventsByColorId(events, calendarColorId);
}

/** 取得某教練指定月份的課表 */
export async function getMonthEventsForCoach(
  calendarColorId: number,
  year: number,
  month: number
): Promise<CalendarEvent[]> {
  const events = await getMonthEvents(year, month);
  return getEventsByColorId(events, calendarColorId);
}

/** 模糊比對：event.summary 包含學員名，或學員名包含 event.summary */
function matchEventByName(events: CalendarEvent[], studentName: string): CalendarEvent | null {
  for (const event of events) {
    const summary = event.summary.trim();
    if (summary === studentName || summary.includes(studentName) || studentName.includes(summary)) {
      return event;
    }
  }
  return null;
}
