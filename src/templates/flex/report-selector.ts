import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;

/**
 * Month selector card for generating monthly reports.
 * Shows the past 6 months as postback buttons.
 */
export function reportSelectorCard(coachName: string): FlexBubble {
  const now = new Date();
  const months: { label: string; value: string }[] = [];

  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    months.push({
      label: `${y}年${m}月`,
      value: `${y}-${String(m).padStart(2, '0')}`,
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
          text: '月報表',
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
      backgroundColor: '#3A6B8A',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '選擇要生成報表的月份：',
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
          data: `${ACTION.GENERATE_REPORT}:${value}`,
          displayText: `生成 ${label} 報表`,
        },
        style: 'secondary',
        height: 'sm',
      })) as messagingApi.FlexComponent[],
      paddingAll: '16px',
    },
  };
}
