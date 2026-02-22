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
  expiryDate: string;           // yyyy-MM-dd: 時數歸零的日期
  dueDate: string;              // yyyy-MM-dd: 已繳費→繳費日；未繳費→到期後下一堂課日期；'' = 行事曆不足
  isPaid: boolean;              // true if renewed and fully paid
  insufficientData: boolean;    // true when calendar data insufficient to determine dueDate
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

interface RenewalCycle {
  expiryDate: string;        // 時數歸零的日期
  dueDate: string;           // 已繳費→繳費日；未繳費→到期後下一堂課日期；'' = 行事曆不足
  isPaid: boolean;           // 是否已續約且全額繳費
  expectedHours: number;     // 已繳費→實際購買時數；未繳費→預估（同上期）
  expectedAmount: number;    // 已繳費→實際金額；未繳費→預估
  paidAmount: number;        // 已繳費→實付金額；未繳費→0
}

/**
 * Find all renewal cycles for a student by walking through FIFO buckets.
 * Each bucket exhaustion = one cycle.
 */
function findRenewalCycles(
  buckets: { paymentDate: string; purchasedHours: number; checkins: CheckinRecord[]; consumedMinutes: number }[],
  overflowCheckins: CheckinRecord[],
  futureEvents: CalendarEvent[],
  payments: PaymentRecord[],
): RenewalCycle[] {
  const cycles: RenewalCycle[] = [];
  if (buckets.length === 0) return cycles;

  // Map paymentDate (createdAt) → payment records for actualDate lookup
  const paymentsByCreatedAt = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    const arr = paymentsByCreatedAt.get(p.createdAt) ?? [];
    arr.push(p);
    paymentsByCreatedAt.set(p.createdAt, arr);
  }

  function getBucketInfo(idx: number) {
    const bucket = buckets[idx];
    const ps = paymentsByCreatedAt.get(bucket.paymentDate) ?? [];
    return {
      actualDate: ps[0]?.actualDate ?? bucket.paymentDate,
      purchasedHours: bucket.purchasedHours,
      totalAmount: ps.reduce((s, p) => s + p.totalAmount, 0),
      paidAmount: ps.reduce((s, p) => s + p.paidAmount, 0),
      pricePerHour: ps[0]?.pricePerHour ?? 0,
    };
  }

  const activeIdx = buckets.findIndex(b => b.consumedMinutes < b.purchasedHours * 60);

  // 1. Past completed buckets: each with a next bucket = one renewed cycle
  const pastEnd = activeIdx === -1 ? buckets.length : activeIdx;
  for (let i = 0; i < pastEnd; i++) {
    if (buckets[i].checkins.length === 0 || i + 1 >= buckets.length) continue;
    const nextInfo = getBucketInfo(i + 1);
    cycles.push({
      expiryDate: buckets[i].checkins[buckets[i].checkins.length - 1].classDate,
      dueDate: nextInfo.actualDate,
      isPaid: nextInfo.paidAmount >= nextInfo.totalAmount,
      expectedHours: nextInfo.purchasedHours,
      expectedAmount: nextInfo.totalAmount,
      paidAmount: nextInfo.paidAmount,
    });
  }

  // 2. Active + future buckets: simulate future event consumption
  if (activeIdx !== -1) {
    let currentIdx = activeIdx;
    let remainingMin = buckets[currentIdx].purchasedHours * 60 - buckets[currentIdx].consumedMinutes;
    let evtIdx = 0;

    while (evtIdx < futureEvents.length) {
      const evt = futureEvents[evtIdx];
      const durMin = computeDurationMinutes(evt.startTime, evt.endTime);
      remainingMin -= durMin;
      evtIdx++;

      if (remainingMin <= 0) {
        const expiryDate = evt.date;
        const nextIdx = currentIdx + 1;

        if (nextIdx < buckets.length) {
          // Renewed: next bucket exists
          const nextInfo = getBucketInfo(nextIdx);
          cycles.push({
            expiryDate,
            dueDate: nextInfo.actualDate,
            isPaid: nextInfo.paidAmount >= nextInfo.totalAmount,
            expectedHours: nextInfo.purchasedHours,
            expectedAmount: nextInfo.totalAmount,
            paidAmount: nextInfo.paidAmount,
          });
          currentIdx = nextIdx;
          remainingMin = buckets[nextIdx].purchasedHours * 60 + remainingMin;
        } else {
          // Not renewed: estimate from current bucket
          const curInfo = getBucketInfo(currentIdx);
          cycles.push({
            expiryDate,
            dueDate: evtIdx < futureEvents.length ? futureEvents[evtIdx].date : '',
            isPaid: false,
            expectedHours: curInfo.purchasedHours,
            expectedAmount: Math.round(curInfo.purchasedHours * curInfo.pricePerHour),
            paidAmount: 0,
          });
          break;
        }
      }
    }
  }

  // 3. Overflow: all buckets consumed, no active bucket
  if (activeIdx === -1 && buckets.length > 0) {
    const lastBucket = buckets[buckets.length - 1];
    const lastCheckin = lastBucket.checkins.length > 0
      ? lastBucket.checkins[lastBucket.checkins.length - 1]
      : overflowCheckins.length > 0
        ? overflowCheckins[overflowCheckins.length - 1]
        : null;

    if (lastCheckin) {
      const lastInfo = getBucketInfo(buckets.length - 1);
      cycles.push({
        expiryDate: lastCheckin.classDate,
        dueDate: futureEvents.length > 0 ? futureEvents[0].date : '',
        isPaid: false,
        expectedHours: lastInfo.purchasedHours,
        expectedAmount: Math.round(lastInfo.purchasedHours * lastInfo.pricePerHour),
        paidAmount: 0,
      });
    }
  }

  return cycles;
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
  const studentBucketData = students.map(s => {
    const studentPayments = paymentsByStudentId.get(s.id) ?? [];
    const studentCheckins = checkinsByStudentId.get(s.id) ?? [];
    return assignCheckinsToBuckets(studentPayments, studentCheckins);
  });
  const summaries = studentBucketData.map(({ buckets, overflowCheckins }) =>
    computeSummaryFromBuckets(buckets, overflowCheckins)
  );

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

  // Find renewal cycles per student (all in-memory, no API calls)
  const renewalStudents: RenewalStudent[] = [];
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const { buckets, overflowCheckins } = studentBucketData[i];
    const summary = summaries[i];
    const studentPayments = paymentsByStudentId.get(student.id) ?? [];
    const studentFutureEvents = futureEventsByStudent.get(student.name) ?? [];

    if (buckets.length === 0) continue;

    const cycles = findRenewalCycles(buckets, overflowCheckins, studentFutureEvents, studentPayments);

    for (const cycle of cycles) {
      // 已繳費→按繳費日歸月；未繳費→到期日或應繳日任一在本月
      const inMonth = cycle.isPaid
        ? cycle.dueDate.startsWith(monthPrefix)
        : (cycle.expiryDate.startsWith(monthPrefix) ||
           (cycle.dueDate !== '' && cycle.dueDate.startsWith(monthPrefix)));
      if (!inMonth) continue;

      renewalStudents.push({
        name: student.name,
        remainingHours: summary.remainingHours,
        expectedRenewalHours: cycle.expectedHours,
        expectedRenewalAmount: cycle.expectedAmount,
        paidAmount: Math.round(cycle.paidAmount),
        expiryDate: cycle.expiryDate,
        dueDate: cycle.dueDate,
        isPaid: cycle.isPaid,
        insufficientData: !cycle.isPaid && cycle.dueDate === '',
      });
    }
  }

  // Sort: unpaid first (low paid ratio), insufficientData last
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

  // 實際收款 + 待收款: from actual payments created in this month
  let collectedAmount = 0;
  let pendingAmount = 0;
  for (const p of payments) {
    if (p.createdAt.startsWith(monthPrefix) || p.actualDate.startsWith(monthPrefix)) {
      collectedAmount += p.paidAmount;
      if (p.totalAmount > p.paidAmount) {
        pendingAmount += (p.totalAmount - p.paidAmount);
      }
    }
  }

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
