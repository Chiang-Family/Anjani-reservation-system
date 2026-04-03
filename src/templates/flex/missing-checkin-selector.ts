import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;

const START_YEAR = 2026;
const START_MONTH = 2; // February 2026

export function missingCheckinSelectorCard(coachName: string): FlexBubble {
  const now = new Date();
  const months: { label: string; value: string }[] = [];

  // Show past 6 months (including current)
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (y < START_YEAR || (y === START_YEAR && m < START_MONTH)) break;
    months.push({
      label: `${y}年${m}月`,
      value: `${y}-${m}`,
    });
  }

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '🔍 未打卡查詢',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `${coachName} 教練`,
          size: 'sm',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#5B4B6D',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '選擇要查詢的月份：',
          size: 'sm',
          color: '#555555',
        },
      ],
      paddingAll: '16px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: months.map(({ label, value }) => ({
        type: 'button',
        action: {
          type: 'postback',
          label,
          data: `${ACTION.VIEW_MISSING_CHECKINS}:${value}`,
          displayText: `查詢 ${label} 未打卡課程`,
        },
        style: 'secondary',
        height: 'sm',
      })) as messagingApi.FlexComponent[],
      paddingAll: '16px',
    },
  };
}
