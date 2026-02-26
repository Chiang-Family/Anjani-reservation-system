/**
 * Debug 腳本：追蹤指定學員的續約預測計算過程（含所有 section 和補充邏輯）
 *
 * 使用方式：
 *   npx tsx --env-file=.env.local scripts/debug-renewal.ts <學員名稱>
 */

import { findCoachByName } from '../src/lib/notion/coaches';
import { getStudentsByCoachId } from '../src/lib/notion/students';
import { getPaymentsByStudents } from '../src/lib/notion/payments';
import { getCheckinsByCoach } from '../src/lib/notion/checkins';
import { getEventsForDateRange } from '../src/lib/google/calendar';
import { assignCheckinsToBuckets } from '../src/lib/notion/hours';
import { nowTaipei, todayDateString, computeDurationMinutes } from '../src/lib/utils/date';
import { format, addMonths } from 'date-fns';
import type { CalendarEvent, CheckinRecord, PaymentRecord } from '../src/types';

// Mirrors findRenewalCycles logic from stats.service.ts
function simulateCycles(
  buckets: { paymentDate: string; purchasedHours: number; checkins: CheckinRecord[]; consumedMinutes: number }[],
  futureEvents: CalendarEvent[],
  payments: PaymentRecord[],
  monthPrefix: string,
): void {
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
  const pastEnd = activeIdx === -1 ? buckets.length : activeIdx;

  const cycles: { section: string; renewalDate: string; isPaid: boolean; expectedAmount: number }[] = [];

  // Section 1
  console.log('\n--- Section 1（過去已耗盡的桶）---');
  for (let i = 0; i < pastEnd; i++) {
    if (buckets[i].checkins.length === 0 || i + 1 >= buckets.length) {
      console.log(`  i=${i}: checkins=${buckets[i].checkins.length}, i+1=${i+1} vs len=${buckets.length} → skip`);
      continue;
    }
    const nextInfo = getBucketInfo(i + 1);
    console.log(`  i=${i}: emit cycle → renewalDate=${nextInfo.actualDate} isPaid:true $${nextInfo.totalAmount}`);
    cycles.push({ section: 'S1', renewalDate: nextInfo.actualDate, isPaid: true, expectedAmount: nextInfo.totalAmount });
  }

  // Section 2
  console.log('\n--- Section 2（模擬未來消耗）---');
  if (activeIdx !== -1) {
    let currentIdx = activeIdx;
    let remainingMin = buckets[currentIdx].purchasedHours * 60 - buckets[currentIdx].consumedMinutes;
    console.log(`  activeIdx=${activeIdx}, remainingMin=${remainingMin}`);
    let broke = false;
    for (let evtIdx = 0; evtIdx < futureEvents.length; evtIdx++) {
      const evt = futureEvents[evtIdx];
      const durMin = computeDurationMinutes(evt.startTime, evt.endTime);
      remainingMin -= durMin;
      if (remainingMin <= 0) {
        const nextIdx = currentIdx + 1;
        if (nextIdx < buckets.length) {
          const nextInfo = getBucketInfo(nextIdx);
          console.log(`  ${evt.date}: 桶${currentIdx}耗盡 → 推進到桶${nextIdx}, emit renewalDate=${nextInfo.actualDate}`);
          cycles.push({ section: 'S2', renewalDate: nextInfo.actualDate, isPaid: true, expectedAmount: nextInfo.totalAmount });
          currentIdx = nextIdx;
          remainingMin = buckets[nextIdx].purchasedHours * 60 + remainingMin;
        } else {
          console.log(`  ${evt.date}: 桶${currentIdx}耗盡，無下一桶 → isPaid:false cycle → break`);
          cycles.push({ section: 'S2', renewalDate: evt.date, isPaid: false, expectedAmount: 0 });
          broke = true;
          break;
        }
      }
    }
    // Post-loop pre-paid check
    if (!broke && currentIdx + 1 < buckets.length) {
      const nextInfo = getBucketInfo(currentIdx + 1);
      console.log(`  後置預繳：桶${currentIdx+1} renewalDate=${nextInfo.actualDate}`);
      cycles.push({ section: 'S2-post', renewalDate: nextInfo.actualDate, isPaid: true, expectedAmount: nextInfo.totalAmount });
    }
  } else {
    console.log('  activeIdx=-1，section 2 不執行');
  }

  // Section 3
  console.log('\n--- Section 3（overflow，全部耗盡）---');
  if (activeIdx === -1 && buckets.length > 0) {
    const lastBucket = buckets[buckets.length - 1];
    const renewalDate = futureEvents.length > 0 ? futureEvents[0].date : '';
    console.log(`  emit isPaid:false cycle → renewalDate=${renewalDate || '(空)'}`);
    cycles.push({ section: 'S3', renewalDate, isPaid: false, expectedAmount: 0 });
  } else {
    console.log('  不走 section 3');
  }

  // Supplementary check
  console.log('\n--- 補充邏輯（capturedRenewalDates）---');
  const activeIdxForSupp = buckets.findIndex(b => b.consumedMinutes < b.purchasedHours * 60);
  if (activeIdxForSupp >= 0) {
    const activePlusFutureDates = new Set(buckets.slice(activeIdxForSupp).map(b => b.paymentDate));
    console.log(`  activeIdxForSupp=${activeIdxForSupp}, activePlusFutureDates=${JSON.stringify([...activePlusFutureDates])}`);
    const capturedRenewalDates = new Set(cycles.map(c => c.renewalDate));
    console.log(`  capturedRenewalDates = ${JSON.stringify([...capturedRenewalDates])}`);
    for (const p of payments) {
      if (!p.actualDate.startsWith(monthPrefix)) continue;
      if (capturedRenewalDates.has(p.actualDate)) {
        console.log(`  payment actualDate=${p.actualDate}: 已被捕捉 → skip`);
        continue;
      }
      if (!activePlusFutureDates.has(p.createdAt)) {
        console.log(`  payment actualDate=${p.actualDate}: 屬於舊桶 → skip`);
        continue;
      }
      const sameDatePayments = payments.filter(sp => sp.createdAt === p.createdAt);
      const total = sameDatePayments.reduce((s, sp) => s + sp.totalAmount, 0);
      console.log(`  payment actualDate=${p.actualDate}: 未捕捉 → emit renewalDate=${p.actualDate} $${total}`);
      cycles.push({ section: 'SUPP', renewalDate: p.actualDate, isPaid: true, expectedAmount: total });
      capturedRenewalDates.add(p.actualDate);
    }
  } else if (buckets.length > 0) {
    console.log('  activeIdx=-1（全部耗盡）→ 只檢查最後一桶是否本月未捕捉');
    const capturedRenewalDates = new Set(cycles.map(c => c.renewalDate));
    console.log(`  capturedRenewalDates = ${JSON.stringify([...capturedRenewalDates])}`);
    const lastBucketDate = buckets[buckets.length - 1].paymentDate;
    console.log(`  lastBucketDate = ${lastBucketDate}`);
    for (const p of payments) {
      if (p.createdAt !== lastBucketDate) continue;
      if (!p.actualDate.startsWith(monthPrefix)) continue;
      if (capturedRenewalDates.has(p.actualDate)) {
        console.log(`  payment actualDate=${p.actualDate}: 已被捕捉 → skip`);
        continue;
      }
      const sameDatePayments = payments.filter(sp => sp.createdAt === p.createdAt);
      const total = sameDatePayments.reduce((s, sp) => s + sp.totalAmount, 0);
      console.log(`  payment actualDate=${p.actualDate}: 未捕捉（最後桶）→ emit renewalDate=${p.actualDate} $${total}`);
      cycles.push({ section: 'SUPP-last', renewalDate: p.actualDate, isPaid: true, expectedAmount: total });
      capturedRenewalDates.add(p.actualDate);
    }
  } else {
    console.log('  buckets 為空 → 跳過');
  }

  // Final filter
  console.log('\n--- 最終過濾（只保留本月 renewalDate）---');
  const shown = cycles.filter(c => c.renewalDate !== '' && c.renewalDate.startsWith(monthPrefix));
  if (shown.length === 0) {
    console.log('  ❌ 無符合本月的 cycle → 不出現在名單');
  } else {
    for (const c of shown) {
      console.log(`  ✅ [${c.section}] renewalDate=${c.renewalDate} isPaid=${c.isPaid} $${c.expectedAmount}`);
    }
    console.log(`  → 共出現 ${shown.length} 次`);
  }
}

