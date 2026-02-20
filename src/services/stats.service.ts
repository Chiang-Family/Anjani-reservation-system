import { findCoachByLineId } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getPaymentsByCoachStudents, getLatestPaymentByStudent } from '@/lib/notion/payments';
import { getStudentHoursSummary } from '@/lib/notion/hours';
import { getMonthEventsForCoach } from './calendar.service';
import { nowTaipei } from '@/lib/utils/date';
import { endOfMonth, differenceInCalendarWeeks } from 'date-fns';

export interface RenewalStudent {
  name: string;
  remainingHours: number;
  expectedRenewalHours: number;
  expectedRenewalAmount: number;
}

export interface RenewalForecast {
  studentCount: number;
  expectedAmount: number;
  students: RenewalStudent[];
}

export interface CoachMonthlyStats {
  coachName: string;
  year: number;
  month: number;
  scheduledClasses: number;
  totalHours: number;
  studentCount: number;
  collectedAmount: number;
  pendingAmount: number;
  renewalForecast: RenewalForecast;
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
  const events = await getMonthEventsForCoach(coach.id, year, month);
  const scheduledClasses = events.length;

  let totalHours = 0;
  for (const event of events) {
    const [startH, startM] = event.startTime.split(':').map(Number);
    const [endH, endM] = event.endTime.split(':').map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    totalHours += durationMinutes / 60;
  }

  // Payment records for this coach's students
  const payments = await getPaymentsByCoachStudents(coach.id);
  let collectedAmount = 0;
  let pendingAmount = 0;
  for (const payment of payments) {
    collectedAmount += payment.paidAmount;
    pendingAmount += payment.totalAmount - payment.paidAmount;
  }

  // Students & renewal forecast
  const students = await getStudentsByCoachId(coach.id);
  const monthEnd = endOfMonth(now);
  const remainingWeeks = differenceInCalendarWeeks(monthEnd, now, { weekStartsOn: 1 }) + 1;

  const summaries = await Promise.all(
    students.map(s => getStudentHoursSummary(s.id))
  );

  const renewalStudents: RenewalStudent[] = [];
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const summary = summaries[i];
    const remaining = summary.remainingHours;
    if (remaining <= 0) continue;
    if (remaining <= remainingWeeks * 1.5) {
      const latestPayment = await getLatestPaymentByStudent(student.id);
      const expectedHours = latestPayment?.purchasedHours || summary.purchasedHours;
      const expectedPrice = latestPayment?.pricePerHour || 0;
      renewalStudents.push({
        name: student.name,
        remainingHours: remaining,
        expectedRenewalHours: expectedHours,
        expectedRenewalAmount: expectedHours * expectedPrice,
      });
    }
  }

  const renewalForecast: RenewalForecast = {
    studentCount: renewalStudents.length,
    expectedAmount: renewalStudents.reduce((sum, s) => sum + s.expectedRenewalAmount, 0),
    students: renewalStudents,
  };

  return {
    coachName: coach.name,
    year,
    month,
    scheduledClasses,
    totalHours: Math.round(totalHours * 10) / 10,
    studentCount: students.length,
    collectedAmount,
    pendingAmount,
    renewalForecast,
  };
}
