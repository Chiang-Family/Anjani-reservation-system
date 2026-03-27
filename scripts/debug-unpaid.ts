/**
 * 診斷：為什麼某學員出現在未繳費名單
 * 用法：npx tsx scripts/debug-unpaid.ts 杜慧貞
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

import { getPaymentsByStudent } from '@/lib/notion/payments';
import { getCheckinsByStudent } from '@/lib/notion/checkins';
import { assignCheckinsToBuckets } from '@/lib/notion/hours';
import { findStudentByName } from '@/lib/notion/students';
import { getEventsForDateRange } from '@/lib/google/calendar';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const studentName = process.argv[2];
if (!studentName) {
  console.error('用法: npx tsx scripts/debug-unpaid.ts <學員姓名>');
  process.exit(1);
}

function computeDurationMinutes(start?: string, end?: string): number {
  if (!start || !end) return 60; // default 1h
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

async function main() {
  const student = await findStudentByName(studentName);
  if (!student) {
    console.error(`找不到學員: ${studentName}`);
    process.exit(1);
  }

  console.log(`\n=== 學員: ${student.name} (${student.paymentType}) ===`);
  console.log(`ID: ${student.id}`);
  console.log(`perSessionFee: ${student.perSessionFee ?? 'N/A'}`);

  const payments = await getPaymentsByStudent(student.id);
  const checkins = await getCheckinsByStudent(student.id);

  console.log(`\n--- 繳費紀錄 (${payments.length} 筆) ---`);
  for (const p of payments) {
    console.log(`  ${p.actualDate} | ${p.purchasedHours}h × $${p.pricePerHour} = $${p.totalAmount} | 已付 $${p.paidAmount} | ${p.status} | createdAt: ${p.createdAt}`);
  }

  console.log(`\n--- 打卡紀錄 (${checkins.length} 筆) ---`);
  for (const c of checkins) {
    console.log(`  ${c.classDate} [${c.classTimeSlot || 'no-slot'}] dur=${c.durationMinutes}min`);
  }

  const { buckets, overflowCheckins } = assignCheckinsToBuckets(payments, checkins);

  console.log(`\n--- FIFO Buckets (${buckets.length} 個) ---`);
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const totalMin = b.purchasedHours * 60;
    const remainMin = totalMin - b.consumedMinutes;
    console.log(`  Bucket[${i}]: payDate=${b.paymentDate} | ${b.purchasedHours}h (${totalMin}min) | consumed=${b.consumedMinutes}min | remaining=${remainMin}min (${(remainMin / 60).toFixed(1)}h) | checkins=${b.checkins.length}`);
  }
  if (overflowCheckins.length > 0) {
    console.log(`  Overflow checkins: ${overflowCheckins.length}`);
    for (const c of overflowCheckins) {
      console.log(`    ${c.classDate} [${c.classTimeSlot || 'no-slot'}] dur=${c.durationMinutes}min`);
    }
  }

  const activeIdx = buckets.findIndex(b => b.consumedMinutes < b.purchasedHours * 60);
  console.log(`\n  Active bucket index: ${activeIdx}`);
  if (activeIdx >= 0) {
    const ab = buckets[activeIdx];
    const remainMin = ab.purchasedHours * 60 - ab.consumedMinutes;
    console.log(`  Active bucket remaining: ${remainMin}min (${(remainMin / 60).toFixed(1)}h)`);
  }

  // Future calendar events
  const now = new Date();
  const monthEnd = endOfMonth(now);
  const todayStr = format(now, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
  const monthPrefix = format(now, 'yyyy-MM');

  // Get all calendar events for the month
  const monthStartStr = format(startOfMonth(now), 'yyyy-MM-dd');
  const allEvents = await getEventsForDateRange(monthStartStr, monthEndStr);

  const studentEvents = allEvents.filter(e => e.summary.trim() === student.name);
  const checkedInDates = new Set(
    buckets.flatMap(b => b.checkins.map(c => c.classDate))
      .concat(overflowCheckins.map(c => c.classDate))
  );
  const futureEvents = studentEvents.filter(e => e.date >= todayStr && !checkedInDates.has(e.date));

  console.log(`\n--- 本月行事曆事件 (${studentEvents.length} 筆) ---`);
  for (const e of studentEvents) {
    const isCheckedIn = checkedInDates.has(e.date);
    const isFuture = e.date >= todayStr;
    console.log(`  ${e.date} ${e.startTime}-${e.endTime} (${computeDurationMinutes(e.startTime, e.endTime)}min) ${isCheckedIn ? '[已打卡]' : ''} ${isFuture ? '[未來]' : ''}`);
  }

  console.log(`\n--- 未打卡的未來事件 (模擬用, ${futureEvents.length} 筆) ---`);
  for (const e of futureEvents) {
    console.log(`  ${e.date} ${e.startTime}-${e.endTime} (${computeDurationMinutes(e.startTime, e.endTime)}min)`);
  }

  // Simulate
  if (activeIdx >= 0 && futureEvents.length > 0) {
    console.log(`\n--- 模擬時數消耗 ---`);
    let currentIdx = activeIdx;
    let remainingMin = buckets[currentIdx].purchasedHours * 60 - buckets[currentIdx].consumedMinutes;
    console.log(`  起始: Bucket[${currentIdx}] 剩餘 ${remainingMin}min`);

    for (let i = 0; i < futureEvents.length; i++) {
      const evt = futureEvents[i];
      const dur = computeDurationMinutes(evt.startTime, evt.endTime);
      remainingMin -= dur;
      console.log(`  ${evt.date} -${dur}min → 剩餘 ${remainingMin}min`);

      if (remainingMin <= 0) {
        const nextIdx = currentIdx + 1;
        if (nextIdx < buckets.length) {
          console.log(`  → Bucket[${currentIdx}] 耗盡，跳到 Bucket[${nextIdx}] (已繳費)`);
          currentIdx = nextIdx;
          remainingMin = buckets[nextIdx].purchasedHours * 60 + remainingMin;
          console.log(`    新 bucket 剩餘 ${remainingMin}min`);
        } else {
          console.log(`  → Bucket[${currentIdx}] 耗盡，無下一個 bucket → ⚠️ 產生未繳費 cycle`);
          const renewalDate = (i + 1 < futureEvents.length) ? futureEvents[i + 1].date : '(無)';
          console.log(`    expiryDate=${evt.date}, renewalDate=${renewalDate}`);
          break;
        }
      }
    }

    if (remainingMin > 0) {
      console.log(`  → 模擬結束，仍有剩餘 ${remainingMin}min — 不會產生未繳費 cycle`);
    }
  }

  console.log('');
}

main().catch(console.error);
