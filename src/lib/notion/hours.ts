import { getPaymentsByStudent } from './payments';
import { getCheckinsByStudent } from './checkins';
import type { StudentHoursSummary, OverflowInfo, CheckinRecord, PaymentRecord } from '@/types';

interface CacheEntry {
  data: StudentHoursSummary;
  timestamp: number;
}

const summaryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/** FIFO 分配上課紀錄到各繳費期（先消耗最早的繳費時數） */
function assignCheckinsToBuckets(
  payments: PaymentRecord[],
  checkins: CheckinRecord[]
): {
  buckets: { paymentDate: string; purchasedHours: number; checkins: CheckinRecord[]; consumedMinutes: number }[];
  overflowCheckins: CheckinRecord[];
} {
  const uniquePayDates = [...new Set(payments.map(p => p.createdAt))].sort();
  const buckets = uniquePayDates.map(date => {
    const periodPayments = payments.filter(p => p.createdAt === date);
    return {
      paymentDate: date,
      purchasedHours: periodPayments.reduce((sum, p) => sum + p.purchasedHours, 0),
      checkins: [] as CheckinRecord[],
      consumedMinutes: 0,
    };
  });

  const sorted = [...checkins].sort((a, b) => a.classDate.localeCompare(b.classDate));
  let bucketIdx = 0;
  const overflowCheckins: CheckinRecord[] = [];

  for (const checkin of sorted) {
    // 跳過已消耗完的桶
    while (bucketIdx < buckets.length &&
           buckets[bucketIdx].consumedMinutes >= buckets[bucketIdx].purchasedHours * 60) {
      bucketIdx++;
    }

    if (bucketIdx >= buckets.length) {
      overflowCheckins.push(checkin);
    } else {
      buckets[bucketIdx].checkins.push(checkin);
      buckets[bucketIdx].consumedMinutes += checkin.durationMinutes;
    }
  }

  return { buckets, overflowCheckins };
}

/** 從 FIFO 分桶結果計算 summary */
function computeSummaryFromBuckets(
  buckets: { purchasedHours: number; consumedMinutes: number }[],
  overflowCheckins: CheckinRecord[]
): StudentHoursSummary {
  // 找到正在消耗中的桶（第一個尚未耗盡的）
  let activeIdx = buckets.findIndex(b => b.consumedMinutes < b.purchasedHours * 60);
  if (activeIdx === -1) activeIdx = buckets.length;

  // 購買時數 = 當前桶 + 未來桶
  const purchasedHours = buckets.slice(activeIdx).reduce((sum, b) => sum + b.purchasedHours, 0);
  // 已上時數 = 當前桶已消耗 + overflow
  const activeConsumedMinutes = activeIdx < buckets.length ? buckets[activeIdx].consumedMinutes : 0;
  const overflowMinutes = overflowCheckins.reduce((sum, c) => sum + c.durationMinutes, 0);
  const completedMinutes = activeConsumedMinutes + overflowMinutes;
  const completedHours = Math.round(completedMinutes / 60 * 10) / 10;
  const remainingHours = Math.round((purchasedHours - completedMinutes / 60) * 10) / 10;

  return { purchasedHours, completedHours, remainingHours };
}

export async function getStudentHoursSummary(studentId: string): Promise<StudentHoursSummary> {
  const now = Date.now();
  const cached = summaryCache.get(studentId);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const [payments, checkins] = await Promise.all([
    getPaymentsByStudent(studentId),
    getCheckinsByStudent(studentId),
  ]);

  const { buckets, overflowCheckins } = assignCheckinsToBuckets(payments, checkins);
  const result = computeSummaryFromBuckets(buckets, overflowCheckins);

  summaryCache.set(studentId, {
    data: result,
    timestamp: now,
  });

  return result;
}

export function clearStudentHoursCache(studentId: string): void {
  summaryCache.delete(studentId);
}

/** 取得學員 summary + overflow + 分桶資訊 */
export async function getStudentOverflowInfo(studentId: string): Promise<{
  summary: StudentHoursSummary;
  overflow: OverflowInfo;
  payments: PaymentRecord[];
  buckets: { paymentDate: string; purchasedHours: number; checkins: CheckinRecord[] }[];
}> {
  const [payments, checkins] = await Promise.all([
    getPaymentsByStudent(studentId),
    getCheckinsByStudent(studentId),
  ]);

  const { buckets, overflowCheckins } = assignCheckinsToBuckets(payments, checkins);
  const summary = computeSummaryFromBuckets(buckets, overflowCheckins);

  // 當前桶的上課紀錄（用於「當期上課紀錄」顯示）
  let activeIdx = buckets.findIndex(b => b.consumedMinutes < b.purchasedHours * 60);
  if (activeIdx === -1) activeIdx = Math.max(0, buckets.length - 1);
  const activeBucketCheckins = activeIdx < buckets.length ? buckets[activeIdx].checkins : [];

  const hasOverflow = overflowCheckins.length > 0;

  return {
    summary,
    overflow: {
      hasOverflow,
      overflowBoundaryDate: hasOverflow ? overflowCheckins[0].classDate : null,
      paidCheckins: activeBucketCheckins,
      unpaidCheckins: overflowCheckins,
    },
    payments,
    buckets: buckets.map(b => ({
      paymentDate: b.paymentDate,
      purchasedHours: b.purchasedHours,
      checkins: b.checkins,
    })),
  };
}
