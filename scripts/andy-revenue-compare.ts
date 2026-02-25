/**
 * 查詢腳本：列出 Andy 教練每位學員本月預計執行收入 vs 已執行收入
 *
 * 使用方式：
 *   npx tsx --env-file=.env.local scripts/andy-revenue-compare.ts
 */

import { findCoachByName } from '../src/lib/notion/coaches';
import { getStudentsByCoachId } from '../src/lib/notion/students';
import { getPaymentsByStudents } from '../src/lib/notion/payments';
import { getCheckinsByCoach } from '../src/lib/notion/checkins';
import { getMonthEvents } from '../src/lib/google/calendar';
import { nowTaipei, computeDurationMinutes } from '../src/lib/utils/date';
import type { StudentRecord, PaymentRecord, CheckinRecord } from '../src/types';

async function main() {
  const now = nowTaipei();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = String(month).padStart(2, '0');
  const monthPrefix = `${year}-${monthStr}`;

  // 1. 找 Andy 教練
  const coach = await findCoachByName('Andy');
  if (!coach) { console.error('找不到 Andy 教練'); process.exit(1); }

  // 2. 並行取得所有資料
  const students = await getStudentsByCoachId(coach.id);
  const [payments, allCheckins, allMonthEvents] = await Promise.all([
    getPaymentsByStudents(students.map(s => s.id)),
    getCheckinsByCoach(coach.id),
    getMonthEvents(year, month),
  ]);

  // 3. 建立 lookup maps
  const studentById = new Map<string, StudentRecord>(students.map(s => [s.id, s]));

  const paymentsByStudentId = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    if (!paymentsByStudentId.has(p.studentId)) paymentsByStudentId.set(p.studentId, []);
    paymentsByStudentId.get(p.studentId)!.push(p);
  }

  // 4. 建立 priceMap（學員名 → 時薪）
  const priceMap = new Map<string, number>();
  for (const s of students) {
    const sp = paymentsByStudentId.get(s.id);
    if (sp?.length) priceMap.set(s.name, sp[0].pricePerHour);
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
  // studentId → 時薪（供打卡收入用）
  const priceByStudentId = new Map<string, number>();
  for (const s of students) {
    if (priceMap.has(s.name)) priceByStudentId.set(s.id, priceMap.get(s.name)!);
  }

  // 5. 過濾本月行事曆（只留學員名相符的事件）
  const studentNames = new Set(students.map(s => s.name));
  const monthEvents = allMonthEvents.filter(e => studentNames.has(e.summary.trim()));

  // 6. 依學員名分組行事曆事件 → 計算預計執行收入
  const estimatedByName = new Map<string, number>();
  for (const e of monthEvents) {
    const name = e.summary.trim();
    const price = priceMap.get(name) ?? 0;
    const revenue = (computeDurationMinutes(e.startTime, e.endTime) / 60) * price;
    estimatedByName.set(name, (estimatedByName.get(name) ?? 0) + revenue);
  }

  // 7. 過濾本月打卡，依學員 ID 分組 → 計算已執行收入
  const monthCheckins = allCheckins.filter(c => c.classDate.startsWith(monthPrefix));
  const checkinsByStudentId = new Map<string, CheckinRecord[]>();
  for (const c of monthCheckins) {
    if (!checkinsByStudentId.has(c.studentId)) checkinsByStudentId.set(c.studentId, []);
    checkinsByStudentId.get(c.studentId)!.push(c);
  }

  // 8. 彙整每位學員
  interface Row {
    name: string;
    price: number;
    estimated: number;
    executed: number;
    diff: number;
  }
  const rows: Row[] = [];

  for (const s of students) {
    const price = priceByStudentId.get(s.id) ?? 0;
    const estimated = Math.round(estimatedByName.get(s.name) ?? 0);
    const checkins = checkinsByStudentId.get(s.id) ?? [];
    const executed = Math.round(checkins.reduce((sum, c) => sum + (c.durationMinutes / 60) * price, 0));
    if (estimated === 0 && executed === 0) continue; // 略過本月無課的學員
    rows.push({ name: s.name, price, estimated, executed, diff: executed - estimated });
  }

  rows.sort((a, b) => b.estimated - a.estimated);

  // 9. 輸出
  const rocYear = year - 1911;
  console.log(`=== ${rocYear}/${monthStr} Andy 教練 預計 vs 已執行收入 ===\n`);
  console.log(`${'學員'.padEnd(10)} ${'時薪'.padStart(6)}  ${'預計'.padStart(7)}  ${'已執行'.padStart(7)}  差額`);
  console.log('─'.repeat(55));

  for (const { name, price, estimated, executed, diff } of rows) {
    const priceStr = price > 0 ? `$${Math.round(price)}` : '─';
    const diffStr = diff === 0 ? '✅ 相符' : diff > 0 ? `+$${diff}` : `-$${Math.abs(diff)}`;
    console.log(
      `${name.padEnd(10)} ${priceStr.padStart(6)}  ${('$' + estimated).padStart(7)}  ${('$' + executed).padStart(7)}  ${diffStr}`
    );
  }

  const totalEstimated = Math.round(rows.reduce((sum, r) => sum + r.estimated, 0));
  const totalExecuted = Math.round(rows.reduce((sum, r) => sum + r.executed, 0));
  const totalDiff = totalExecuted - totalEstimated;
  const totalDiffStr = totalDiff === 0 ? '✅' : totalDiff > 0 ? `+$${totalDiff}` : `-$${Math.abs(totalDiff)}`;
  console.log('─'.repeat(55));
  console.log(
    `${'合計'.padEnd(10)} ${''.padStart(6)}  ${('$' + totalEstimated).padStart(7)}  ${('$' + totalExecuted).padStart(7)}  ${totalDiffStr}`
  );
}

main().catch(err => { console.error('執行失敗：', err); process.exit(1); });
