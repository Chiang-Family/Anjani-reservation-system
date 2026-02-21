import { getPaymentsByStudent } from './payments';
import { getCheckinsByStudent } from './checkins';
import type { StudentHoursSummary } from '@/types';

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
