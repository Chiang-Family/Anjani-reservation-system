/**
 * Debug 腳本：列出指定學員的原始打卡紀錄（含 Notion 原始時間戳）
 *
 * 使用方式：
 *   npx tsx --env-file=.env.local scripts/debug-checkins.ts <學員名稱關鍵字>
 *
 * 範例：
 *   npx tsx --env-file=.env.local scripts/debug-checkins.ts 林芳嫻
 */

import { getNotionClient } from '../src/lib/notion/client';
import { getEnv } from '../src/lib/config/env';
import { CHECKIN_PROPS } from '../src/lib/notion/types';

async function main() {
  const keyword = process.argv[2] || '';
  if (!keyword) {
    console.error('請提供學員名稱關鍵字，例如：npx tsx --env-file=.env.local scripts/debug-checkins.ts 林芳嫻');
    process.exit(1);
  }

  const notion = getNotionClient();
  const env = getEnv();

  const res = await notion.databases.query({
    database_id: env.NOTION_CHECKIN_DB_ID,
    filter: {
      property: CHECKIN_PROPS.TITLE,
      title: { contains: keyword },
    },
    sorts: [{ property: CHECKIN_PROPS.CLASS_TIME_SLOT, direction: 'ascending' }],
    page_size: 50,
  });

  console.log(`=== ${keyword} 打卡紀錄（共 ${res.results.length} 筆）===\n`);

  for (const page of res.results) {
    const p = page as { id: string; properties: Record<string, Record<string, unknown>> };
    const props = p.properties;

    const titleArr = (props[CHECKIN_PROPS.TITLE] as { title: Array<{ plain_text: string }> }).title;
    const title = titleArr?.[0]?.plain_text ?? '(無標題)';

    const slotProp = props[CHECKIN_PROPS.CLASS_TIME_SLOT] as { type: string; date: { start: string; end?: string | null } | null } | null;
    const rawStart = slotProp?.date?.start ?? '(無)';
    const rawEnd = slotProp?.date?.end ?? '(無)';

    let startSlice = '';
    let endSlice = '';
    let durationMin = 0;
    if (slotProp?.date?.start && slotProp?.date?.end) {
      startSlice = rawStart.slice(11, 16);
      endSlice = rawEnd.slice(11, 16);
      const [sh, sm] = startSlice.split(':').map(Number);
      const [eh, em] = endSlice.split(':').map(Number);
      durationMin = (eh * 60 + em) - (sh * 60 + sm);
    }

    console.log(`[${title}]`);
    console.log(`  raw start : ${rawStart}`);
    console.log(`  raw end   : ${rawEnd}`);
    console.log(`  slice時間 : ${startSlice} → ${endSlice}（${durationMin} 分）`);
    console.log('');
  }
}

main().catch(err => {
  console.error('執行失敗：', err);
  process.exit(1);
});
