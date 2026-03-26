/**
 * 設定 LINE Rich Menu（學員 + 教練）
 * 用法：npx tsx scripts/setup-rich-menu.ts
 *
 * 學員選單設為預設（所有使用者預設看到）
 * 教練選單需手動連結或設定 RICH_MENU_COACH_ID 環境變數
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

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
const client = new messagingApi.MessagingApiClient({ channelAccessToken: TOKEN });
const blobClient = new messagingApi.MessagingApiBlobClient({ channelAccessToken: TOKEN });

async function deleteAllRichMenus() {
  const list = await client.getRichMenuList();
  if (list.richmenus.length === 0) {
    console.log('  (無既有 Rich Menu)');
    return;
  }
  for (const menu of list.richmenus) {
    await client.deleteRichMenu(menu.richMenuId);
    console.log(`  刪除: ${menu.name} (${menu.richMenuId})`);
  }
}

async function generateImage(
  labels: string[],
  bgColor: string,
  textColor: string,
  cols: number,
  rows: number,
): Promise<Blob> {
  const sharp = (await import('sharp')).default;
  const width = 2500;
  const height = 843;
  const cellW = width / cols;
  const cellH = height / rows;
  const font = 'PingFang TC, Noto Sans TC, Heiti TC, Arial, sans-serif';

  const svgParts = labels.map((label, i) => {
    const x = (i % cols) * cellW + cellW / 2;
    const y = Math.floor(i / cols) * cellH + cellH / 2;
    return `<text x="${x}" y="${y}" font-family="${font}" font-size="56" font-weight="500" fill="${textColor}" text-anchor="middle" dominant-baseline="central">${label}</text>`;
  });

  const gridLines: string[] = [];
  for (let c = 1; c < cols; c++) {
    gridLines.push(`<line x1="${c * cellW}" y1="0" x2="${c * cellW}" y2="${height}" stroke="${textColor}" stroke-opacity="0.2" stroke-width="2"/>`);
  }
  for (let r = 1; r < rows; r++) {
    gridLines.push(`<line x1="0" y1="${r * cellH}" x2="${width}" y2="${r * cellH}" stroke="${textColor}" stroke-opacity="0.2" stroke-width="2"/>`);
  }

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${bgColor}"/>
    ${gridLines.join('\n')}
    ${svgParts.join('\n')}
  </svg>`;

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Blob([buffer as unknown as BlobPart], { type: 'image/png' });
}

interface MenuButton {
  label: string;   // 圖片上顯示的文字
  action: string;  // 點擊後送出的訊息
}

async function createMenu(
  name: string,
  chatBarText: string,
  buttons: MenuButton[],
  bgColor: string,
  textColor: string,
): Promise<string> {
  const cols = 2;
  const rows = Math.ceil(buttons.length / cols);
  const cellW = 2500 / cols;
  const cellH = 843 / rows;

  const areas = buttons.map((btn, i) => ({
    bounds: {
      x: (i % cols) * cellW,
      y: Math.floor(i / cols) * cellH,
      width: cellW,
      height: cellH,
    },
    action: { type: 'message' as const, text: btn.action },
  }));

  const response = await client.createRichMenu({
    size: { width: 2500, height: 843 },
    selected: true,
    name,
    chatBarText,
    areas,
  });

  const richMenuId = response.richMenuId;
  const labels = buttons.map(b => b.label);
  const imageBlob = await generateImage(labels, bgColor, textColor, cols, rows);
  await blobClient.setRichMenuImage(richMenuId, imageBlob);

  return richMenuId;
}

async function main() {
  console.log('\n🗑️  清除既有 Rich Menu...');
  await deleteAllRichMenus();

  console.log('\n📱 建立學員 Rich Menu...');
  const studentMenuId = await createMenu(
    'Student Menu',
    '選單',
    [
      { label: '近期預約', action: '近期預約' },
      { label: '上課紀錄', action: '當期上課紀錄' },
      { label: '繳費紀錄', action: '繳費紀錄' },
      { label: '注意事項', action: '上課注意事項' },
    ],
    '#1B4965',
    '#FFFFFF',
  );
  console.log(`  ✅ ID: ${studentMenuId}`);

  console.log('\n📱 建立教練 Rich Menu...');
  const coachMenuId = await createMenu(
    'Coach Menu',
    '教練選單',
    [
      { label: '每日課表', action: '每日課表' },
      { label: '學員管理', action: '學員管理' },
      { label: '每週統計', action: '每週統計' },
      { label: '每月統計', action: '每月統計' },
    ],
    '#2D6A4F',
    '#FFFFFF',
  );
  console.log(`  ✅ ID: ${coachMenuId}`);

  console.log('\n🔗 設定學員選單為預設...');
  await client.setDefaultRichMenu(studentMenuId);
  console.log('  ✅ 完成');

  console.log('\n' + '='.repeat(50));
  console.log('請將以下 ID 加入 Vercel 環境變數：');
  console.log(`  RICH_MENU_STUDENT_ID=${studentMenuId}`);
  console.log(`  RICH_MENU_COACH_ID=${coachMenuId}`);
  console.log('='.repeat(50) + '\n');
}

main().catch(console.error);
