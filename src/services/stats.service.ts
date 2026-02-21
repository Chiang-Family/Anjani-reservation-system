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
  expiryDate: string;           // yyyy-MM-dd or '' if unknown
  dueDate: string;              // yyyy-MM-dd or '' if unknown
  renewedDate: string | null;   // yyyy-MM-dd (payment date, null if not yet)
  insufficientData: boolean;    // true when calendar data insufficient to determine dates
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
 * based on future calendar events only (no estimation/extrapolation).
 */
function predictRenewalDate(
  remainingHours: number,
  futureEvents: CalendarEvent[],
): { expiryDate: string; renewalDate: string } | null {
  // No future events → can't predict
  if (futureEvents.length === 0) return null;

  // Already exhausted → renewal is next future event
  if (remainingHours <= 0) {
    return { expiryDate: futureEvents[0].date, renewalDate: futureEvents[0].date };
  }

  // Accumulate event durations chronologically
  let hoursLeft = remainingHours;
  for (let i = 0; i < futureEvents.length; i++) {
    const event = futureEvents[i];
    const duration = computeDurationMinutes(event.startTime, event.endTime) / 60;
    hoursLeft -= duration;

    if (hoursLeft <= 0) {
      const expiryDate = event.date;
      // 續約日 = 到期日後的下一個行程
      const renewalDate = i + 1 < futureEvents.length
        ? futureEvents[i + 1].date
        : '';  // No next event scheduled
      return { expiryDate, renewalDate };
    }
  }

  // Not enough calendar events to exhaust hours → can't determine date
  return null;
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
    getCheckinsByCoach(coach.id),                    // 1 Notion call
  ]);

  // ====== In-memory filtering ======
  const studentNames = new Set(students.map(s => s.name));
  const events = filterEventsByStudentNames(allMonthEvents, studentNames);
  const futureEvents = filterEventsByStudentNames(allFutureEvents, studentNames);
  const monthCheckins = allMonthCheckins.filter(c => c.coachId === coach.id);

  // ====== Group checkins by studentId ======
  const checkinsByStudentId = new Map<string, CheckinRecord[]>();
  for (const c of allCoachCheckins) {
    if (!checkinsByStudentId.has(c.studentId)) {
      checkinsByStudentId.set(c.studentId, []);
    }
    checkinsByStudentId.get(c.studentId)!.push(c);
  }

  // ====== Group payments by studentId ======
  const paymentsByStudentId = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    if (!paymentsByStudentId.has(p.studentId)) {
      paymentsByStudentId.set(p.studentId, []);
    }
    paymentsByStudentId.get(p.studentId)!.push(p);
  }

  // ====== Compute hours summary per student in-memory ======
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

  // --- Calendar-based renewal prediction ---
  // Group future events by student name
  const futureEventsByStudent = new Map<string, CalendarEvent[]>();
  for (const event of futureEvents) {
    const name = event.summary.trim();
    if (!futureEventsByStudent.has(name)) {
      futureEventsByStudent.set(name, []);
    }
    futureEventsByStudent.get(name)!.push(event);
  }

  // Get latest payment per student from already-loaded payments
  const latestPaymentByStudentId = new Map<string, PaymentRecord>();
  for (const p of payments) {
    const existing = latestPaymentByStudentId.get(p.studentId);
    if (!existing || p.createdAt > existing.createdAt) {
      latestPaymentByStudentId.set(p.studentId, p);
    }
  }

  // Predict renewal for each student (all in-memory, no API calls)
  type RenewalCandidate = {
    student: typeof students[0];
    summary: typeof summaries[0];
    expiryDate: string;
    renewalDate: string;
  };
  const candidates: RenewalCandidate[] = [];
  const predictedStudentIds = new Set<string>();

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const summary = summaries[i];
    const studentFutureEvents = futureEventsByStudent.get(student.name) ?? [];

    const prediction = predictRenewalDate(summary.remainingHours, studentFutureEvents);

    if (prediction) {
      predictedStudentIds.add(student.id);
      candidates.push({
        student,
        summary,
        expiryDate: prediction.expiryDate,
        renewalDate: prediction.renewalDate,
      });
    }
  }

  // Filter to students whose hours expire in current month (到期日 in this month)
  const thisMonthCandidates = candidates.filter(c =>
    c.expiryDate.startsWith(monthPrefix)
  );

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
      insufficientData: false,
    };
  });

  // Include students who already renewed this month (have payments but not in predicted list)
  const predictedNames = new Set(renewalStudents.map(s => s.name));
  const summaryByName = new Map<string, typeof summaries[0]>();
  for (let i = 0; i < students.length; i++) {
    summaryByName.set(students[i].name, summaries[i]);
  }

  // Find last checkin date per student from all coach checkins
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
      insufficientData: false,
    });
  }

  // Add students with insufficient calendar data (prediction failed)
  const alreadyIncluded = new Set(renewalStudents.map(s => s.name));
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    if (predictedStudentIds.has(student.id) || alreadyIncluded.has(student.name)) continue;

    const summary = summaries[i];
    const latestPayment = latestPaymentByStudentId.get(student.id);
    if (!latestPayment) continue; // No payment history, skip

    // Only include if remaining hours ≤ latest purchased hours (likely to need renewal soon)
    if (summary.remainingHours > latestPayment.purchasedHours) continue;

    const monthInfo = monthPaymentsByStudent.get(student.name);
    renewalStudents.push({
      name: student.name,
      remainingHours: summary.remainingHours,
      expectedRenewalHours: latestPayment.purchasedHours,
      expectedRenewalAmount: Math.round(latestPayment.purchasedHours * latestPayment.pricePerHour),
      paidAmount: Math.round(monthInfo?.paid ?? 0),
      expiryDate: '',
      dueDate: '',
      renewedDate: monthInfo?.date ?? null,
      insufficientData: true,
    });
  }

  // Sort: unpaid first, then partial, then fully paid; insufficientData last
  renewalStudents.sort((a, b) => {
    if (a.insufficientData !== b.insufficientData) {
      return a.insufficientData ? 1 : -1;
    }
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
