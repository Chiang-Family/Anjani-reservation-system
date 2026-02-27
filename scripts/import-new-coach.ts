/**
 * 新教練 + 學員資料匯入腳本
 *
 * 功能：
 *   1. 在 Notion 建立教練記錄（若已存在則跳過）
 *   2. 依學員清單建立 Notion 學員記錄
 *   3. 從 Google Calendar 撈取歷史上課事件，建立打卡紀錄
 *   4. 建立本期繳費紀錄（狀態：已繳費）
 *
 * 使用方式：
 *   npx tsx --env-file=.env.local scripts/import-new-coach.ts
 *
 * ⚠️  請先將 DRY_RUN 設為 true 確認輸出無誤，再改為 false 執行真正寫入。
 */

import { getNotionClient } from '../src/lib/notion/client';
import { getEnv } from '../src/lib/config/env';
import { COACH_PROPS } from '../src/lib/notion/types';
import { createStudent } from '../src/lib/notion/students';
import { createCheckinRecord } from '../src/lib/notion/checkins';
import { createPaymentRecord } from '../src/lib/notion/payments';
import { getEventsForDateRange } from '../src/lib/google/calendar';

// ─────────────────────────────────────────────
// ★ 請在此填入資料 ★
// ─────────────────────────────────────────────

/** true = 只印出計畫，不真的寫入 Notion（確認正確後再改為 false） */
const DRY_RUN = false;

/** 新教練基本資料 */
const COACH_INFO = {
  name: '鈺媖',
  lineUserId: 'Uxxxxxxxxxx',  // ← 填入鈺媖的 LINE User ID（U 開頭，若已手動建立可忽略）
};

/**
 * 學員資料表
 * - name:              學員姓名（必須和 Google Calendar 事件標題完全一致）
 * - pricePerHour:      每小時單價（元），1 堂 = 60 分鐘 = 1 小時
 * - sessionsPerPeriod: 每期購買堂數
 * - firstClassDate:    最近一期首堂日期（YYYY-MM-DD），作為繳費期別 & 打卡撈取起點
 * - lastClassDate:     最近一次上課日期（YYYY-MM-DD），打卡撈取終點
 */
const STUDENTS: Array<{
  name: string;
  pricePerHour: number;
  sessionsPerPeriod: number;
  firstClassDate: string;
  lastClassDate: string;
}> = [
  // 民國 114 = 2025, 115 = 2026
  { name: '張樺恩', pricePerHour: 1200, sessionsPerPeriod: 10, firstClassDate: '2026-02-23', lastClassDate: '2026-02-23' },
  { name: '郭冠伶', pricePerHour: 850,  sessionsPerPeriod: 5,  firstClassDate: '2026-01-02', lastClassDate: '2026-02-24' },
  { name: '辛娟琦', pricePerHour: 1300, sessionsPerPeriod: 10, firstClassDate: '2025-12-30', lastClassDate: '2026-02-24' },
  { name: '林麗郁', pricePerHour: 1000, sessionsPerPeriod: 10, firstClassDate: '2025-11-14', lastClassDate: '2026-01-16' },
  { name: '郭桂玲', pricePerHour: 1200, sessionsPerPeriod: 10, firstClassDate: '2026-01-14', lastClassDate: '2026-02-25' },
];

// ─────────────────────────────────────────────

