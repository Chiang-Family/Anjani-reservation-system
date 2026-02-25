/**
 * Debug 腳本：追蹤指定學員的續約預測計算過程
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

async function main() {
  const keyword = process.argv[2] || '';
  if (!keyword) {
    console.error('請提供學員名稱，例如：npx tsx --env-file=.env.local scripts/debug-renewal.ts 郭澄棠');
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

  if (targets.length === 0) {
    console.log(`找不到學員：${keyword}`);
    return;
  }

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
    console.log(`\n${'='.repeat(60)}`);
    console.log(`學員：${student.name} (id: ${student.id.slice(0, 8)}...)`);
    console.log(`relatedStudentIds: ${JSON.stringify(student.relatedStudentIds ?? [])}`);

    const studentPayments = paymentsByStudentId.get(student.id) ?? [];
    console.log(`\n付款紀錄（${studentPayments.length} 筆）：`);
    for (const p of studentPayments) {
      console.log(`  createdAt=${p.createdAt}  actualDate=${p.actualDate}  hours=${p.purchasedHours}  paid=$${p.paidAmount}  status=${p.status}`);
    }

    if (studentPayments.length === 0) {
      console.log('  ⚠️  無付款紀錄 → 副學員，buckets.length=0，已跳過');
      continue;
    }

    const allIds = [student.id, ...(student.relatedStudentIds ?? [])];
    const combinedCheckins = allIds
      .flatMap(id => checkinsByStudentId.get(id) ?? [])
      .sort((a, b) => a.classDate.localeCompare(b.classDate));

    const { buckets } = assignCheckinsToBuckets(studentPayments, combinedCheckins);

    console.log(`\nFIFO 分桶（${buckets.length} 桶）：`);
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      const consumed = b.consumedMinutes;
      const purchased = b.purchasedHours * 60;
      const status = consumed >= purchased ? '✅ 已耗盡' : `⏳ 進行中 (剩 ${purchased - consumed} 分)`;
      console.log(`  桶 ${i}: paymentDate=${b.paymentDate}  bought=${b.purchasedHours}h  consumed=${consumed}min  ${status}  checkins=${b.checkins.length}堂`);
    }

    const primaryFutureEvents = futureEventsByStudent.get(student.name) ?? [];
    const relatedFutureEvents = (student.relatedStudentIds ?? [])
      .flatMap(id => {
        const related = studentById.get(id);
        return related ? (futureEventsByStudent.get(related.name) ?? []) : [];
      });
    const studentFutureEvents = [...primaryFutureEvents, ...relatedFutureEvents]
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    console.log(`\n未來課程（${studentFutureEvents.length} 堂）：`);
    for (const e of studentFutureEvents.slice(0, 5)) {
      const dur = computeDurationMinutes(e.startTime, e.endTime);
      console.log(`  ${e.date} ${e.startTime}-${e.endTime} (${dur}分)`);
    }
    if (studentFutureEvents.length > 5) console.log(`  ...（共 ${studentFutureEvents.length} 堂）`);

    // Simulate renewal cycle logic
    const activeIdx = buckets.findIndex(b => b.consumedMinutes < b.purchasedHours * 60);
    console.log(`\nactiveIdx = ${activeIdx}  monthPrefix = ${monthPrefix}`);

    if (activeIdx === -1) {
      console.log('→ 全部桶已耗盡（overflow 情況）→ 走 section 3');
    } else {
      console.log('\n模擬 while 迴圈（section 2）：');
      let currentIdx = activeIdx;
      let remainingMin = buckets[currentIdx].purchasedHours * 60 - buckets[currentIdx].consumedMinutes;
      console.log(`  起始 currentIdx=${currentIdx}  remainingMin=${remainingMin}`);

      for (let evtIdx = 0; evtIdx < studentFutureEvents.length; evtIdx++) {
        const evt = studentFutureEvents[evtIdx];
        const durMin = computeDurationMinutes(evt.startTime, evt.endTime);
        remainingMin -= durMin;
        if (remainingMin <= 0) {
          const nextIdx = currentIdx + 1;
          if (nextIdx < buckets.length) {
            console.log(`  → 桶 ${currentIdx} 在 ${evt.date} 耗盡，推進到桶 ${nextIdx}`);
            currentIdx = nextIdx;
            remainingMin = buckets[nextIdx].purchasedHours * 60 + remainingMin;
          } else {
            console.log(`  → 桶 ${currentIdx} 在 ${evt.date} 耗盡，無下一桶 → isPaid:false cycle → break`);
            break;
          }
        }
      }

      if (currentIdx + 1 < buckets.length) {
        const nextBucket = buckets[currentIdx + 1];
        const nextPayments = studentPayments.filter(p => p.createdAt === nextBucket.paymentDate);
        const actualDate = nextPayments[0]?.actualDate ?? nextBucket.paymentDate;
        console.log(`\n→ 後置檢查：currentIdx=${currentIdx}+1=${currentIdx+1} < ${buckets.length}`);
        console.log(`  nextBucket.paymentDate = ${nextBucket.paymentDate}`);
        console.log(`  nextInfo.actualDate = ${actualDate}`);
        console.log(`  renewalDate 是否符合本月 (${monthPrefix})：${actualDate.startsWith(monthPrefix) ? '✅ 是' : '❌ 否'}`);
      } else {
        console.log(`\n→ 後置檢查：currentIdx=${currentIdx}+1 >= ${buckets.length}，無預繳下一桶`);
      }
    }
  }
}

main().catch(err => { console.error('執行失敗：', err); process.exit(1); });
