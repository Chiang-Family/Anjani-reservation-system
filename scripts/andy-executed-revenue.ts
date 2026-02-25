/**
 * 查詢腳本：列出 Andy 教練每位學員本月已執行收入
 *
 * 使用方式：
 *   npx tsx --env-file=.env.local scripts/andy-executed-revenue.ts
 */

import { findCoachByName } from '../src/lib/notion/coaches';
import { getStudentsByCoachId } from '../src/lib/notion/students';
import { getPaymentsByStudents } from '../src/lib/notion/payments';
import { getCheckinsByCoach } from '../src/lib/notion/checkins';
import { nowTaipei, computeDurationMinutes } from '../src/lib/utils/date';
import type { Student, PaymentRecord, CheckinRecord } from '../src/types';

async function main() {
  const now = nowTaipei();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = String(month).padStart(2, '0');
  const monthPrefix = `${year}-${monthStr}`;

  // 1. 找 Andy 教練
  const coach = await findCoachByName('Andy');
  if (!coach) { console.error('找不到 Andy 教練'); process.exit(1); }

  // 2. 取得學員、付款、打卡
  const students = await getStudentsByCoachId(coach.id);
  const [payments, allCheckins] = await Promise.all([
    getPaymentsByStudents(students.map(s => s.id)),
    getCheckinsByCoach(coach.id),
  ]);

  // 3. 建立 lookup maps
  const studentById = new Map<string, Student>(students.map(s => [s.id, s]));

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
  // studentId → 時薪
  const priceByStudentId = new Map<string, number>();
  for (const s of students) {
    if (priceMap.has(s.name)) priceByStudentId.set(s.id, priceMap.get(s.name)!);
  }

  // 5. 過濾本月打卡
  const monthCheckins = allCheckins.filter(c => c.classDate.startsWith(monthPrefix));

  // 6. 依學員 ID 分組打卡，計算執行收入
  const checkinsByStudentId = new Map<string, CheckinRecord[]>();
  for (const c of monthCheckins) {
    if (!checkinsByStudentId.has(c.studentId)) checkinsByStudentId.set(c.studentId, []);
    checkinsByStudentId.get(c.studentId)!.push(c);
  }

  // 7. 輸出（依執行收入降序）
  const rocYear = year - 1911;
  console.log(`=== ${rocYear}/${monthStr} Andy 教練學員已執行收入 ===\n`);

  interface Row { name: string; checkins: CheckinRecord[]; price: number; revenue: number; }
  const rows: Row[] = [];

  for (const s of students) {
    const checkins = checkinsByStudentId.get(s.id) ?? [];
    const price = priceByStudentId.get(s.id) ?? 0;
    const revenue = checkins.reduce((sum, c) => sum + (c.durationMinutes / 60) * price, 0);
    rows.push({ name: s.name, checkins, price, revenue });
  }

  rows.sort((a, b) => b.revenue - a.revenue);

  let totalClasses = 0;
  for (const { name, checkins, price, revenue } of rows) {
    const revenueRounded = Math.round(revenue);
    const sorted = [...checkins].sort((a, b) => a.classDate.localeCompare(b.classDate));
    const detail = sorted.map(c => `${c.classDate} ${c.classTimeSlot}（${c.durationMinutes}分）`).join('、');
    console.log(`${name.padEnd(8)} ${checkins.length}堂  時薪$${Math.round(price)}  $${revenueRounded}  ${detail || '無打卡'}`);
    totalClasses += checkins.length;
  }

  const total = Math.round(rows.reduce((sum, r) => sum + r.revenue, 0));
  console.log(`\n合計：${totalClasses} 堂，已執行收入：$${total}`);
}

main().catch(err => { console.error('執行失敗：', err); process.exit(1); });
