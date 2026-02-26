import { findCoachByLineId } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getPaymentsByStudents } from '@/lib/notion/payments';
import { assignCheckinsToBuckets, computeSummaryFromBuckets } from '@/lib/notion/hours';
import { getCheckinsByCoach } from '@/lib/notion/checkins';
import { getMonthEvents, getEventsForDateRange } from '@/lib/google/calendar';
import { nowTaipei, computeDurationMinutes, todayDateString } from '@/lib/utils/date';
import { format, addMonths, addDays, parseISO } from 'date-fns';
import type { CalendarEvent, CheckinRecord, PaymentRecord } from '@/types';

export interface RenewalStudent {
  name: string;
  partnerName?: string;      // 共用時數池的搭檔學員姓名
  remainingHours: number;
  expectedRenewalHours: number;
  expectedRenewalAmount: number;
  paidAmount: number;
  expiryDate: string;           // yyyy-MM-dd: 時數歸零的日期
  renewalDate: string;              // yyyy-MM-dd: 到期後下一堂課日期（續約日）
  isPaid: boolean;              // true if has payment record (next bucket exists)
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
      if (summary === name) {
        return true;
      }
    }
    return false;
  });
}

interface RenewalCycle {
  expiryDate: string;        // 時數歸零的日期
  renewalDate: string;           // 已繳費→繳費日期；未繳費→到期後下一堂課日期；'' = 行事曆不足
  isPaid: boolean;           // 是否有繳費紀錄（有下一個 bucket）
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
      renewalDate: nextInfo.actualDate,
      isPaid: true,
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
            renewalDate: nextInfo.actualDate,
            isPaid: true,
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
            renewalDate: evtIdx < futureEvents.length ? futureEvents[evtIdx].date : '',
            isPaid: false,
            expectedHours: curInfo.purchasedHours,
            expectedAmount: Math.round(curInfo.purchasedHours * curInfo.pricePerHour),
            paidAmount: 0,
          });
          break;
        }
      }
    }

    // If current bucket still has remaining hours but a next bucket is pre-paid, emit it.
    // This handles the case where future events run out before exhausting the active bucket.
    if (currentIdx + 1 < buckets.length) {
      const nextInfo = getBucketInfo(currentIdx + 1);
      cycles.push({
        expiryDate: '',
        renewalDate: nextInfo.actualDate,
        isPaid: true,
        expectedHours: nextInfo.purchasedHours,
        expectedAmount: nextInfo.totalAmount,
        paidAmount: nextInfo.paidAmount,
      });
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
        renewalDate: futureEvents.length > 0 ? futureEvents[0].date : '',
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
  // 先取學員清單，以學員 ID 查付款（避免付款紀錄未填教練欄位被漏掉）
  const [students, allMonthEvents, allFutureEvents, allCoachCheckins] = await Promise.all([
    getStudentsByCoachId(coach.id),                  // 1 Notion call
    getMonthEvents(year, month),                    // 1 Google Calendar call
    getEventsForDateRange(today, futureEnd),         // 1 Google Calendar call
    getCheckinsByCoach(coach.id),                    // 1 Notion call
  ]);
  const payments = await getPaymentsByStudents(students.map(s => s.id)); // 1 Notion call

  // ====== In-memory filtering ======
  const studentNames = new Set(students.map(s => s.name));
  const events = filterEventsByStudentNames(allMonthEvents, studentNames);
  const futureEvents = filterEventsByStudentNames(allFutureEvents, studentNames);
  // 依上課日期（CLASS_TIME_SLOT）過濾本月打卡，而非打卡時間（CHECKIN_TIME）
  const monthCheckins = allCoachCheckins.filter(c => c.classDate.startsWith(monthPrefix));

  // ====== Lookup maps ======
  const studentById = new Map(students.map(s => [s.id, s]));

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
  // 有關聯學員時，合併雙方打卡記錄共用同一付款 bucket
  const studentBucketData = students.map(s => {
    const studentPayments = paymentsByStudentId.get(s.id) ?? [];
    if (s.relatedStudentIds?.length) {
      const allIds = [s.id, ...s.relatedStudentIds];
      const combinedCheckins = allIds
        .flatMap(id => checkinsByStudentId.get(id) ?? [])
        .sort((a, b) => a.classDate.localeCompare(b.classDate));
      return assignCheckinsToBuckets(studentPayments, combinedCheckins);
    }
    const studentCheckins = checkinsByStudentId.get(s.id) ?? [];
    return assignCheckinsToBuckets(studentPayments, studentCheckins);
  });
  const summaries = studentBucketData.map(({ buckets, overflowCheckins }) =>
    computeSummaryFromBuckets(buckets, overflowCheckins)
  );

  // --- 堂數 ---
  const scheduledClasses = events.length;
  const checkedInClasses = monthCheckins.length;

  // --- Build studentName → latest pricePerHour map (via studentId, 避免舊標題名稱不符) ---
  const priceMap = new Map<string, number>();
  for (const s of students) {
    const sp = paymentsByStudentId.get(s.id);
    if (sp?.length) {
      priceMap.set(s.name, sp[0].pricePerHour);
    }
  }
  // 副學員（無付款）繼承主學員單價
  for (const s of students) {
    if (!priceMap.has(s.name) && s.relatedStudentIds?.length) {
      for (const relatedId of s.relatedStudentIds) {
        const related = studentById.get(relatedId);
        if (related && priceMap.has(related.name)) {
          priceMap.set(s.name, priceMap.get(related.name)!);
          break;
        }
      }
    }
  }
  // 以 studentId 為 key 的價格表（供 executedRevenue 用，避免歷史打卡標題名稱不符）
  const priceByStudentId = new Map<string, number>();
  for (const s of students) {
    if (priceMap.has(s.name)) {
      priceByStudentId.set(s.id, priceMap.get(s.name)!);
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
  // 優先用 studentId 查（避免歷史打卡記錄標題仍是舊合名），其次用 studentName
  let executedRevenue = 0;
  for (const checkin of monthCheckins) {
    const price = priceByStudentId.get(checkin.studentId) ?? priceMap.get(checkin.studentName ?? '') ?? 0;
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

    // 副學員（無付款記錄）跳過，其續約由主學員代表
    if (buckets.length === 0) continue;

    // 合併關聯學員的未來事件，確保時數消耗模擬完整
    const primaryFutureEvents = futureEventsByStudent.get(student.name) ?? [];
    const relatedFutureEvents = (student.relatedStudentIds ?? [])
      .flatMap(id => {
        const related = studentById.get(id);
        return related ? (futureEventsByStudent.get(related.name) ?? []) : [];
      });
    const studentFutureEvents = [...primaryFutureEvents, ...relatedFutureEvents]
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    const cycles = findRenewalCycles(buckets, overflowCheckins, studentFutureEvents, studentPayments);

    // 補充：若學員有付款紀錄的 actualDate 在本月，但尚未被 cycle 邏輯捕捉（例如當前活躍桶本身就是本月付款）
    const activeIdxForSupp = buckets.findIndex(b => b.consumedMinutes < b.purchasedHours * 60);
    if (activeIdxForSupp >= 0) {
      // 有活躍桶：只對「活躍桶」或「未來預繳桶」補充，已耗盡的舊桶由 Section 1 處理，不重複加入。
      const activePlusFutureDates = new Set(buckets.slice(activeIdxForSupp).map(b => b.paymentDate));
      const capturedRenewalDates = new Set(cycles.map(c => c.renewalDate));
      for (const p of studentPayments) {
        if (!p.actualDate.startsWith(monthPrefix)) continue;
        if (capturedRenewalDates.has(p.actualDate)) continue;
        if (!activePlusFutureDates.has(p.createdAt)) continue; // 只考慮活躍桶及其後
        const sameDatePayments = studentPayments.filter(sp => sp.createdAt === p.createdAt);
        cycles.push({
          expiryDate: '',
          renewalDate: p.actualDate,
          isPaid: true,
          expectedHours: sameDatePayments.reduce((s, sp) => s + sp.purchasedHours, 0),
          expectedAmount: sameDatePayments.reduce((s, sp) => s + sp.totalAmount, 0),
          paidAmount: sameDatePayments.reduce((s, sp) => s + sp.paidAmount, 0),
        });
        capturedRenewalDates.add(p.actualDate);
      }
    } else if (buckets.length > 0) {
      // 全部耗盡（activeIdx=-1）：Section 1 已透過後繼桶捕捉「桶i → 桶i+1」的續約日，
      // 但首桶（bucket[0]）本身的付款日若在本月則不會被捕捉。
      // 掃描所有桶，凡付款日在本月且未被捕捉者（包含首次報名）一律補上。
      const capturedRenewalDates = new Set(cycles.map(c => c.renewalDate));
      for (const bucket of buckets) {
        const bucketPayments = studentPayments.filter(p => p.createdAt === bucket.paymentDate);
        for (const p of bucketPayments) {
          if (!p.actualDate.startsWith(monthPrefix)) continue;
          if (capturedRenewalDates.has(p.actualDate)) continue;
          const sameDatePayments = studentPayments.filter(sp => sp.createdAt === p.createdAt);
          cycles.push({
            expiryDate: '',
            renewalDate: p.actualDate,
            isPaid: true,
            expectedHours: sameDatePayments.reduce((s, sp) => s + sp.purchasedHours, 0),
            expectedAmount: sameDatePayments.reduce((s, sp) => s + sp.totalAmount, 0),
            paidAmount: sameDatePayments.reduce((s, sp) => s + sp.paidAmount, 0),
          });
          capturedRenewalDates.add(p.actualDate);
        }
      }
    }

    // 搭檔學員姓名（顯示用）
    const partnerName = (student.relatedStudentIds ?? [])
      .map(id => studentById.get(id)?.name)
      .filter(Boolean)
      .join('・') || undefined;

    for (const cycle of cycles) {
      // 只看續約日是否在本月
      if (cycle.renewalDate === '' || !cycle.renewalDate.startsWith(monthPrefix)) continue;
      // 若同一日期已有已繳費 cycle（例如 Section 1），略過 Section 3 產生的未繳費 cycle
      if (!cycle.isPaid && cycles.some(c => c.isPaid && c.renewalDate === cycle.renewalDate)) continue;

      renewalStudents.push({
        name: student.name,
        partnerName,
        remainingHours: summary.remainingHours,
        expectedRenewalHours: cycle.expectedHours,
        expectedRenewalAmount: cycle.expectedAmount,
        paidAmount: Math.round(cycle.paidAmount),
        expiryDate: cycle.isPaid
          ? format(addDays(parseISO(cycle.renewalDate), cycle.expectedHours), 'yyyy-MM-dd')
          : cycle.expiryDate,
        renewalDate: cycle.renewalDate,
        isPaid: cycle.isPaid,
      });
    }
  }

  // Sort: unpaid first
  renewalStudents.sort((a, b) => {
    if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
    return 0;
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
