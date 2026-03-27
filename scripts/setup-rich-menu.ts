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

interface MenuButton {
  label: string;
  action: string;
  color: string;
}

async function generateImage(buttons: MenuButton[], cols: number, rows: number): Promise<Blob> {
  const sharp = (await import('sharp')).default;
  const width = 2500;
  const height = 843;
  const gap = 5;
  const cellW = width / cols;
  const cellH = height / rows;
  const font = 'PingFang TC, Noto Sans TC, Heiti TC, sans-serif';

  const cells = buttons.map((btn, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW + gap / 2;
    const y = row * cellH + gap / 2;
    const w = cellW - gap;
    const h = cellH - gap;
    const cx = col * cellW + cellW / 2;
    const cy = row * cellH + cellH / 2;

    return [
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${btn.color}"/>`,
      `<rect x="${x}" y="${y}" width="${w}" height="${h * 0.45}" rx="16" fill="url(#shine)"/>`,
      `<text x="${cx}" y="${cy + 6}" font-family="${font}" font-size="96" font-weight="600" letter-spacing="0.15em" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${btn.label}</text>`,
    ].join('\n');
  });

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#2B2B2B"/>
  ${cells.join('\n')}
</svg>`;

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Blob([buffer as unknown as BlobPart], { type: 'image/png' });
}

async function createMenu(name: string, chatBarText: string, buttons: MenuButton[]): Promise<string> {
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
  const imageBlob = await generateImage(buttons, cols, rows);
  await blobClient.setRichMenuImage(richMenuId, imageBlob);

  return richMenuId;
}

async function main() {
  console.log('\n🗑️  清除既有 Rich Menu...');
  await deleteAllRichMenus();

  console.log('\n📱 建立學員 Rich Menu...');
  const studentMenuId = await createMenu('Student Menu', '選單', [
    { label: '近期預約', action: '近期預約', color: '#5B7065' },
    { label: '上課紀錄', action: '當期上課紀錄', color: '#6B7B8D' },
    { label: '繳費紀錄', action: '繳費紀錄', color: '#7D6B5D' },
    { label: '注意事項', action: '上課注意事項', color: '#8D7B6B' },
  ]);
  console.log(`  ✅ ID: ${studentMenuId}`);

  console.log('\n📱 建立教練 Rich Menu...');
  const coachMenuId = await createMenu('Coach Menu', '教練選單', [
    { label: '每日課表', action: '每日課表', color: '#5D6B7D' },
    { label: '學員管理', action: '學員管理', color: '#6B5D6B' },
    { label: '每週統計', action: '每週統計', color: '#5B7065' },
    { label: '每月統計', action: '每月統計', color: '#7B6B5B' },
  ]);
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
