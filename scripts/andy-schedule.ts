/**
 * 臨時查詢腳本：列出 Andy 教練本月每位學員的預約堂數
 *
 * 使用方式：
 *   npx tsx --env-file=.env.local scripts/andy-schedule.ts
 */

import { getNotionClient } from '../src/lib/notion/client';
import { getEnv } from '../src/lib/config/env';
import { COACH_PROPS, STUDENT_PROPS } from '../src/lib/notion/types';
import { getMonthEvents } from '../src/lib/google/calendar';
import { nowTaipei } from '../src/lib/utils/date';

async function main() {
  const env = getEnv();
  const notion = getNotionClient();
  const now = nowTaipei();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 1. 找 Andy 教練
  const coachRes = await notion.databases.query({
    database_id: env.NOTION_COACHES_DB_ID,
    filter: {
      property: COACH_PROPS.NAME,
      title: { equals: 'Andy' },
    },
    page_size: 1,
  });

  if (coachRes.results.length === 0) {
    console.error('找不到 Andy 教練');
    process.exit(1);
  }

  const coach = coachRes.results[0];
  const coachId = coach.id;
  console.log(`✅ 找到教練：Andy (${coachId})\n`);

  // 2. 取得 Andy 名下所有學員
  const studentRes = await notion.databases.query({
    database_id: env.NOTION_STUDENTS_DB_ID,
    filter: {
      property: STUDENT_PROPS.COACH,
      relation: { contains: coachId },
    },
  });

  const students = studentRes.results.map((page: any) => {
    const props = page.properties;
    const nameProp = props[STUDENT_PROPS.NAME];
    const name = nameProp?.title?.[0]?.plain_text ?? '(無名)';
    return { id: page.id, name };
  });

  console.log(`📋 共 ${students.length} 位學員：${students.map(s => s.name).join('、')}\n`);

  // 3. 取得本月行事曆事件
  const allEvents = await getMonthEvents(year, month);
  console.log(`📅 ${year}/${String(month).padStart(2, '0')} 行事曆共 ${allEvents.length} 個事件\n`);

  // 4. 精準比對，統計每位學員的預約堂數
  const studentNames = new Set(students.map(s => s.name));
  const countMap = new Map<string, number>();

  for (const event of allEvents) {
    const summary = event.summary.trim();
    if (studentNames.has(summary)) {
      countMap.set(summary, (countMap.get(summary) ?? 0) + 1);
    }
  }

  // 5. 輸出結果
  console.log(`=== ${year}/${String(month).padStart(2, '0')} Andy 教練學員預約堂數 ===\n`);
  const sorted = students
    .map(s => ({ name: s.name, count: countMap.get(s.name) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  for (const { name, count } of sorted) {
    console.log(`  ${name.padEnd(10)}：${count} 堂`);
  }

  const total = sorted.reduce((sum, s) => sum + s.count, 0);
  console.log(`\n  合計：${total} 堂`);

  // 6. 列出無匹配的行事曆事件（供除錯）
  const unmatched = allEvents.filter(e => !studentNames.has(e.summary.trim()));
  if (unmatched.length > 0) {
    console.log(`\n⚠️ 未匹配的行事曆事件（${unmatched.length} 個）：`);
    const unmatchedSummaries = [...new Set(unmatched.map(e => e.summary.trim()))];
    for (const s of unmatchedSummaries) {
      console.log(`  - "${s}"`);
    }
  }
}

main().catch(err => {
  console.error('執行失敗：', err);
  process.exit(1);
});
