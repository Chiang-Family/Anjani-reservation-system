import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

interface MissingEntry {
  date: string;   // 'yyyy-MM-dd'
  name: string;
  time: string;   // 'HH:mm-HH:mm'
}

export function checkinReminderCard(
  weekStart: string,
  weekEnd: string,
  missing: MissingEntry[],
): FlexBubble {
  const fmtDate = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;
  const weekStartFmt = fmtDate(weekStart);
  const weekEndFmt = fmtDate(weekEnd);

  // Body rows
  const bodyContents: FlexComponent[] = [
    {
      type: 'text',
      text: `以下課程尚未打卡（${weekStartFmt}－${weekEndFmt}）：`,
      size: 'sm',
      color: '#555555',
      wrap: true,
    } as FlexComponent,
    { type: 'separator', margin: 'md' } as FlexComponent,
  ];

  for (const m of missing) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      margin: 'md',
      contents: [
        {
          type: 'text',
          text: fmtDate(m.date),
          size: 'sm',
          color: '#333333',
          flex: 2,
          weight: 'bold',
        },
        {
          type: 'text',
          text: m.name,
          size: 'sm',
          color: '#333333',
          flex: 4,
        },
        {
          type: 'text',
          text: m.time,
          size: 'sm',
          color: '#888888',
          flex: 3,
          align: 'end',
        },
      ],
    } as FlexComponent);
  }

  bodyContents.push(
    { type: 'separator', margin: 'lg' } as FlexComponent,
    {
      type: 'text',
      text: '請確認是否需要補打卡。',
      size: 'xs',
      color: '#888888',
      margin: 'md',
    } as FlexComponent,
  );

  // Footer: one button per unique missing date (max 5)
  const uniqueDates = [...new Set(missing.map(m => m.date))].slice(0, 5);
  const footerContents: FlexComponent[] = uniqueDates.map(date => ({
    type: 'button',
    action: {
      type: 'postback',
      label: `${fmtDate(date)} 打卡`,
      data: `${ACTION.CHECKIN_SCHEDULE}:${date}`,
    },
    style: 'primary',
    color: '#5B4B6D',
    height: 'sm',
    margin: 'sm',
  } as FlexComponent));

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '📋 本週打卡確認提醒',
          weight: 'bold',
          size: 'md',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `${weekStartFmt}（日）－ ${weekEndFmt}（六）`,
          size: 'xs',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
      ],
      paddingAll: '16px',
      backgroundColor: '#5B4B6D',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      paddingAll: '16px',
      spacing: 'none',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: footerContents,
      paddingAll: '12px',
      spacing: 'sm',
    },
  };
}
