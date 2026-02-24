/**
 * Debug 腳本：列出指定學員的本月打卡明細（直接查學員，不經教練篩選）
 *
 * 使用方式：
 *   npx tsx --env-file=.env.local scripts/debug-checkins.ts
 */

import { findCoachByName } from '../src/lib/notion/coaches';
import { getStudentsByCoachId } from '../src/lib/notion/students';
import { getCheckinsByStudents } from '../src/lib/notion/checkins';
import { nowTaipei } from '../src/lib/utils/date';

// 要調查的學員姓名（模糊比對）
const TARGET_NAMES = ['許湘', '李容甄', '楊雅萍'];

async function main() {
  const now = nowTaipei();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const currentMonth = `${year}-${month}`;

  const coach = await findCoachByName('Andy');
  if (!coach) { console.error('找不到 Andy 教練'); process.exit(1); }

  const students = await getStudentsByCoachId(coach.id);
  const targets = students.filter(s =>
    TARGET_NAMES.some(t => s.name.includes(t))
  );

  if (targets.length === 0) { console.log('找不到符合的學員'); return; }

  // 直接用學員 ID 查，不受教練 relation 限制
  const allCheckins = await getCheckinsByStudents(targets.map(s => s.id));

  for (const student of targets) {
    const allStudentCheckins = allCheckins.filter(c => c.studentId === student.id);
    const monthCheckins = allStudentCheckins.filter(c => c.classDate.startsWith(currentMonth));

    console.log(`\n${'='.repeat(55)}`);
    console.log(`學員：${student.name}`);
    console.log(`本月打卡：${monthCheckins.length} 筆（全部：${allStudentCheckins.length} 筆）`);

    if (monthCheckins.length > 0) {
      console.log(`  日期          時段         教練ID是否有值`);
      for (const c of monthCheckins.sort((a, b) => a.classDate.localeCompare(b.classDate))) {
        const hasCoach = c.coachId ? '✅ 有' : '❌ 無';
        const isAndy = c.coachId === coach.id ? '（Andy）' : c.coachId ? `（其他: ${c.coachId.slice(0, 8)}）` : '';
        console.log(`  ${c.classDate}  ${c.classTimeSlot.padEnd(11)}  教練: ${hasCoach}${isAndy}`);
      }
    }
  }
}

main().catch(err => { console.error('執行失敗：', err); process.exit(1); });
