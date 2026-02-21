import { findCoachByLineId } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getPaymentsByCoachStudents, getLatestPaymentByStudent } from '@/lib/notion/payments';
import { getStudentHoursSummary } from '@/lib/notion/hours';
import { getCheckinsByDateRange } from '@/lib/notion/checkins';
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
  checkedInClasses: number;
  estimatedRevenue: number;
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
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthStart = `${monthPrefix}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`;

  // Query calendar, payments, students, checkins in parallel
  const [events, payments, students, allMonthCheckins] = await Promise.all([
    getMonthEventsForCoach(coach.id, year, month),
    getPaymentsByCoachStudents(coach.id),
    getStudentsByCoachId(coach.id),
    getCheckinsByDateRange(monthStart, monthEnd),
  ]);

  const monthCheckins = allMonthCheckins.filter(c => c.coachId === coach.id);

  // --- 堂數 ---
  const scheduledClasses = events.length;
  const checkedInClasses = monthCheckins.length;

  // --- Build studentName → latest pricePerHour map (payments sorted by createdAt desc) ---
  const priceMap = new Map<string, number>();
  for (const p of payments) {
    if (!priceMap.has(p.studentName)) {
      priceMap.set(p.studentName, p.pricePerHour);
    }
  }

  // --- 預計執行收入: all scheduled events × student hourly rate ---
  let estimatedRevenue = 0;
  for (const event of events) {
    const [startH, startM] = event.startTime.split(':').map(Number);
    const [endH, endM] = event.endTime.split(':').map(Number);
    const durationHours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
    const price = priceMap.get(event.summary.trim()) ?? 0;
    estimatedRevenue += durationHours * price;
  }
  estimatedRevenue = Math.round(estimatedRevenue);

  // --- 已執行收入: checked-in classes × student hourly rate ---
  let executedRevenue = 0;
  for (const checkin of monthCheckins) {
    const price = priceMap.get(checkin.studentName ?? '') ?? 0;
    executedRevenue += (checkin.durationMinutes / 60) * price;
  }
  executedRevenue = Math.round(executedRevenue);

  // --- 實際收款: this month's payments only ---
  let collectedAmount = 0;
  for (const payment of payments) {
    if (payment.createdAt.startsWith(monthPrefix)) {
      collectedAmount += payment.paidAmount;
    }
  }

  // --- 待收款: students who need renewal ---
  // Build per-student scheduled hours from events
  const studentScheduledHours = new Map<string, number>();
  for (const event of events) {
    const name = event.summary.trim();
    const [startH, startM] = event.startTime.split(':').map(Number);
    const [endH, endM] = event.endTime.split(':').map(Number);
    const hours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
    studentScheduledHours.set(name, (studentScheduledHours.get(name) ?? 0) + hours);
  }

  // Build per-student this month's paid amount
  const studentMonthPaid = new Map<string, number>();
  for (const payment of payments) {
    if (payment.createdAt.startsWith(monthPrefix)) {
      studentMonthPaid.set(
        payment.studentName,
        (studentMonthPaid.get(payment.studentName) ?? 0) + payment.paidAmount,
      );
    }
  }

  const summaries = await pMap(students, s => getStudentHoursSummary(s.id));

  // Find students who need renewal: scheduledHours > remainingHours
  const needsRenewal: { student: typeof students[0]; summary: typeof summaries[0] }[] = [];
  for (let i = 0; i < students.length; i++) {
    const scheduled = studentScheduledHours.get(students[i].name) ?? 0;
    if (scheduled > summaries[i].remainingHours) {
      needsRenewal.push({ student: students[i], summary: summaries[i] });
    }
  }

  const latestPayments = await pMap(needsRenewal, c => getLatestPaymentByStudent(c.student.id));

  let pendingAmount = 0;
  const renewalStudents: RenewalStudent[] = needsRenewal.map((c, i) => {
    const latestPayment = latestPayments[i];
    const expectedHours = latestPayment?.purchasedHours || c.summary.purchasedHours;
    const expectedPrice = latestPayment?.pricePerHour || 0;
    const expectedAmount = expectedHours * expectedPrice;
    const paidThisMonth = studentMonthPaid.get(c.student.name) ?? 0;
    pendingAmount += Math.max(0, expectedAmount - paidThisMonth);
    return {
      name: c.student.name,
      remainingHours: c.summary.remainingHours,
      expectedRenewalHours: expectedHours,
      expectedRenewalAmount: expectedAmount,
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
    checkedInClasses,
    estimatedRevenue,
    executedRevenue,
    collectedAmount,
    pendingAmount,
    renewalForecast,
  };
}