async function createCoachIfNeeded(
  notion: ReturnType<typeof getNotionClient>,
  env: ReturnType<typeof getEnv>,
): Promise<string> {
  // 查是否已存在同名教練
  const res = await notion.databases.query({
    database_id: env.NOTION_COACHES_DB_ID,
    filter: { property: COACH_PROPS.NAME, title: { equals: COACH_INFO.name } },
    page_size: 1,
  });

  if (res.results.length > 0) {
    const existingId = res.results[0].id;
    console.log(`✅ 教練已存在，跳過建立：${COACH_INFO.name} (${existingId})`);
    return existingId;
  }

  if (DRY_RUN) {
    console.log(`[DRY_RUN] 將建立教練：${COACH_INFO.name}（LINE: ${COACH_INFO.lineUserId}）`);
    return '__COACH_ID_PLACEHOLDER__';
  }

  const page = await notion.pages.create({
    parent: { database_id: env.NOTION_COACHES_DB_ID },
    properties: {
      [COACH_PROPS.NAME]: {
        title: [{ type: 'text', text: { content: COACH_INFO.name } }],
      },
      [COACH_PROPS.LINE_USER_ID]: {
        rich_text: [{ type: 'text', text: { content: COACH_INFO.lineUserId } }],
      },
      [COACH_PROPS.STATUS]: {
        select: { name: '啟用' },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });

  console.log(`✅ 教練已建立：${COACH_INFO.name} (${page.id})`);
  return page.id;
}

async function importStudent(
  coachId: string,
  studentData: typeof STUDENTS[number],
): Promise<void> {
  const { name, pricePerHour, sessionsPerPeriod, firstClassDate, lastClassDate } = studentData;
  console.log(`\n──── 匯入學員：${name} ────`);

  // 1. 建立學員記錄
  let studentId: string;
  if (DRY_RUN) {
    console.log(`[DRY_RUN] 將建立學員：${name}（套時數，教練 ID: ${coachId}）`);
    studentId = `__${name}_ID__`;
  } else {
    const student = await createStudent({ name, coachId, paymentType: '多堂' });
    studentId = student.id;
    console.log(`✅ 學員已建立：${name} (${studentId})`);
  }

  // 2. 從 Google Calendar 撈取該期間內符合姓名的事件
  const allEvents = await getEventsForDateRange(firstClassDate, lastClassDate);
  const matchedEvents = allEvents.filter(e => e.summary.trim() === name);
  console.log(`📅 ${firstClassDate} ~ ${lastClassDate}：找到 ${matchedEvents.length} 筆符合「${name}」的行事曆事件`);

  if (allEvents.length > 0 && matchedEvents.length === 0) {
    const seen = [...new Set(allEvents.map(e => e.summary.trim()))].slice(0, 5);
    console.log(`   ⚠️  該期間有事件但無精確比對，範例事件名稱：${seen.join('、')}`);
  }

  // 3. 建立打卡紀錄
  for (const ev of matchedEvents) {
    if (DRY_RUN) {
      console.log(`[DRY_RUN]   打卡：${ev.date} ${ev.startTime}-${ev.endTime}`);
    } else {
      await createCheckinRecord({
        studentName: name,
        studentId,
        coachId,
        classDate: ev.date,
        classStartTime: ev.start,
        classEndTime: ev.end,
        checkinTime: ev.start,
      });
      console.log(`  ✅ 打卡已建立：${ev.date} ${ev.startTime}-${ev.endTime}`);
    }
  }

  // 4. 建立本期繳費紀錄（status = 已繳費）
  const totalPaid = pricePerHour * sessionsPerPeriod;
  if (DRY_RUN) {
    console.log(
      `[DRY_RUN] 將建立繳費：${sessionsPerPeriod} 堂 × ${pricePerHour} 元 = ${totalPaid} 元` +
      `，期別 ${firstClassDate}，狀態：已繳費`,
    );
  } else {
    await createPaymentRecord({
      studentId,
      studentName: name,
      coachId,
      purchasedHours: sessionsPerPeriod,
      pricePerHour,
      paidAmount: totalPaid,
      status: '已繳費',
      periodDate: firstClassDate,
      overrideDate: firstClassDate,
    });
    console.log(`✅ 繳費紀錄已建立：${sessionsPerPeriod} 堂 × ${pricePerHour} = ${totalPaid} 元`);
  }
}

async function main() {
  if (STUDENTS.length === 0) {
    console.error('❌ 請先填入 STUDENTS 學員資料！');
    process.exit(1);
  }
  if (COACH_INFO.name === '教練姓名') {
    console.error('❌ 請先填入 COACH_INFO.name 教練姓名！');
    process.exit(1);
  }


  console.log(DRY_RUN ? '🔍 DRY RUN 模式（不寫入 Notion）' : '🚀 正式執行（寫入 Notion）');
  console.log(`教練：${COACH_INFO.name} | 學員：${STUDENTS.length} 位\n`);

  const notion = getNotionClient();
  const env = getEnv();

  const coachId = await createCoachIfNeeded(notion, env);

  for (const student of STUDENTS) {
    await importStudent(coachId, student);
  }

  console.log('\n🎉 完成！');
}

main().catch(err => {
  console.error('執行失敗：', err);
  process.exit(1);
});
