import { messagingApi } from '@line/bot-sdk';
import { getEnv } from '@/lib/config/env';
import { getLineClient } from './client';
import { KEYWORD } from '@/lib/config/constants';

interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number };
  action: { type: 'message'; text: string };
}

function createRichMenuAreas(actions: string[], cols: number, rows: number): RichMenuArea[] {
  const cellW = 2500 / cols;
  const cellH = 843 / rows;

  return actions.map((text, i) => ({
    bounds: {
      x: (i % cols) * cellW,
      y: Math.floor(i / cols) * cellH,
      width: cellW,
      height: cellH,
    },
    action: { type: 'message' as const, text },
  }));
}

async function generateRichMenuImage(
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

  // Grid lines
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

export async function setupStudentRichMenu(): Promise<string> {
  const client = getLineClient();

  // 視覺 labels（顯示在圖片上，較短）
  const labels = ['近期預約', '上課紀錄', '繳費紀錄', '注意事項'];
  // 實際送出的訊息文字（對應 KEYWORD 常數）
  const actions = [
    KEYWORD.UPCOMING_CLASSES,   // '近期預約'
    KEYWORD.CLASS_HISTORY,      // '當期上課紀錄' — handler 會依學員類型顯示對應視圖
    KEYWORD.PAYMENT_HISTORY,    // '繳費紀錄'
    KEYWORD.CLASS_NOTES,        // '上課注意事項'
  ];

  const cols = 2;
  const rows = 2;
  const areas = createRichMenuAreas(actions, cols, rows);

  const response = await client.createRichMenu({
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'Student Menu',
    chatBarText: '選單',
    areas,
  });

  const richMenuId = response.richMenuId;
  const imageBlob = await generateRichMenuImage(labels, '#1B4965', '#FFFFFF', cols, rows);

  const blobClient = new messagingApi.MessagingApiBlobClient({
    channelAccessToken: getEnv().LINE_CHANNEL_ACCESS_TOKEN,
  });

  await blobClient.setRichMenuImage(richMenuId, imageBlob);

  return richMenuId;
}

export async function setupCoachRichMenu(): Promise<string> {
  const client = getLineClient();

  const labels = ['每日課表', '學員管理', '每週統計', '每月統計'];
  const actions = [
    KEYWORD.TODAY_SCHEDULE,
    KEYWORD.STUDENT_MGMT,
    KEYWORD.WEEKLY_STATS,
    KEYWORD.MONTHLY_STATS,
  ];

  const cols = 2;
  const rows = 2;
  const areas = createRichMenuAreas(actions, cols, rows);

  const response = await client.createRichMenu({
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'Coach Menu',
    chatBarText: '教練選單',
    areas,
  });

  const richMenuId = response.richMenuId;
  const imageBlob = await generateRichMenuImage(labels, '#2D6A4F', '#FFFFFF', cols, rows);

  const blobClient = new messagingApi.MessagingApiBlobClient({
    channelAccessToken: getEnv().LINE_CHANNEL_ACCESS_TOKEN,
  });

  await blobClient.setRichMenuImage(richMenuId, imageBlob);

  return richMenuId;
}

export async function setDefaultRichMenu(richMenuId: string): Promise<void> {
  const client = getLineClient();
  await client.setDefaultRichMenu(richMenuId);
}

export async function linkRichMenuToUser(
  userId: string,
  richMenuId: string
): Promise<void> {
  const client = getLineClient();
  await client.linkRichMenuIdToUser(userId, richMenuId);
}
