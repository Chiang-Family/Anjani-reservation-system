import { findCoachByLineId } from '@/lib/notion/coaches';
import { findStudentByName } from '@/lib/notion/students';
import { findCheckinToday } from '@/lib/notion/checkins';
import { getTodayEventsForCoach, getEventsForDateByCoach } from './calendar.service';
import { todayDateString } from '@/lib/utils/date';
import { pMap } from '@/lib/utils/concurrency';
import type { CalendarEvent } from '@/types';

export interface ScheduleItem {
  event: CalendarEvent;
  studentName: string;
  studentNotionId?: string;
  isCheckedIn: boolean;
}

export async function getCoachScheduleForDate(
  lineUserId: string,
  dateStr?: string
): Promise<{ items: ScheduleItem[]; coachName: string; date: string } | null> {
  const coach = await findCoachByLineId(lineUserId);
  if (!coach) return null;

  const targetDate = dateStr || todayDateString();
  const events = dateStr
    ? await getEventsForDateByCoach(coach.id, dateStr)
    : await getTodayEventsForCoach(coach.id);

  // Query all students + checkin status with limited concurrency
  const items = await pMap(
    events,
    async (event) => {
      const studentName = event.summary.trim();
      const student = await findStudentByName(studentName);
      let isCheckedIn = false;

      if (student) {
        const checkin = await findCheckinToday(student.id, targetDate);
        isCheckedIn = !!checkin;
      }

      return {
        event,
        studentName,
        studentNotionId: student?.id,
        isCheckedIn,
      } as ScheduleItem;
    }
  );

  return { items, coachName: coach.name, date: targetDate };
}
