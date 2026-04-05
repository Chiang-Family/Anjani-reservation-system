/**
 * 計算 Winnie 教練學員的預收金額（已繳費、未打卡的剩餘堂數 × 單價）
 * 用法：npx tsx scripts/calc-prepaid.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
const envPath = resolve(import.meta.dirname ?? __dirname, '..', '.env.local');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) {
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1].trim()] = val;
  }
}

import { findCoachByName } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getPaymentsByStudent } from '@/lib/notion/payments';
import { getCheckinsByStudent, getCheckinsByStudents } from '@/lib/notion/checkins';
import { assignCheckinsToBuckets, computeSummaryFromBuckets, resolveOverflowIds } from '@/lib/notion/hours';
import type { Student } from '@/types';

interface StudentPrepaid {
  name: string;
  paymentType: string;
  pricePerHour: number;
  remainingHours: number;
  remainingSessions: number; // 以 1 小時為一堂計算
  prepaidAmount: number;
}

async function calcStudentPrepaid(student: Student): Promise<StudentPrepaid | null> {
  // 單堂學員不會有預收（每次上課才收費）
  if (student.paymentType === '單堂') return null;

  // 處理共用時數池：找到主學員
  const { primaryId, relatedIds } = await resolveOverflowIds(student);

  // 如果這位學員是副學員（不是主學員），跳過避免重複計算
  if (primaryId !== student.id) return null;

  const allIds = [primaryId, ...(relatedIds ?? [])];
  const [payments, checkins] = await Promise.all([
    getPaymentsByStudent(primaryId),
    allIds.length > 1 ? getCheckinsByStudents(allIds) : getCheckinsByStudent(primaryId),
  ]);

  if (payments.length === 0) return null;

  const { buckets, overflowCheckins } = assignCheckinsToBuckets(payments, checkins);
  const summary = computeSummaryFromBuckets(buckets, overflowCheckins);

  if (summary.remainingHours <= 0) return null;

  // 找到當前活躍桶的單價
  const activeIdx = buckets.findIndex(b => b.consumedMinutes < b.purchasedHours * 60);
  const pricePerHour = activeIdx >= 0 ? buckets[activeIdx].pricePerHour : (payments[0]?.pricePerHour ?? 0);

  // 計算加權平均單價（若跨多個未消耗桶）
  let weightedPrice = 0;
  let totalRemainingHrs = 0;
  if (activeIdx >= 0) {
    for (let i = activeIdx; i < buckets.length; i++) {
      const b = buckets[i];
      const remainHrs = i === activeIdx
        ? (b.purchasedHours * 60 - b.consumedMinutes) / 60
        : b.purchasedHours;
      if (remainHrs > 0) {
        weightedPrice += remainHrs * b.pricePerHour;
        totalRemainingHrs += remainHrs;
      }
    }
  }
  const avgPrice = totalRemainingHrs > 0 ? weightedPrice / totalRemainingHrs : pricePerHour;

  const prepaidAmount = summary.remainingHours * avgPrice;
  const remainingSessions = summary.remainingHours; // 1 hour = 1 session

  const displayName = relatedIds?.length
    ? `${student.name} (共用池)`
    : student.name;

  return {
    name: displayName,
    paymentType: student.paymentType ?? '套時數',
    pricePerHour: Math.round(avgPrice),
    remainingHours: summary.remainingHours,
    remainingSessions,
    prepaidAmount: Math.round(prepaidAmount),
  };
}

async function main() {
  const coach = await findCoachByName('Winnie');
  if (!coach) {
    console.error('找不到教練: Winnie');
    process.exit(1);
  }

  console.log(`\n📊 Winnie 教練 — 學員預收金額明細`);
  console.log(`${'='.repeat(70)}`);

  const students = await getStudentsByCoachId(coach.id);
  const results: StudentPrepaid[] = [];

  for (const student of students) {
    try {
      const result = await calcStudentPrepaid(student);
      if (result) results.push(result);
    } catch (err) {
      console.error(`  ⚠️ ${student.name} 計算失敗:`, err);
    }
  }

  // 按預收金額降序排列
  results.sort((a, b) => b.prepaidAmount - a.prepaidAmount);

  console.log(`\n${'學員'.padEnd(16)}${'單價/hr'.padStart(10)}${'剩餘時數'.padStart(10)}${'剩餘堂數'.padStart(10)}${'預收金額'.padStart(12)}`);
  console.log(`${'-'.repeat(70)}`);

  let totalPrepaid = 0;
  for (const r of results) {
    const hrs = r.remainingHours % 1 === 0
      ? r.remainingHours.toString()
      : r.remainingHours.toFixed(1);
    const sessions = r.remainingSessions % 1 === 0
      ? r.remainingSessions.toString()
      : r.remainingSessions.toFixed(1);
    console.log(
      `${r.name.padEnd(16)}` +
      `${'$' + r.pricePerHour.toLocaleString()}`.padStart(10) +
      `${hrs}h`.padStart(10) +
      `${sessions}堂`.padStart(10) +
      `${'$' + r.prepaidAmount.toLocaleString()}`.padStart(12)
    );
    totalPrepaid += r.prepaidAmount;
  }

  console.log(`${'-'.repeat(70)}`);
  console.log(`${'合計'.padEnd(46)}${'$' + totalPrepaid.toLocaleString()}`.padStart(12));
  console.log(`\n共 ${results.length} 位學員有預收餘額\n`);
}

main().catch(console.error);
