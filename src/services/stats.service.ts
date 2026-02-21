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
  executedRevenue: number;
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

  // Build studentName → latest pricePerHour map (payments are sorted by createdAt desc)
  const priceMap = new Map<string, number>();
  for (const p of payments) {
    if (!priceMap.has(p.studentName)) {
      priceMap.set(p.studentName, p.pricePerHour);
    }
  }

  // Executed revenue: each event's duration × student's hourly rate
  let executedRevenue = 0;
  for (const event of events) {
    const [startH, startM] = event.startTime.split(':').map(Number);
    const [endH, endM] = event.endTime.split(':').map(Number);
    const durationHours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
    const price = priceMap.get(event.summary.trim()) ?? 0;
    executedRevenue += durationHours * price;
  }
  executedRevenue = Math.round(executedRevenue);

  // Collected amount: only this month's payments
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  let collectedAmount = 0;
  for (const payment of payments) {
    if (payment.createdAt.startsWith(monthPrefix)) {
      collectedAmount += payment.paidAmount;
    }
  }

  // Pending amount: executed revenue minus collected
  const pendingAmount = Math.max(0, executedRevenue - collectedAmount);
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
    executedRevenue,
    collectedAmount,
    pendingAmount,
    renewalForecast,
  };
}
