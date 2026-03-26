/**
 * 測試腳本：嘗試對指定學員發送測試 push message
 * 用法：npx tsx scripts/test-push.ts [學員名稱]
 * 預設：彭富美
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from '@notionhq/client';
import { messagingApi } from '@line/bot-sdk';

// 手動載入 .env.local
const envPath = resolve(import.meta.dirname ?? __dirname, '..', '.env.local');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) {
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1].trim()] = val;
  }
}

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const STUDENTS_DB = process.env.NOTION_STUDENTS_DB_ID!;
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

function getRichText(prop: any): string {
  if (prop?.type === 'title') return prop.title?.[0]?.plain_text ?? '';
  if (prop?.type === 'rich_text') return prop.rich_text?.[0]?.plain_text ?? '';
  return '';
}

async function main() {
  const targetName = process.argv[2] || '彭富美';
  console.log(`\n🔍 查詢學員：${targetName}\n`);

  // 查詢學員
  const res = await notion.databases.query({
    database_id: STUDENTS_DB,
    filter: { property: '姓名', title: { equals: targetName } },
    page_size: 1,
  });

  if (res.results.length === 0) {
    console.log('❌ 找不到學員');
    return;
  }

  const props = (res.results[0] as any).properties;
  const name = getRichText(props['姓名']);
  const lineUserId = getRichText(props['LINE User ID']);

  console.log(`👤 姓名：${name}`);
  console.log(`🔗 LINE User ID：${lineUserId || '(無)'}`);

  if (!lineUserId) {
    console.log('❌ 學員未綁定 LINE，無法發送');
    return;
  }

  // 嘗試發送測試訊息
  console.log('\n📤 嘗試發送測試 push message...');
  try {
    await lineClient.pushMessage({
      to: lineUserId,
      messages: [{
        type: 'text',
        text: '🔔 系統測試通知\n\n這是一則測試訊息，確認打卡通知功能是否正常。\n若收到此訊息表示 LINE 推播正常運作！',
      }],
    });
    console.log('✅ 發送成功！學員應該會收到測試訊息');
  } catch (err: any) {
    console.log('❌ 發送失敗！');
    console.log('Error:', err?.message || err);
    if (err?.statusCode) console.log('HTTP Status:', err.statusCode);
    if (err?.body) console.log('Response body:', JSON.stringify(err.body, null, 2));
  }
}

main().catch(console.error);
