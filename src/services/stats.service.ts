import { findCoachByLineId } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getMonthEventsForCoach } from './calendar.service';
import { nowTaipei } from '@/lib/utils/date';

export interface CoachMonthlyStats {
  coachName: string;
  year: number;
  month: number;
  scheduledClasses: number;
  totalHours: number;
  studentCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

export async function getCoachMonthlyStats(
  lineUserId: string
): Promise<CoachMonthlyStats | null> {
  const coach = await findCoachByLineId(lineUserId);
  if (!coach) return null;

  const now = nowTaipei();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Calendar events this month
  let scheduledClasses = 0;
  let totalHours = 0;

  if (coach.calendarColorId) {
    const events = await getMonthEventsForCoach(coach.calendarColorId, year, month);
    scheduledClasses = events.length;

    for (const event of events) {
      const [startH, startM] = event.startTime.split(':').map(Number);
      const [endH, endM] = event.endTime.split(':').map(Number);
      const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      totalHours += durationMinutes / 60;
    }
  }

  // Student financials
  const students = await getStudentsByCoachId(coach.id);
  let collectedAmount = 0;
  let pendingAmount = 0;

  for (const student of students) {
    const amount = student.completedClasses * student.pricePerClass;
    if (student.isPaid) {
      collectedAmount += amount;
    } else {
      pendingAmount += amount;
    }
  }

  return {
    coachName: coach.name,
    year,
    month,
    scheduledClasses,
    totalHours: Math.round(totalHours * 10) / 10,
    studentCount: students.length,
    collectedAmount,
    pendingAmount,
  };
}
