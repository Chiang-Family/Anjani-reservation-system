/**
 * 診斷腳本：檢查昨天/今天的打卡記錄，確認學員是否有 LINE User ID
 * 用法：npx tsx scripts/check-notifications.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from '@notionhq/client';

// 手動載入 .env.local
const envPath = resolve(import.meta.dirname ?? __dirname, '..', '.env.local');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) {
    let val = m[2].trim();
    // 移除包裹的引號
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1].trim()] = val;
  }
}

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const CHECKIN_DB = process.env.NOTION_CHECKIN_DB_ID!;
const STUDENTS_DB = process.env.NOTION_STUDENTS_DB_ID!;

function getRichText(prop: any): string {
  if (prop?.type === 'title') return prop.title?.[0]?.plain_text ?? '';
  if (prop?.type === 'rich_text') return prop.rich_text?.[0]?.plain_text ?? '';
  return '';
}

function getRelationIds(prop: any): string[] {
  return prop?.relation?.map((r: any) => r.id) ?? [];
}

function getDateValue(prop: any): string {
  if (prop?.type === 'date') return prop.date?.start ?? '';
  return '';
}

async function main() {
  // 取得昨天和今天的日期
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  console.log(`\n📅 檢查日期：${yesterday}（昨天）、${today}（今天）\n`);

  // 查詢打卡記錄（用課程時段日期篩選）
  const checkins = await notion.databases.query({
    database_id: CHECKIN_DB,
    filter: {
      property: '課程時段',
      date: { on_or_after: yesterday },
    },
    sorts: [{ property: '課程時段', direction: 'ascending' }],
  });

  if (checkins.results.length === 0) {
    console.log('❌ 沒有找到打卡記錄');
    return;
  }

  // 收集所有學員 ID
  const studentIds = new Set<string>();
  const checkinData: Array<{
    title: string;
    studentId: string;
    date: string;
    timeSlot: string;
  }> = [];

  for (const page of checkins.results) {
    const props = (page as any).properties;
    const title = getRichText(props['標題']);
    const studentRel = getRelationIds(props['學員']);
    const timeSlot = getDateValue(props['課程時段']);
    const dateStr = timeSlot.slice(0, 10);

    if (dateStr !== today && dateStr !== yesterday) continue;

    const studentId = studentRel[0] || '';
    if (studentId) studentIds.add(studentId);
    checkinData.push({ title, studentId, date: dateStr, timeSlot });
  }

  // 批次查詢學員資料
  const studentMap = new Map<string, { name: string; lineUserId: string }>();
  for (const sid of studentIds) {
    try {
      const page = await notion.pages.retrieve({ page_id: sid });
      const props = (page as any).properties;
      const name = getRichText(props['姓名']);
      const lineUserId = getRichText(props['LINE User ID']);
      studentMap.set(sid, { name, lineUserId });
    } catch {
      studentMap.set(sid, { name: '(查詢失敗)', lineUserId: '' });
    }
  }

  // 輸出結果
  console.log('='.repeat(70));
  console.log('打卡記錄 & 學員 LINE 綁定狀態');
  console.log('='.repeat(70));

  for (const c of checkinData) {
    const student = studentMap.get(c.studentId);
    const hasLine = student?.lineUserId ? '✅ 已綁定' : '❌ 未綁定';
    const lineId = student?.lineUserId ? `(${student.lineUserId.slice(0, 10)}...)` : '';
    console.log(
      `${c.date} | ${c.title.padEnd(25)} | ${(student?.name ?? '?').padEnd(8)} | ${hasLine} ${lineId}`
    );
  }

  console.log('\n' + '='.repeat(70));

  // 統計未綁定的學員
  const unbound = checkinData.filter(c => {
    const s = studentMap.get(c.studentId);
    return !s?.lineUserId;
  });

  if (unbound.length > 0) {
    console.log(`\n⚠️  以下 ${unbound.length} 筆打卡的學員未綁定 LINE：`);
    for (const c of unbound) {
      const student = studentMap.get(c.studentId);
      console.log(`  • ${c.date} ${student?.name ?? '?'} — ${c.title}`);
    }
  } else {
    console.log('\n✅ 所有打卡的學員都已綁定 LINE');
  }
}

main().catch(console.error);
