import type { messagingApi } from '@line/bot-sdk';
import type { CoachMonthlyStats } from '@/services/stats.service';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function monthlyStatsCard(stats: CoachMonthlyStats): FlexBubble {
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `${stats.year}/${String(stats.month).padStart(2, '0')} 月度統計`,
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
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
      backgroundColor: '#8e44ad',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        statRow('📅 本月排課', `${stats.scheduledClasses} 堂`),
        statRow('⏱️ 總時數', `${stats.totalHours} 小時`),
        statRow('👥 學員人數', `${stats.studentCount} 人`),
        separator(),
        statRow('💰 已收金額', `$${stats.collectedAmount.toLocaleString()}`),
        statRow('📋 待收金額', `$${stats.pendingAmount.toLocaleString()}`),
      ] as FlexComponent[],
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
      {
        type: 'text',
        text: label,
        size: 'sm',
        color: '#555555',
        flex: 3,
      },
      {
        type: 'text',
        text: value,
        size: 'sm',
        weight: 'bold',
        color: '#333333',
        flex: 2,
        align: 'end',
      },
    ],
  };
}

function separator(): FlexComponent {
  return {
    type: 'separator',
    margin: 'md',
  };
}
