/**
 * 將教練 Rich Menu 連結到所有已綁定 LINE 的教練
 * 用法：npx tsx scripts/link-coach-rich-menu.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

import { messagingApi } from '@line/bot-sdk';
import { Client as NotionClient } from '@notionhq/client';

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const COACH_MENU_ID = process.env.RICH_MENU_COACH_ID!;
const lineClient = new messagingApi.MessagingApiClient({ channelAccessToken: TOKEN });

const notion = new NotionClient({ auth: process.env.NOTION_API_KEY! });
const COACHES_DB_ID = process.env.NOTION_COACHES_DB_ID!;

async function main() {
  if (!COACH_MENU_ID) {
    console.error('❌ RICH_MENU_COACH_ID 環境變數未設定');
    process.exit(1);
  }

  console.log(`教練 Rich Menu ID: ${COACH_MENU_ID}\n`);

  const res = await notion.databases.query({
    database_id: COACHES_DB_ID,
    sorts: [{ property: '姓名', direction: 'ascending' }],
  });

  for (const page of res.results) {
    const props = (page as any).properties;
    const name = props['姓名']?.title?.[0]?.plain_text ?? '(unknown)';
    const lineUserId = props['LINE User ID']?.rich_text?.[0]?.plain_text ?? '';

    if (!lineUserId) {
      console.log(`⏭️  ${name} — 無 LINE ID，跳過`);
      continue;
    }

    try {
      await lineClient.linkRichMenuIdToUser(lineUserId, COACH_MENU_ID);
      console.log(`✅ ${name} — 已連結教練 Rich Menu`);
    } catch (err: any) {
      console.error(`❌ ${name} — 連結失敗:`, err.message ?? err);
    }
  }

  console.log('\n完成！');
}

main().catch(console.error);
