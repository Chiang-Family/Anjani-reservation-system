import { findCoachByLineId } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getPaymentsByCoachStudents, getLatestPaymentByStudent } from '@/lib/notion/payments';
import { getStudentHoursSummary } from '@/lib/notion/hours';
import { pMap } from '@/lib/utils/concurrency';
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

  // Query calendar, payments, students in parallel
  const [events, payments, students] = await Promise.all([
    getMonthEventsForCoach(coach.id, year, month),
    getPaymentsByCoachStudents(coach.id),
    getStudentsByCoachId(coach.id),
  ]);

  const scheduledClasses = events.length;
  let totalHours = 0;
  for (const event of events) {
    const [startH, startM] = event.startTime.split(':').map(Number);
    const [endH, endM] = event.endTime.split(':').map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    totalHours += durationMinutes / 60;
  }

  let collectedAmount = 0;
  let pendingAmount = 0;
  for (const payment of payments) {
    collectedAmount += payment.paidAmount;
    pendingAmount += payment.totalAmount - payment.paidAmount;
  }
  const monthEnd = endOfMonth(now);
  const remainingWeeks = differenceInCalendarWeeks(monthEnd, now, { weekStartsOn: 1 }) + 1;

  const summaries = await pMap(students, s => getStudentHoursSummary(s.id));

  // Find candidates needing renewal, then fetch their latest payments in parallel
  const renewalCandidates: { student: typeof students[0]; summary: typeof summaries[0] }[] = [];
  for (let i = 0; i < students.length; i++) {
    const remaining = summaries[i].remainingHours;
    if (remaining > 0 && remaining <= remainingWeeks * 1.5) {
      renewalCandidates.push({ student: students[i], summary: summaries[i] });
    }
  }

  const latestPayments = await pMap(renewalCandidates, c => getLatestPaymentByStudent(c.student.id));

  const renewalStudents: RenewalStudent[] = renewalCandidates.map((c, i) => {
    const latestPayment = latestPayments[i];
    const expectedHours = latestPayment?.purchasedHours || c.summary.purchasedHours;
    const expectedPrice = latestPayment?.pricePerHour || 0;
    return {
      name: c.student.name,
      remainingHours: c.summary.remainingHours,
      expectedRenewalHours: expectedHours,
      expectedRenewalAmount: expectedHours * expectedPrice,
    };
  });

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
