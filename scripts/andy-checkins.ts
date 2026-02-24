/**
 * 查詢腳本：列出 Andy 教練學員姓名和本月已打卡堂數
 *
 * 使用方式：
 *   npx tsx --env-file=.env.local scripts/andy-checkins.ts
 */

import { findCoachByName } from '../src/lib/notion/coaches';
import { getStudentsByCoachId } from '../src/lib/notion/students';
import { getCheckinsByCoach } from '../src/lib/notion/checkins';
import { nowTaipei } from '../src/lib/utils/date';

async function main() {
  const now = nowTaipei();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const currentMonth = `${year}-${month}`;

  // 1. 找 Andy 教練
  const coach = await findCoachByName('Andy');
  if (!coach) {
    console.error('找不到 Andy 教練');
    process.exit(1);
  }
  console.log(`✅ 找到教練：Andy (${coach.id})\n`);

  // 2. 取得 Andy 名下所有學員
  const students = await getStudentsByCoachId(coach.id);
  console.log(`📋 共 ${students.length} 位學員：${students.map(s => s.name).join('、')}\n`);

  // 3. 取得本月所有打卡紀錄（依上課日期篩選）
  const allCheckins = await getCheckinsByCoach(coach.id);
  const monthCheckins = allCheckins.filter(c => c.classDate.startsWith(currentMonth));
  console.log(`🗓️  ${currentMonth} 打卡紀錄共 ${monthCheckins.length} 筆\n`);

  // 4. 以學員 ID 統計
  const countMap = new Map<string, number>();
  for (const c of monthCheckins) {
    if (c.studentId) {
      countMap.set(c.studentId, (countMap.get(c.studentId) ?? 0) + 1);
    }
  }

  // 5. 輸出結果（依堂數降序）
  const rocYear = year - 1911;
  console.log(`=== ${rocYear}/${month} Andy 教練學員已打卡堂數 ===\n`);
  const sorted = students
    .map(s => ({ name: s.name, count: countMap.get(s.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  for (const { name, count } of sorted) {
    console.log(`  ${name.padEnd(10)}：${count} 堂`);
  }

  const total = sorted.reduce((sum, s) => sum + s.count, 0);
  console.log(`\n  合計：${total} 堂`);
}

main().catch(err => {
  console.error('執行失敗：', err);
  process.exit(1);
});
