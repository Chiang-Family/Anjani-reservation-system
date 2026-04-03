/**
 * 一次性腳本：建立 Ting 教練的學員資料
 * 用法：node --env-file=.env.local --loader tsx scripts/create-ting-students.ts
 */
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const COACHES_DB_ID = process.env.NOTION_COACHES_DB_ID!;
const STUDENTS_DB_ID = process.env.NOTION_STUDENTS_DB_ID!;

// 學員資料
const STUDENTS = [
  { name: '王道美', pricePerHour: 1300, sessions: 10 },
  { name: '吳宜瑾', pricePerHour: 1100, sessions: 10 },
  { name: '李昕諭', pricePerHour: 1200, sessions: 10 },
  { name: '李婉如', pricePerHour: 1400, sessions: 10 },
  { name: '林王素蘭', pricePerHour: 1400, sessions: 5 },
  { name: '林佳莉', pricePerHour: 1400, sessions: 10 },
  { name: '林佳儀', pricePerHour: 1400, sessions: 10 },
  { name: '林益生', pricePerHour: 1400, sessions: 10 },
  { name: '洪萱', pricePerHour: 1350, sessions: 5 },
  { name: '胡中愛', pricePerHour: 1300, sessions: 10 },
  { name: '徐立真', pricePerHour: 1300, sessions: 10 },
  { name: '高子瑛', pricePerHour: 1400, sessions: 5 },
  { name: '郭彩霞', pricePerHour: 1400, sessions: 10 },
  { name: '陳月雲', pricePerHour: 1300, sessions: 10 },
  { name: '陳妙香', pricePerHour: 1400, sessions: 10 },
  { name: '陳佳鈴', pricePerHour: 1300, sessions: 10 },
  { name: '陳貞如', pricePerHour: 1300, sessions: 10 },
  { name: '陳高山', pricePerHour: 1400, sessions: 10 },
  { name: '陳惠娟', pricePerHour: 1400, sessions: 10 },
  { name: '陳慧玲', pricePerHour: 1350, sessions: 10 },
  { name: '陸媽媽', pricePerHour: 1300, sessions: 10 },
  { name: '傅芊卉', pricePerHour: 1300, sessions: 10 },
  { name: '曾祤彤', pricePerHour: 1100, sessions: 10 },
  { name: '買美音', pricePerHour: 1400, sessions: 10 },
  { name: '黃鈺琁', pricePerHour: 1300, sessions: 10 },
  { name: '黃蘭茵', pricePerHour: 1300, sessions: 10 },
  { name: '楊玉琴', pricePerHour: 1400, sessions: 10 },
  { name: '葉進祥', pricePerHour: 1400, sessions: 10 },
  { name: '劉玉喬', pricePerHour: 1400, sessions: 10 },
  { name: '盧瑞香', pricePerHour: 1400, sessions: 10 },
  { name: '謝琳伊', pricePerHour: 1400, sessions: 10 },
  { name: '謝舒衣', pricePerHour: 1300, sessions: 10 },
  { name: '蘇淑芬', pricePerHour: 1300, sessions: 10 },
];

async function main() {
  // 1. 查詢學員資料庫結構
  console.log('=== 查詢學員資料庫結構 ===');
  const dbInfo = await notion.databases.retrieve({ database_id: STUDENTS_DB_ID });
  const props = dbInfo.properties;
  console.log('資料庫欄位：');
  for (const [key, val] of Object.entries(props)) {
    console.log(`  ${key} (${(val as { type: string }).type})`);
  }

  // 2. 查詢 Ting 教練 ID
  console.log('\n=== 查詢 Ting 教練 ===');
  const coachRes = await notion.databases.query({
    database_id: COACHES_DB_ID,
    filter: {
      property: '姓名',
      title: { equals: 'Ting' },
    },
    page_size: 1,
  });
  if (coachRes.results.length === 0) {
    // 嘗試模糊搜尋
    const allCoaches = await notion.databases.query({ database_id: COACHES_DB_ID });
    console.log('找不到 "Ting"，所有教練：');
    for (const page of allCoaches.results) {
      const p = (page as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
      const titleArr = p['姓名']?.title as Array<{ plain_text: string }> | undefined;
      console.log(`  ${titleArr?.[0]?.plain_text ?? '(無名)'} → ${(page as { id: string }).id}`);
    }
    return;
  }
  const coachId = (coachRes.results[0] as { id: string }).id;
  console.log(`Ting 教練 ID: ${coachId}`);

  // 3. 建立學員
  console.log(`\n=== 開始建立 ${STUDENTS.length} 位學員 ===`);
  let created = 0;
  for (const s of STUDENTS) {
    try {
      const properties: Record<string, unknown> = {
        '姓名': { title: [{ type: 'text', text: { content: s.name } }] },
        '所屬教練': { relation: [{ id: coachId }] },
        '收費方式': { select: { name: '多堂' } },
      };

      await notion.pages.create({
        parent: { database_id: STUDENTS_DB_ID },
        properties: properties as Parameters<typeof notion.pages.create>[0]['properties'],
      });
      created++;
      console.log(`  ✅ ${s.name} (${s.pricePerHour}/hr, ${s.sessions}堂)`);
    } catch (err) {
      console.error(`  ❌ ${s.name}:`, err);
    }
  }
  console.log(`\n完成！已建立 ${created}/${STUDENTS.length} 位學員。`);
  console.log('\n⚠️ 每小時單價和每期堂數需在建立繳費紀錄時設定。');
}

main().catch(console.error);
