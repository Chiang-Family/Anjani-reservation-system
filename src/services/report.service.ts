import { findCoachByLineId, getCoachById } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getPaymentsByStudents } from '@/lib/notion/payments';
import { getCheckinsByCoach } from '@/lib/notion/checkins';
import { assignCheckinsToBuckets } from '@/lib/notion/hours';
import { nowTaipei } from '@/lib/utils/date';
import type { CheckinRecord, PaymentRecord, Student } from '@/types';

export interface ReportData {
  title: string;
  coachName: string;
  year: number;
  month: number;
  summary: {
    headers: string[];
    rows: (string | number)[][];
  };
  checkins: {
    headers: string[];
    rows: (string | number)[][];
  };
  payments: {
    headers: string[];
    rows: (string | number)[][];
  };
}


function compileRows(
  students: Student[],
  monthCheckins: CheckinRecord[],
  monthPayments: PaymentRecord[],
  allCheckins: CheckinRecord[],
  allPayments: PaymentRecord[],
) {
  const checkinsByStudentId = new Map<string, CheckinRecord[]>();
  for (const c of monthCheckins) {
    const arr = checkinsByStudentId.get(c.studentId) ?? [];
    arr.push(c);
    checkinsByStudentId.set(c.studentId, arr);
  }
  const paymentsByStudentId = new Map<string, PaymentRecord[]>();
  for (const p of monthPayments) {
    const arr = paymentsByStudentId.get(p.studentId) ?? [];
    arr.push(p);
    paymentsByStudentId.set(p.studentId, arr);
  }

  // Build FIFO lesson number map: checkinId → position within its bucket
  // 共用時數的學員需合併處理（副學員的 checkin 歸入主學員的付款桶）
  const allCheckinsByStudentId = new Map<string, CheckinRecord[]>();
  for (const c of allCheckins) {
    const arr = allCheckinsByStudentId.get(c.studentId) ?? [];
    arr.push(c);
    allCheckinsByStudentId.set(c.studentId, arr);
  }
  const allPaymentsByStudentId = new Map<string, PaymentRecord[]>();
  for (const p of allPayments) {
    const arr = allPaymentsByStudentId.get(p.studentId) ?? [];
    arr.push(p);
    allPaymentsByStudentId.set(p.studentId, arr);
  }
  const lessonNumberMap = new Map<string, number>();
  const checkinPriceMap = new Map<string, number>();
  const processedStudentIds = new Set<string>();
  for (const student of students) {
    if (processedStudentIds.has(student.id)) continue;

    // 找出共用時數池的所有成員
    const poolIds = [student.id, ...(student.relatedStudentIds ?? [])];
    poolIds.forEach(id => processedStudentIds.add(id));

    // 找到主學員（持有付款紀錄的那位）
    let primaryPayments: PaymentRecord[] = [];
    for (const id of poolIds) {
      const payments = allPaymentsByStudentId.get(id) ?? [];
      if (payments.length > 0) {
        primaryPayments = payments;
        break;
      }
    }

    // 合併所有成員的上課紀錄
    const poolCheckins: CheckinRecord[] = [];
    for (const id of poolIds) {
      poolCheckins.push(...(allCheckinsByStudentId.get(id) ?? []));
    }

    if (poolCheckins.length === 0) continue;

    const isPerSession = poolIds.some(pid => {
      const s = students.find(st => st.id === pid);
      return s?.paymentType === '單堂' && s.perSessionFee;
    });
    const sessionFee = isPerSession
      ? students.find(s => poolIds.includes(s.id) && s.perSessionFee)?.perSessionFee ?? 0
      : 0;

    if (primaryPayments.length === 0) {
      // 單堂學員無付款紀錄：用 perSessionFee 估算
      if (isPerSession && sessionFee > 0) {
        poolCheckins.forEach((c, idx) => {
          lessonNumberMap.set(c.id, idx + 1);
          const durHours = c.durationMinutes / 60;
          checkinPriceMap.set(c.id, durHours > 0 ? sessionFee / durHours : 0);
        });
      }
      continue;
    }

    const fallbackPrice = primaryPayments[0]?.pricePerHour ?? 0;
    const { buckets, overflowCheckins } = assignCheckinsToBuckets(primaryPayments, poolCheckins);
    for (const bucket of buckets) {
      bucket.checkins.forEach((c, idx) => {
        lessonNumberMap.set(c.id, idx + 1);
        checkinPriceMap.set(c.id, bucket.pricePerHour);
      });
    }
    overflowCheckins.forEach((c, idx) => {
      lessonNumberMap.set(c.id, idx + 1);
      if (isPerSession && sessionFee > 0) {
        const durHours = c.durationMinutes / 60;
        checkinPriceMap.set(c.id, durHours > 0 ? sessionFee / durHours : 0);
      } else {
        checkinPriceMap.set(c.id, fallbackPrice);
      }
    });
  }

  const summaryRows: (string | number)[][] = [];
  const checkinRows: (string | number)[][] = [];
  const paymentRows: (string | number)[][] = [];

  for (const student of students) {
    const checkins = (checkinsByStudentId.get(student.id) ?? []).sort((a, b) =>
      a.classDate.localeCompare(b.classDate),
    );
    const pays = (paymentsByStudentId.get(student.id) ?? []).sort((a, b) =>
      (a.actualDate || a.createdAt).localeCompare(b.actualDate || b.createdAt),
    );

    if (checkins.length === 0 && pays.length === 0) continue;

    let executedRevenue = 0;
    let totalMinutes = 0;
    for (const c of checkins) {
      const price = checkinPriceMap.get(c.id) ?? 0;
      executedRevenue += (c.durationMinutes / 60) * price;
      totalMinutes += c.durationMinutes;
    }
    const collected = pays.reduce((sum, p) => sum + p.paidAmount, 0);

    summaryRows.push([
      student.name,
      checkins.length,
      +(totalMinutes / 60).toFixed(1),
      Math.round(executedRevenue),
      collected,
    ]);

    for (const c of checkins) {
      const lessonNum = lessonNumberMap.get(c.id) ?? 0;
      checkinRows.push([student.name, `#${lessonNum}`, c.classDate, c.classTimeSlot ?? '', c.durationMinutes]);
    }

    for (const p of pays) {
      const payDate = p.actualDate || p.createdAt;
      paymentRows.push([
        student.name,
        payDate,
        p.purchasedHours,
        p.pricePerHour,
        p.paidAmount,
      ]);
    }
  }

  // Add total row at top of summary so it's visible on page 1
  if (summaryRows.length > 0) {
    const totalCheckedIn = summaryRows.reduce((s, r) => s + (r[1] as number), 0);
    const totalHours = summaryRows.reduce((s, r) => s + (r[2] as number), 0);
    const totalRevenue = summaryRows.reduce((s, r) => s + (r[3] as number), 0);
    const totalCollected = summaryRows.reduce((s, r) => s + (r[4] as number), 0);
    summaryRows.unshift(['合計', totalCheckedIn, +totalHours.toFixed(1), totalRevenue, totalCollected]);
  }

  return { summaryRows, checkinRows, paymentRows };
}

