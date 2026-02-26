import type { messagingApi } from '@line/bot-sdk';
import type { CoachWeeklyStats } from '@/services/stats.service';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function weeklyStatsCard(stats: CoachWeeklyStats): FlexBubble {
  const fmtDate = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;

  const bodyContents: FlexComponent[] = [
    statRow('📅 已預約堂數', `${stats.scheduledClasses} 堂`),
    statRow('✅ 已打卡堂數', `${stats.checkedInClasses} 堂`),
    separator(),
    statRow('🏷️ 已執行收入', `$${stats.executedRevenue.toLocaleString()}`),
    statRow('💰 實際收款', `$${stats.collectedAmount.toLocaleString()}`),
  ];

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '本週統計',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `${fmtDate(stats.weekStart)}（日）－ ${fmtDate(stats.weekEnd)}（六）`,
          size: 'xs',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
        {
          type: 'text',
          text: `${stats.coachName} 教練`,
          size: 'sm',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#3D7A6E',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      paddingAll: '20px',
      spacing: 'md',
    },
  };
}

function statRow(label: string, value: string): FlexComponent {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#555555', flex: 3 },
      { type: 'text', text: value, size: 'sm', weight: 'bold', color: '#333333', flex: 2, align: 'end' },
    ],
  };
}

function separator(): FlexComponent {
  return { type: 'separator', margin: 'md' };
}
