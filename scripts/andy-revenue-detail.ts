/**
 * 查詢腳本：列出 Andy 教練本月預計執行收入中，十位數和個位數不為 0 的學員明細
 *
 * 使用方式：
 *   npx tsx --env-file=.env.local scripts/andy-revenue-detail.ts
 */

import { findCoachByName } from '../src/lib/notion/coaches';
import { getStudentsByCoachId } from '../src/lib/notion/students';
import { getPaymentsByStudents } from '../src/lib/notion/payments';
import { getMonthEvents } from '../src/lib/google/calendar';
import { nowTaipei, computeDurationMinutes } from '../src/lib/utils/date';
import type { Student, PaymentRecord } from '../src/types';

async function main() {
  const now = nowTaipei();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = String(month).padStart(2, '0');

  // 1. 找 Andy 教練
  const coach = await findCoachByName('Andy');
  if (!coach) {
    console.error('找不到 Andy 教練');
    process.exit(1);
  }

  // 2. 取得學員、付款紀錄、本月行事曆
  const students = await getStudentsByCoachId(coach.id);
  const [payments, allMonthEvents] = await Promise.all([
    getPaymentsByStudents(students.map(s => s.id)),
    getMonthEvents(year, month),
  ]);

  // 3. 建立 studentById 和 paymentsByStudentId
  const studentById = new Map<string, Student>(students.map(s => [s.id, s]));
  const paymentsByStudentId = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    if (!paymentsByStudentId.has(p.studentId)) {
      paymentsByStudentId.set(p.studentId, []);
    }
    paymentsByStudentId.get(p.studentId)!.push(p);
  }

  // 4. 建立 priceMap（學員名 → 時薪）
  const priceMap = new Map<string, number>();
  for (const s of students) {
    const sp = paymentsByStudentId.get(s.id);
    if (sp?.length) {
      priceMap.set(s.name, sp[0].pricePerHour);
    }
  }
  // 副學員繼承主學員時薪
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

  // 5. 過濾本月行事曆只留有學員名的事件
  const studentNames = new Set(students.map(s => s.name));
  const events = allMonthEvents.filter(e => studentNames.has(e.summary.trim()));

  // 6. 計算每位學員的本月預計執行收入（各堂明細）
  interface EventDetail {
    date: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    revenue: number;
  }
  const revenueByStudent = new Map<string, { price: number; events: EventDetail[] }>();

  for (const event of events) {
    const name = event.summary.trim();
    const price = priceMap.get(name) ?? 0;
    const durationMinutes = computeDurationMinutes(event.startTime, event.endTime);
    const revenue = (durationMinutes / 60) * price;

    if (!revenueByStudent.has(name)) {
      revenueByStudent.set(name, { price, events: [] });
    }
    revenueByStudent.get(name)!.events.push({
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      durationMinutes,
      revenue,
    });
  }

  // 7. 過濾：執行收入四捨五入後，十位數或個位數不為 0（即 % 100 !== 0）
  const rocYear = year - 1911;
  console.log(`=== ${rocYear}/${monthStr} Andy 教練預計執行收入（非整百學員）===\n`);

  let found = false;
  for (const [name, data] of [...revenueByStudent.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const totalRevenue = Math.round(data.events.reduce((sum, e) => sum + e.revenue, 0));
    if (totalRevenue % 100 === 0) continue;

    found = true;
    console.log(`【${name}】時薪 $${data.price}，本月預計執行收入：$${totalRevenue}`);
    for (const e of data.events.sort((a, b) => a.date.localeCompare(b.date))) {
      const revRounded = Math.round(e.revenue * 100) / 100;
      console.log(`  ${e.date} ${e.startTime}-${e.endTime}（${e.durationMinutes} 分）→ $${revRounded.toFixed(2)}`);
    }
    console.log('');
  }

  if (!found) {
    console.log('所有學員的預計執行收入均為整百（無非整百學員）');
  }
}

main().catch(err => {
  console.error('執行失敗：', err);
  process.exit(1);
});