/**
 * Compile monthly report data. Can be called with lineUserId or coachId.
 */
export async function compileMonthlyReport(
  opts: { lineUserId: string } | { coachId: string },
  targetYear?: number,
  targetMonth?: number,
): Promise<ReportData | null> {
  const coach = 'lineUserId' in opts
    ? await findCoachByLineId(opts.lineUserId)
    : await getCoachById(opts.coachId);
  if (!coach) return null;

  const now = nowTaipei();
  const year = targetYear ?? (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const month = targetMonth ?? (now.getMonth() === 0 ? 12 : now.getMonth());
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  const students = await getStudentsByCoachId(coach.id);
  const [allCoachCheckins, payments] = await Promise.all([
    getCheckinsByCoach(coach.id),
    getPaymentsByStudents(students.map(s => s.id)),
  ]);

  const monthCheckins = allCoachCheckins.filter(c => c.classDate.startsWith(monthPrefix));
  const monthPayments = payments.filter(
    p => p.actualDate.startsWith(monthPrefix) || p.createdAt.startsWith(monthPrefix),
  );

  const { summaryRows, checkinRows, paymentRows } = compileRows(
    students, monthCheckins, monthPayments, allCoachCheckins, payments,
  );

  return {
    title: `安傑力月報表 ${year}年${month}月 ${coach.name}教練`,
    coachName: coach.name,
    year,
    month,
    summary: {
      headers: ['學員', '執行堂數', '執行時數(時)', '執行收入', '繳費金額'],
      rows: summaryRows,
    },
    checkins: {
      headers: ['學員', '堂次', '上課日期', '上課時段', '時長(分)'],
      rows: checkinRows,
    },
    payments: {
      headers: ['學員', '繳費日期', '購買時數', '單價', '已付金額'],
      rows: paymentRows,
    },
  };
}
