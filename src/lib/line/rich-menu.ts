import { messagingApi } from '@line/bot-sdk';
import { getEnv } from '@/lib/config/env';
import { getLineClient } from './client';

interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number };
  action: { type: 'message'; text: string };
}

function createRichMenuAreas(labels: string[]): RichMenuArea[] {
  // 2x2 grid for 4 buttons, 2500x843 image
  const cols = 2;
  const rows = 2;
  const cellW = 2500 / cols;
  const cellH = 843 / rows;

  return labels.map((text, i) => ({
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
  textColor: string
): Promise<Blob> {
  // Dynamic import sharp (server-side only)
  const sharp = (await import('sharp')).default;

  const width = 2500;
  const height = 843;
  const cols = 2;
  const rows = 2;
  const cellW = width / cols;
  const cellH = height / rows;

  // Create SVG with grid lines and labels
  const svgParts = labels.map((label, i) => {
    const x = (i % cols) * cellW + cellW / 2;
    const y = Math.floor(i / cols) * cellH + cellH / 2;
    return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="60" fill="${textColor}" text-anchor="middle" dominant-baseline="central">${label}</text>`;
  });

  // Add grid lines
  const gridLines = [
    `<line x1="${cellW}" y1="0" x2="${cellW}" y2="${height}" stroke="${textColor}" stroke-opacity="0.3" stroke-width="2"/>`,
    `<line x1="0" y1="${cellH}" x2="${width}" y2="${cellH}" stroke="${textColor}" stroke-opacity="0.3" stroke-width="2"/>`,
  ];

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${bgColor}"/>
    ${gridLines.join('\n')}
    ${svgParts.join('\n')}
  </svg>`;

  const buffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return new Blob([buffer as unknown as BlobPart], { type: 'image/png' });
}

export async function setupStudentRichMenu(): Promise<string> {
  const client = getLineClient();
  const labels = ['預約課程', '我的預約', '報到', '剩餘堂數'];
  const areas = createRichMenuAreas(labels);

  const response = await client.createRichMenu({
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'Student Menu',
    chatBarText: '選單',
    areas,
  });

  const richMenuId = response.richMenuId;
  const imageBlob = await generateRichMenuImage(labels, '#1B4965', '#FFFFFF');

  const blobClient = new messagingApi.MessagingApiBlobClient({
    channelAccessToken: getEnv().LINE_CHANNEL_ACCESS_TOKEN,
  });

  await blobClient.setRichMenuImage(richMenuId, imageBlob);

  return richMenuId;
}

export async function setupCoachRichMenu(): Promise<string> {
  const client = getLineClient();
  const labels = ['今日課程', '近期課程', '新增課程', '充值堂數'];
  const areas = createRichMenuAreas(labels);

  const response = await client.createRichMenu({
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'Coach Menu',
    chatBarText: '教練選單',
    areas,
  });

  const richMenuId = response.richMenuId;
  const imageBlob = await generateRichMenuImage(labels, '#2D6A4F', '#FFFFFF');

  const blobClient = new messagingApi.MessagingApiBlobClient({
    channelAccessToken: getEnv().LINE_CHANNEL_ACCESS_TOKEN,
  });

  await blobClient.setRichMenuImage(richMenuId, imageBlob);

  return richMenuId;
}

export async function linkRichMenuToUser(
  userId: string,
  richMenuId: string
): Promise<void> {
  const client = getLineClient();
  await client.linkRichMenuIdToUser(userId, richMenuId);
}
