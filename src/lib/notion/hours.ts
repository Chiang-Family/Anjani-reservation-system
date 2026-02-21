import { getPaymentsByStudent } from './payments';
import { getCheckinsByStudent } from './checkins';
import type { StudentHoursSummary, OverflowInfo, CheckinRecord, PaymentRecord } from '@/types';

interface CacheEntry {
  data: StudentHoursSummary;
  timestamp: number;
}

const summaryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

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

  // 只計算當期（最新繳費日之後）的資料
  const latestPayDate = payments.length > 0 ? payments[0].createdAt : null;
  const currentPeriodPayments = latestPayDate
    ? payments.filter((p) => p.createdAt === latestPayDate)
    : payments;
  const currentPeriodCheckins = latestPayDate
    ? checkins.filter((c) => c.classDate >= latestPayDate)
    : checkins;

  const purchasedHours = currentPeriodPayments.reduce((sum, p) => sum + p.purchasedHours, 0);
  const completedMinutes = currentPeriodCheckins.reduce((sum, c) => sum + c.durationMinutes, 0);
  const completedHours = Math.round(completedMinutes / 60 * 10) / 10;
  const remainingHours = Math.round((purchasedHours - completedMinutes / 60) * 10) / 10;

  const result = { purchasedHours, completedHours, remainingHours };

  summaryCache.set(studentId, {
    data: result,
    timestamp: now,
  });

  return result;
}

export function clearStudentHoursCache(studentId: string): void {
  summaryCache.delete(studentId);
}

/** 計算當期已繳費/未繳費的上課紀錄分界 */
export function computeOverflowInfo(
  purchasedHours: number,
  currentPeriodCheckins: CheckinRecord[]
): OverflowInfo {
  if (currentPeriodCheckins.length === 0) {
    return { hasOverflow: false, overflowBoundaryDate: null, paidCheckins: [], unpaidCheckins: [] };
  }

  // 按日期升序排列
  const sorted = [...currentPeriodCheckins].sort(
    (a, b) => a.classDate.localeCompare(b.classDate)
  );

  if (purchasedHours <= 0) {
    return {
      hasOverflow: true,
      overflowBoundaryDate: sorted[0].classDate,
      paidCheckins: [],
      unpaidCheckins: sorted,
    };
  }

  const purchasedMinutes = purchasedHours * 60;
  let cumulativeMinutes = 0;
  let firstUnpaidIndex = -1;

  for (let i = 0; i < sorted.length; i++) {
    // 先檢查：開始這堂課之前，時數是否已用完
    if (cumulativeMinutes >= purchasedMinutes) {
      firstUnpaidIndex = i;
      break;
    }
    cumulativeMinutes += sorted[i].durationMinutes;
  }

  // 沒有超過 → 沒有 overflow
  if (firstUnpaidIndex === -1) {
    return { hasOverflow: false, overflowBoundaryDate: null, paidCheckins: sorted, unpaidCheckins: [] };
  }

  const paidCheckins = sorted.slice(0, firstUnpaidIndex);
  const unpaidCheckins = sorted.slice(firstUnpaidIndex);

  return {
    hasOverflow: true,
    overflowBoundaryDate: unpaidCheckins[0].classDate,
    paidCheckins,
    unpaidCheckins,
  };
}

/** 取得學員當期 summary + overflow 資訊 */
export async function getStudentOverflowInfo(studentId: string): Promise<{
  summary: StudentHoursSummary;
  overflow: OverflowInfo;
  payments: PaymentRecord[];
}> {
  const [payments, checkins] = await Promise.all([
    getPaymentsByStudent(studentId),
    getCheckinsByStudent(studentId),
  ]);

  const latestPayDate = payments.length > 0 ? payments[0].createdAt : null;
  const currentPeriodPayments = latestPayDate
    ? payments.filter((p) => p.createdAt === latestPayDate)
    : payments;
  const currentPeriodCheckins = latestPayDate
    ? checkins.filter((c) => c.classDate >= latestPayDate)
    : checkins;

  const purchasedHours = currentPeriodPayments.reduce((sum, p) => sum + p.purchasedHours, 0);
  const completedMinutes = currentPeriodCheckins.reduce((sum, c) => sum + c.durationMinutes, 0);
  const completedHours = Math.round(completedMinutes / 60 * 10) / 10;
  const remainingHours = Math.round((purchasedHours - completedMinutes / 60) * 10) / 10;

  return {
    summary: { purchasedHours, completedHours, remainingHours },
    overflow: computeOverflowInfo(purchasedHours, currentPeriodCheckins),
    payments,
  };
}