async function main() {
  const keyword = process.argv[2] || '';
  if (!keyword) {
    console.error('請提供學員名稱，例如：npx tsx --env-file=.env.local scripts/debug-renewal.ts 李容甄陸秀儀');
    process.exit(1);
  }

  const now = nowTaipei();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  const coach = await findCoachByName('Andy');
  if (!coach) { console.error('找不到 Andy 教練'); process.exit(1); }

  const students = await getStudentsByCoachId(coach.id);
  const targets = students.filter(s => s.name.includes(keyword));
  if (targets.length === 0) { console.log(`找不到學員：${keyword}`); return; }

  const today = todayDateString();
  const futureEnd = format(addMonths(now, 4), 'yyyy-MM-dd');
  const [payments, allCheckins, allFutureEvents] = await Promise.all([
    getPaymentsByStudents(students.map(s => s.id)),
    getCheckinsByCoach(coach.id),
    getEventsForDateRange(today, futureEnd),
  ]);

  const studentById = new Map(students.map(s => [s.id, s]));
  const checkinsByStudentId = new Map<string, CheckinRecord[]>();
  for (const c of allCheckins) {
    if (!checkinsByStudentId.has(c.studentId)) checkinsByStudentId.set(c.studentId, []);
    checkinsByStudentId.get(c.studentId)!.push(c);
  }
  const paymentsByStudentId = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    if (!paymentsByStudentId.has(p.studentId)) paymentsByStudentId.set(p.studentId, []);
    paymentsByStudentId.get(p.studentId)!.push(p);
  }
  const studentNames = new Set(students.map(s => s.name));
  const futureEvents = allFutureEvents.filter(e => studentNames.has(e.summary.trim()));
  const futureEventsByStudent = new Map<string, CalendarEvent[]>();
  for (const e of futureEvents) {
    const name = e.summary.trim();
    if (!futureEventsByStudent.has(name)) futureEventsByStudent.set(name, []);
    futureEventsByStudent.get(name)!.push(e);
  }

  for (const student of targets) {
    console.log(`\n${'='.repeat(65)}`);
    console.log(`學員：${student.name}`);

    const studentPayments = paymentsByStudentId.get(student.id) ?? [];
    console.log(`付款紀錄（${studentPayments.length} 筆）：`);
    for (const p of studentPayments) {
      console.log(`  createdAt=${p.createdAt}  actualDate=${p.actualDate}  $${p.totalAmount}`);
    }

    if (studentPayments.length === 0) { console.log('  副學員，跳過'); continue; }

    const allIds = [student.id, ...(student.relatedStudentIds ?? [])];
    const combinedCheckins = allIds
      .flatMap(id => checkinsByStudentId.get(id) ?? [])
      .sort((a, b) => a.classDate.localeCompare(b.classDate));
    const { buckets } = assignCheckinsToBuckets(studentPayments, combinedCheckins);

    console.log(`分桶（${buckets.length} 桶）：`);
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      const status = b.consumedMinutes >= b.purchasedHours * 60 ? '已耗盡' : `進行中(剩${b.purchasedHours*60-b.consumedMinutes}分)`;
      console.log(`  桶${i}: paymentDate=${b.paymentDate} ${b.purchasedHours}h consumed=${b.consumedMinutes}min ${status}`);
    }

    const primaryFutureEvents = futureEventsByStudent.get(student.name) ?? [];
    const relatedFutureEvents = (student.relatedStudentIds ?? [])
      .flatMap(id => { const r = studentById.get(id); return r ? (futureEventsByStudent.get(r.name) ?? []) : []; });
    const studentFutureEvents = [...primaryFutureEvents, ...relatedFutureEvents]
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    console.log(`未來課程：${studentFutureEvents.length} 堂（前3：${studentFutureEvents.slice(0,3).map(e=>e.date).join(', ')}）`);

    simulateCycles(buckets, studentFutureEvents, studentPayments, monthPrefix);
  }
}

main().catch(err => { console.error('執行失敗：', err); process.exit(1); });
