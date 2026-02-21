import { getTodayEvents, getEventsForDate, getMonthEvents } from '@/lib/google/calendar';
import { findStudentByName, getStudentsByCoachId } from '@/lib/notion/students';
import type { CalendarEvent } from '@/types';

/** 從今日事件中比對學員名稱 */
export async function findStudentEventToday(studentName: string): Promise<CalendarEvent | null> {
  const events = await getTodayEvents();
  return matchEventByName(events, studentName);
}

/** 取得某教練今天的課表（透過 Notion 學員→教練關聯比對） */
export async function getTodayEventsForCoach(coachNotionId: string): Promise<CalendarEvent[]> {
  const events = await getTodayEvents();
  return filterEventsByCoach(events, coachNotionId);
}

/** 取得某教練指定日期的課表（透過 Notion 學員→教練關聯比對） */
export async function getEventsForDateByCoach(coachNotionId: string, dateStr: string): Promise<CalendarEvent[]> {
  const events = await getEventsForDate(dateStr);
  return filterEventsByCoach(events, coachNotionId);
}

/** 從指定日期事件中比對學員名稱 */
export async function findStudentEventForDate(studentName: string, dateStr: string): Promise<CalendarEvent | null> {
  const events = await getEventsForDate(dateStr);
  return matchEventByName(events, studentName);
}

/** 取得某教練指定月份的課表（透過 Notion 學員→教練關聯比對） */
export async function getMonthEventsForCoach(
  coachNotionId: string,
  year: number,
  month: number
): Promise<CalendarEvent[]> {
  const events = await getMonthEvents(year, month);
  return filterEventsByCoach(events, coachNotionId);
}

/** 用 Notion 學員的所屬教練關聯來篩選事件 */
async function filterEventsByCoach(events: CalendarEvent[], coachNotionId: string): Promise<CalendarEvent[]> {
  // 取得該教練的所有學員名稱
  const students = await getStudentsByCoachId(coachNotionId);
  const studentNames = new Set(students.map((s) => s.name));

  return events.filter((event) => {
    const summary = event.summary.trim();
    for (const name of studentNames) {
      if (summary === name) {
        return true;
      }
    }
    return false;
  });
}

function matchEventByName(events: CalendarEvent[], studentName: string): CalendarEvent | null {
  for (const event of events) {
    if (event.summary.trim() === studentName) {
      return event;
    }
  }
  return null;
}
