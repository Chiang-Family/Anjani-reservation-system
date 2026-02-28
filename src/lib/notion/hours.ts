import { getPaymentsByStudent, getLatestPaymentByStudent } from './payments';
import { getCheckinsByStudent, getCheckinsByStudents } from './checkins';
import type { StudentHoursSummary, OverflowInfo, CheckinRecord, PaymentRecord } from '@/types';

interface CacheEntry {
  data: StudentHoursSummary;
  timestamp: number;
}

const summaryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/** FIFO 分配上課紀錄到各繳費期（先消耗最早的繳費時數） */
export function assignCheckinsToBuckets(
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

    // 日期邊界：上課日期 >= 下一期繳費日期時，檢查當前桶剩餘時數
    // 足夠該堂課 → 留在當前桶；不足 → 結轉剩餘並跳到下一桶
    while (bucketIdx < buckets.length - 1 &&
           checkin.classDate >= buckets[bucketIdx + 1].paymentDate) {
      const remainingMinutes = buckets[bucketIdx].purchasedHours * 60 - buckets[bucketIdx].consumedMinutes;
      if (remainingMinutes >= checkin.durationMinutes) {
        break; // 當前桶夠用，不跳桶
      }
      if (remainingMinutes > 0) {
        buckets[bucketIdx + 1].purchasedHours += remainingMinutes / 60;
      }
      buckets[bucketIdx].consumedMinutes = buckets[bucketIdx].purchasedHours * 60;
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
export function computeSummaryFromBuckets(
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
  const completedHours = completedMinutes / 60;
  const remainingHours = purchasedHours - completedMinutes / 60;

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

/** 取得學員 summary + overflow + 分桶資訊
 *  @param relatedStudentIds 共用時數池的其他學員 ID（如有），打卡紀錄會合併計算
 */
/** 解析學員主/副關係，返回正確的 primaryId 與 relatedIds，用於 getStudentOverflowInfo */
export async function resolveOverflowIds(student: { id: string; relatedStudentIds?: string[] }): Promise<{ primaryId: string; relatedIds?: string[] }> {
  if (!student.relatedStudentIds?.length) {
    return { primaryId: student.id };
  }
  const latestPayment = await getLatestPaymentByStudent(student.id);
  if (latestPayment) {
    return { primaryId: student.id, relatedIds: student.relatedStudentIds };
  }
  return {
    primaryId: student.relatedStudentIds[0],
    relatedIds: [student.id, ...student.relatedStudentIds.slice(1)],
  };
}

export async function getStudentOverflowInfo(studentId: string, relatedStudentIds?: string[]): Promise<{
  summary: StudentHoursSummary;
  overflow: OverflowInfo;
  payments: PaymentRecord[];
  buckets: { paymentDate: string; purchasedHours: number; checkins: CheckinRecord[] }[];
}> {
  const allIds = [studentId, ...(relatedStudentIds ?? [])];
  const [payments, checkins] = await Promise.all([
    getPaymentsByStudent(studentId),
    allIds.length > 1 ? getCheckinsByStudents(allIds) : getCheckinsByStudent(studentId),
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
