import { findCoachByLineId } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getPaymentsByCoachStudents } from '@/lib/notion/payments';
import { assignCheckinsToBuckets, computeSummaryFromBuckets } from '@/lib/notion/hours';
import { getCheckinsByDateRange, getCheckinsByCoach } from '@/lib/notion/checkins';
import { getMonthEvents, getEventsForDateRange } from '@/lib/google/calendar';
import { nowTaipei, computeDurationMinutes, todayDateString } from '@/lib/utils/date';
import { format, addMonths } from 'date-fns';
import type { CalendarEvent, CheckinRecord, PaymentRecord } from '@/types';

export interface RenewalStudent {
  name: string;
  remainingHours: number;
  expectedRenewalHours: number;
  expectedRenewalAmount: number;
  paidAmount: number;
  expiryDate: string;           // yyyy-MM-dd (date hours run out / last class)
  dueDate: string;              // yyyy-MM-dd (next class after expiry / when to pay)
  renewedDate: string | null;   // yyyy-MM-dd (payment date, null if not yet)
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
 * Filter calendar events by student names (in-memory, no Notion call)
 */
function filterEventsByStudentNames(events: CalendarEvent[], studentNames: Set<string>): CalendarEvent[] {
  return events.filter((event) => {
    const summary = event.summary.trim();
    for (const name of studentNames) {
      if (summary === name || summary.includes(name) || name.includes(summary)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Predict when a student's remaining hours will be exhausted
 * based on future calendar events.
 */
function predictRenewalDate(
  remainingHours: number,
  futureEvents: CalendarEvent[],
): { expiryDate: string; renewalDate: string; isEstimated: boolean } | null {
  // No future events → skip student
  if (futureEvents.length === 0) return null;

  // Already exhausted → renewal is next future event
  if (remainingHours <= 0) {
    return { expiryDate: futureEvents[0].date, renewalDate: futureEvents[0].date, isEstimated: false };
  }

  // Accumulate event durations chronologically
  let hoursLeft = remainingHours;
  for (let i = 0; i < futureEvents.length; i++) {
    const event = futureEvents[i];
    const duration = computeDurationMinutes(event.startTime, event.endTime) / 60;
    hoursLeft -= duration;

    if (hoursLeft <= 0) {
      const expiryDate = event.date;
      const renewalDate = i + 1 < futureEvents.length
        ? futureEvents[i + 1].date
        : event.date;
      return { expiryDate, renewalDate, isEstimated: false };
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
): { expiryDate: string; renewalDate: string; isEstimated: boolean } | null {
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
      return { expiryDate: renewalDate, renewalDate, isEstimated: true };
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
  return { expiryDate: renewalDate, renewalDate, isEstimated: true };
}

/**
 * Fallback estimation using past checkin intervals when calendar is sparse.
 * Uses pre-fetched checkins instead of querying per student.
 */
function estimateFromCheckins(
  studentCheckins: CheckinRecord[],
  remainingHours: number,
): { expiryDate: string; renewalDate: string; isEstimated: boolean } | null {
  if (studentCheckins.length < 2) return null;

  // Sort asc by classDate
  const sorted = [...studentCheckins].sort((a, b) => a.classDate.localeCompare(b.classDate));
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
  const renewalDate = format(now, 'yyyy-MM-dd');
  return { expiryDate: renewalDate, renewalDate, isEstimated: true };
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

  // ====== Batch load ALL data in parallel (fixed number of API calls) ======
  const [allMonthEvents, allFutureEvents, payments, students, allMonthCheckins, allCoachCheckins] = await Promise.all([
    getMonthEvents(year, month),                    // 1 Google Calendar call
    getEventsForDateRange(today, futureEnd),         // 1 Google Calendar call
    getPaymentsByCoachStudents(coach.id),            // 1 Notion call
    getStudentsByCoachId(coach.id),                  // 1 Notion call
    getCheckinsByDateRange(monthStart, monthEnd),    // 1 Notion call
    getCheckinsByCoach(coach.id),                    // 1 Notion call (replaces N per-student calls)
  ]);

  // ====== In-memory filtering (replaces filterEventsByCoach's Notion calls) ======
  const studentNames = new Set(students.map(s => s.name));
  const events = filterEventsByStudentNames(allMonthEvents, studentNames);
  const futureEvents = filterEventsByStudentNames(allFutureEvents, studentNames);
  const monthCheckins = allMonthCheckins.filter(c => c.coachId === coach.id);

  // ====== Group checkins by studentId (replaces per-student getCheckinsByStudent) ======
  const checkinsByStudentId = new Map<string, CheckinRecord[]>();
  for (const c of allCoachCheckins) {
    if (!checkinsByStudentId.has(c.studentId)) {
      checkinsByStudentId.set(c.studentId, []);
    }
    checkinsByStudentId.get(c.studentId)!.push(c);
  }

  // ====== Group payments by studentId (replaces per-student getPaymentsByStudent) ======
  const paymentsByStudentId = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    if (!paymentsByStudentId.has(p.studentId)) {
      paymentsByStudentId.set(p.studentId, []);
    }
    paymentsByStudentId.get(p.studentId)!.push(p);
  }

  // ====== Compute hours summary per student in-memory (replaces pMap + getStudentHoursSummary) ======
  const summaries = students.map(s => {
    const studentPayments = paymentsByStudentId.get(s.id) ?? [];
    const studentCheckins = checkinsByStudentId.get(s.id) ?? [];
    const { buckets, overflowCheckins } = assignCheckinsToBuckets(studentPayments, studentCheckins);
    return computeSummaryFromBuckets(buckets, overflowCheckins);
  });

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

  // Predict renewal for each student (all in-memory, no API calls)
  type RenewalCandidate = {
    student: typeof students[0];
    summary: typeof summaries[0];
    expiryDate: string;
    renewalDate: string;
    isEstimated: boolean;
  };
  const candidates: RenewalCandidate[] = [];

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const summary = summaries[i];
    const studentFutureEvents = futureEventsByStudent.get(student.name) ?? [];

    let prediction = predictRenewalDate(summary.remainingHours, studentFutureEvents);

    // Fallback: if calendar events insufficient, use past checkins (already loaded)
    if (!prediction && studentFutureEvents.length <= 1 && summary.remainingHours > 0) {
      const studentCheckins = checkinsByStudentId.get(student.id) ?? [];
      prediction = estimateFromCheckins(studentCheckins, summary.remainingHours);
    }

    if (prediction) {
      candidates.push({
        student,
        summary,
        expiryDate: prediction.expiryDate,
        renewalDate: prediction.renewalDate,
        isEstimated: prediction.isEstimated,
      });
    }
  }

  // Filter to students whose renewal falls in current month
  const thisMonthCandidates = candidates.filter(c =>
    c.renewalDate.startsWith(monthPrefix)
  );

  // Get latest payment per student from already-loaded payments (replaces pMap + getLatestPaymentByStudent)
  const latestPaymentByStudentId = new Map<string, PaymentRecord>();
  for (const p of payments) {
    const existing = latestPaymentByStudentId.get(p.studentId);
    if (!existing || p.createdAt > existing.createdAt) {
      latestPaymentByStudentId.set(p.studentId, p);
    }
  }

  const renewalStudents: RenewalStudent[] = thisMonthCandidates.map((c) => {
    const latestPayment = latestPaymentByStudentId.get(c.student.id);
    const expectedHours = latestPayment?.purchasedHours || c.summary.purchasedHours;
    const expectedPrice = latestPayment?.pricePerHour || 0;
    const expectedAmount = Math.round(expectedHours * expectedPrice);
    const monthInfo = monthPaymentsByStudent.get(c.student.name);
    return {
      name: c.student.name,
      remainingHours: c.summary.remainingHours,
      expectedRenewalHours: expectedHours,
      expectedRenewalAmount: expectedAmount,
      paidAmount: Math.round(monthInfo?.paid ?? 0),
      expiryDate: c.expiryDate,
      dueDate: c.renewalDate,
      renewedDate: monthInfo?.date ?? null,
      isEstimated: c.isEstimated,
    };
  });

  // Include students who already renewed this month (have payments but not in predicted list)
  const predictedNames = new Set(renewalStudents.map(s => s.name));
  const summaryByName = new Map<string, typeof summaries[0]>();
  for (let i = 0; i < students.length; i++) {
    summaryByName.set(students[i].name, summaries[i]);
  }

  // Find last checkin date per student from all coach checkins (no extra API call)
  const lastCheckinByStudent = new Map<string, string>();
  for (const c of allCoachCheckins) {
    if (c.studentName) {
      const prev = lastCheckinByStudent.get(c.studentName);
      if (!prev || c.classDate > prev) {
        lastCheckinByStudent.set(c.studentName, c.classDate);
      }
    }
  }

  const alreadyRenewedNames = [...monthPaymentsByStudent.keys()].filter(n => !predictedNames.has(n));

  for (const name of alreadyRenewedNames) {
    const info = monthPaymentsByStudent.get(name)!;
    const lastClassDate = lastCheckinByStudent.get(name) ?? info.date;
    renewalStudents.push({
      name,
      remainingHours: summaryByName.get(name)?.remainingHours ?? 0,
      expectedRenewalHours: info.hours,
      expectedRenewalAmount: Math.round(info.total),
      paidAmount: Math.round(info.paid),
      expiryDate: lastClassDate,
      dueDate: info.date,
      renewedDate: info.date,
      isEstimated: false,
    });
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
