import { findCoachByLineId } from '@/lib/notion/coaches';
import { findStudentByName } from '@/lib/notion/students';
import { findCheckinToday } from '@/lib/notion/checkins';
import { getTodayEventsForCoach } from './calendar.service';
import { todayDateString } from '@/lib/utils/date';
import type { CalendarEvent } from '@/types';

export interface ScheduleItem {
  event: CalendarEvent;
  studentName: string;
  studentNotionId?: string;
  isCheckedIn: boolean;
}

export async function getCoachTodaySchedule(
  lineUserId: string
): Promise<{ items: ScheduleItem[]; coachName: string } | null> {
  const coach = await findCoachByLineId(lineUserId);
  if (!coach) return null;

  const events = await getTodayEventsForCoach(coach.id);
  const today = todayDateString();
  const items: ScheduleItem[] = [];

  for (const event of events) {
    const studentName = event.summary.trim();
    const student = await findStudentByName(studentName);
    let isCheckedIn = false;

    if (student) {
      const checkin = await findCheckinToday(student.id, today);
      if (checkin) {
        isCheckedIn = true;
      }
    }

    items.push({
      event,
      studentName,
      studentNotionId: student?.id,
      isCheckedIn,
    });
  }

  return { items, coachName: coach.name };
}
