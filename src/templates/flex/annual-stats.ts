import type { messagingApi } from '@line/bot-sdk';
import type { CoachAnnualStats } from '@/services/stats.service';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function annualStatsCard(stats: CoachAnnualStats): FlexBubble {
  const bodyContents: FlexComponent[] = [
    {
      type: 'text',
      text: `年度合計（${stats.startMonth}月－${stats.endMonth}月）`,
      size: 'xs',
      color: '#888888',
      margin: 'none',
    } as FlexComponent,
    statRow('✅ 執行堂數', `${stats.totalCheckedInClasses} 堂`),
    ...(stats.totalMassageClasses > 0 ? [subStatRow('💆 其中按摩', `${stats.totalMassageClasses} 堂`)] : []),
    statRow('🏷️ 執行收入', `$${stats.totalExecutedRevenue.toLocaleString()}`),
    statRow('💰 實際收款', `$${stats.totalCollectedAmount.toLocaleString()}`),
    separator(),
    {
      type: 'text',
      text: '每月平均',
      size: 'xs',
      color: '#888888',
      margin: 'md',
    } as FlexComponent,
    statRow('📅 平均堂數', `${stats.avgCheckedInClasses} 堂`),
    statRow('🏷️ 平均執行收入', `$${stats.avgExecutedRevenue.toLocaleString()}`),
    statRow('💰 平均實際收款', `$${stats.avgCollectedAmount.toLocaleString()}`),
    separator(),
    // Monthly breakdown header
    {
      type: 'box',
      layout: 'horizontal',
      margin: 'md',
      contents: [
        { type: 'text', text: '月份', size: 'xs', color: '#888888', flex: 1 },
        { type: 'text', text: '堂數', size: 'xs', color: '#888888', flex: 1, align: 'end' },
        { type: 'text', text: '執行收入', size: 'xs', color: '#888888', flex: 3, align: 'end' },
        { type: 'text', text: '實際收款', size: 'xs', color: '#888888', flex: 3, align: 'end' },
      ],
    } as FlexComponent,
    ...stats.monthlyBreakdown.map(m => ({
      type: 'box',
      layout: 'horizontal',
      margin: 'sm',
      contents: [
        { type: 'text', text: `${m.month} 月`, size: 'xs', color: '#333333', flex: 1, weight: 'bold' },
        { type: 'text', text: `${m.checkedIn}`, size: 'xs', color: '#333333', flex: 1, align: 'end' },
        { type: 'text', text: `$${m.executedRevenue.toLocaleString()}`, size: 'xs', color: '#333333', flex: 3, align: 'end' },
        { type: 'text', text: `$${m.collected.toLocaleString()}`, size: 'xs', color: '#333333', flex: 3, align: 'end' },
      ],
    } as FlexComponent)),
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
          text: `${stats.year} 年度統計`,
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
      backgroundColor: '#7A5B3D',
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

function subStatRow(label: string, value: string): FlexComponent {
  return {
    type: 'box',
    layout: 'horizontal',
    paddingStart: '20px',
    contents: [
      { type: 'text', text: label, size: 'xs', color: '#888888', flex: 3 },
      { type: 'text', text: value, size: 'xs', color: '#888888', flex: 2, align: 'end' },
    ],
  };
}

function separator(): FlexComponent {
  return { type: 'separator', margin: 'md' };
}
