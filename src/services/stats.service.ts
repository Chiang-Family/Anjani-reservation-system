import { findCoachByLineId } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getPaymentsByCoachStudents, getLatestPaymentByStudent } from '@/lib/notion/payments';
import { getStudentHoursSummary } from '@/lib/notion/hours';
import { getCheckinsByDateRange } from '@/lib/notion/checkins';
import { getCheckinsByStudent } from '@/lib/notion/checkins';
import { pMap } from '@/lib/utils/concurrency';
import { getMonthEventsForCoach, getFutureEventsForCoach } from './calendar.service';
import { nowTaipei, computeDurationMinutes, todayDateString } from '@/lib/utils/date';
import { format, addMonths } from 'date-fns';
import type { CalendarEvent } from '@/types';

export interface RenewalStudent {
  name: string;
  remainingHours: number;
  expectedRenewalHours: number;
  expectedRenewalAmount: number;
  paidAmount: number;
  predictedRenewalDate: string; // yyyy-MM-dd
  isEstimated: boolean;
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

/**
 * Predict when a student's remaining hours will be exhausted
 * based on future calendar events.
 */
function predictRenewalDate(
  remainingHours: number,
  futureEvents: CalendarEvent[],
): { renewalDate: string; isEstimated: boolean } | null {
  // No future events → skip student
  if (futureEvents.length === 0) return null;

  // Already exhausted → renewal is next future event
  if (remainingHours <= 0) {
    return { renewalDate: futureEvents[0].date, isEstimated: false };
  }

  // Accumulate event durations chronologically
  let hoursLeft = remainingHours;
  for (let i = 0; i < futureEvents.length; i++) {
    const event = futureEvents[i];
    const duration = computeDurationMinutes(event.startTime, event.endTime) / 60;
    hoursLeft -= duration;

    if (hoursLeft <= 0) {
      // Renewal date = next event's date, or this event's date if it's the last
      const renewalDate = i + 1 < futureEvents.length
        ? futureEvents[i + 1].date
        : event.date;
      return { renewalDate, isEstimated: false };
    }
  }

  // Not enough calendar events to exhaust hours → estimate
  return estimateRenewalDate(hoursLeft, futureEvents);
}

/**
 * Estimate renewal date when calendar events don't cover all remaining hours.
 * Uses average interval and duration from available events to extrapolate.
 */
function estimateRenewalDate(
  hoursLeft: number,
  events: CalendarEvent[],
): { renewalDate: string; isEstimated: boolean } | null {
  if (events.length < 2) {
    // Can't compute interval with < 2 events; use single event duration if available
    if (events.length === 1) {
      const dur = computeDurationMinutes(events[0].startTime, events[0].endTime) / 60;
      if (dur <= 0) return null;
      const eventsNeeded = Math.ceil(hoursLeft / dur);
      // Assume weekly interval as fallback
      const daysToAdd = eventsNeeded * 7;
      const lastDate = new Date(events[0].date + 'T00:00:00+08:00');
      lastDate.setDate(lastDate.getDate() + daysToAdd);
      const renewalDate = format(lastDate, 'yyyy-MM-dd');
      return { renewalDate, isEstimated: true };
    }
    return null;
  }

  // Average event duration
  let totalDuration = 0;
  for (const ev of events) {
    totalDuration += computeDurationMinutes(ev.startTime, ev.endTime) / 60;
  }
  const avgDuration = totalDuration / events.length;
  if (avgDuration <= 0) return null;

  // Average interval between events (in days)
  const firstDate = new Date(events[0].date + 'T00:00:00+08:00');
  const lastDate = new Date(events[events.length - 1].date + 'T00:00:00+08:00');
  const totalDays = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
  const avgInterval = totalDays / (events.length - 1);

  // How many more events needed
  const eventsNeeded = Math.ceil(hoursLeft / avgDuration);
  const daysToAdd = Math.round(eventsNeeded * avgInterval);

  const estimated = new Date(lastDate);
  estimated.setDate(estimated.getDate() + daysToAdd);
  const renewalDate = format(estimated, 'yyyy-MM-dd');
  return { renewalDate, isEstimated: true };
}

/**
 * Fallback estimation using past checkin intervals when calendar is sparse.
 */
async function estimateFromCheckins(
  studentId: string,
  remainingHours: number,
): Promise<{ renewalDate: string; isEstimated: boolean } | null> {
  const checkins = await getCheckinsByStudent(studentId);
  if (checkins.length < 2) return null;

  // checkins sorted desc by classDate; take most recent ones
  const sorted = [...checkins].sort((a, b) => a.classDate.localeCompare(b.classDate));
  const recent = sorted.slice(-10); // last 10 checkins

  // Average duration
  const avgDuration = recent.reduce((s, c) => s + c.durationMinutes, 0) / recent.length / 60;
  if (avgDuration <= 0) return null;

  // Average interval
  let totalDays = 0;
  for (let i = 1; i < recent.length; i++) {
    const d1 = new Date(recent[i - 1].classDate + 'T00:00:00+08:00');
    const d2 = new Date(recent[i].classDate + 'T00:00:00+08:00');
    totalDays += (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
  }
  const avgInterval = totalDays / (recent.length - 1);

  const eventsNeeded = Math.ceil(remainingHours / avgDuration);
  const daysToAdd = Math.round(eventsNeeded * avgInterval);

  const now = new Date(todayDateString() + 'T00:00:00+08:00');
  now.setDate(now.getDate() + daysToAdd);
  return { renewalDate: format(now, 'yyyy-MM-dd'), isEstimated: true };
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

  // Future events range: today → today + 4 months
  const today = todayDateString();
  const futureEnd = format(addMonths(now, 4), 'yyyy-MM-dd');

  // Query calendar, payments, students, checkins, future events in parallel
  const [events, payments, students, allMonthCheckins, futureEvents] = await Promise.all([
    getMonthEventsForCoach(coach.id, year, month),
    getPaymentsByCoachStudents(coach.id),
    getStudentsByCoachId(coach.id),
    getCheckinsByDateRange(monthStart, monthEnd),
    getFutureEventsForCoach(coach.id, today, futureEnd),
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
    const durationHours = computeDurationMinutes(event.startTime, event.endTime) / 60;
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

  // --- 本月繳費: group by student ---
  const monthPaymentsByStudent = new Map<string, { paid: number; total: number; hours: number; date: string }>();
  for (const payment of payments) {
    if (payment.actualDate.startsWith(monthPrefix)) {
      const prev = monthPaymentsByStudent.get(payment.studentName) ?? { paid: 0, total: 0, hours: 0, date: '' };
      monthPaymentsByStudent.set(payment.studentName, {
        paid: prev.paid + payment.paidAmount,
        total: prev.total + payment.totalAmount,
        hours: prev.hours + payment.purchasedHours,
        date: payment.actualDate > prev.date ? payment.actualDate : prev.date,
      });
    }
  }

  // --- 待收款: calendar-based renewal prediction ---
  // Group future events by student name
  const futureEventsByStudent = new Map<string, CalendarEvent[]>();
  for (const event of futureEvents) {
    const name = event.summary.trim();
    if (!futureEventsByStudent.has(name)) {
      futureEventsByStudent.set(name, []);
    }
    futureEventsByStudent.get(name)!.push(event);
  }

  // Get hours summaries for all students
  const summaries = await pMap(students, s => getStudentHoursSummary(s.id));

  // Predict renewal for each student
  type RenewalCandidate = {
    student: typeof students[0];
    summary: typeof summaries[0];
    renewalDate: string;
    isEstimated: boolean;
  };
  const candidates: RenewalCandidate[] = [];

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const summary = summaries[i];
    const studentFutureEvents = futureEventsByStudent.get(student.name) ?? [];

    let prediction = predictRenewalDate(summary.remainingHours, studentFutureEvents);

    // Fallback: if calendar events insufficient and prediction is estimated or null,
    // try using past checkin data
    if (!prediction && studentFutureEvents.length <= 1 && summary.remainingHours > 0) {
      prediction = await estimateFromCheckins(student.id, summary.remainingHours);
    }

    if (prediction) {
      candidates.push({
        student,
        summary,
        renewalDate: prediction.renewalDate,
        isEstimated: prediction.isEstimated,
      });
    }
  }

  // Filter to students whose renewal falls in current month
  const thisMonthCandidates = candidates.filter(c =>
    c.renewalDate.startsWith(monthPrefix)
  );

  // Get latest payment for this-month candidates
  const latestPayments = await pMap(
    thisMonthCandidates,
    c => getLatestPaymentByStudent(c.student.id)
  );

  const renewalStudents: RenewalStudent[] = thisMonthCandidates.map((c, i) => {
    const latestPayment = latestPayments[i];
    const expectedHours = latestPayment?.purchasedHours || c.summary.purchasedHours;
    const expectedPrice = latestPayment?.pricePerHour || 0;
    const expectedAmount = Math.round(expectedHours * expectedPrice);
    const paid = monthPaymentsByStudent.get(c.student.name)?.paid ?? 0;
    return {
      name: c.student.name,
      remainingHours: c.summary.remainingHours,
      expectedRenewalHours: expectedHours,
      expectedRenewalAmount: expectedAmount,
      paidAmount: Math.round(paid),
      predictedRenewalDate: c.renewalDate,
      isEstimated: c.isEstimated,
    };
  });

  // Include students who already renewed this month (have payments but not in predicted list)
  const predictedNames = new Set(renewalStudents.map(s => s.name));
  const summaryByName = new Map<string, typeof summaries[0]>();
  for (let i = 0; i < students.length; i++) {
    summaryByName.set(students[i].name, summaries[i]);
  }
  for (const [name, info] of monthPaymentsByStudent) {
    if (!predictedNames.has(name)) {
      renewalStudents.push({
        name,
        remainingHours: summaryByName.get(name)?.remainingHours ?? 0,
        expectedRenewalHours: info.hours,
        expectedRenewalAmount: Math.round(info.total),
        paidAmount: Math.round(info.paid),
        predictedRenewalDate: info.date,
        isEstimated: false,
      });
    }
  }

  // Sort: unpaid first, then partial, then fully paid
  renewalStudents.sort((a, b) => {
    const ratioA = a.paidAmount / (a.expectedRenewalAmount || 1);
    const ratioB = b.paidAmount / (b.expectedRenewalAmount || 1);
    return ratioA - ratioB;
  });

  const renewalForecast: RenewalForecast = {
    studentCount: renewalStudents.length,
    expectedAmount: renewalStudents.reduce((sum, s) => sum + s.expectedRenewalAmount, 0),
    students: renewalStudents,
  };

  // 實際收款: from renewal students only (ensures 續約總額 = 實際收款 + 待收款)
  let collectedAmount = 0;
  for (const s of renewalStudents) {
    collectedAmount += monthPaymentsByStudent.get(s.name)?.paid ?? 0;
  }
  collectedAmount = Math.round(collectedAmount);

  // 待收款: per renewal student (expected - paid)
  const pendingAmount = Math.round(
    renewalStudents.reduce((sum, s) => {
      const paid = monthPaymentsByStudent.get(s.name)?.paid ?? 0;
      return sum + Math.max(0, s.expectedRenewalAmount - paid);
    }, 0)
  );

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
