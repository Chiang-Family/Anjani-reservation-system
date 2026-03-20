import type { messagingApi } from '@line/bot-sdk';
import type { CoachWeeklyStats } from '@/services/stats.service';
import { ACTION } from '@/lib/config/constants';
import { nowTaipei } from '@/lib/utils/date';
import { subDays, addDays, parseISO, format } from 'date-fns';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

export function weeklyStatsCard(stats: CoachWeeklyStats): FlexBubble {
  const fmtDate = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;

  const bodyContents: FlexComponent[] = [
    statRow('📅 已預約堂數', `${stats.scheduledClasses} 堂`),
    ...(stats.massageScheduled > 0 ? [subStatRow('💆 其中按摩', `${stats.massageScheduled} 堂`)] : []),
    statRow('✅ 已打卡堂數', `${stats.checkedInClasses} 堂`),
    ...(stats.massageCheckedIn > 0 ? [subStatRow('💆 其中按摩', `${stats.massageCheckedIn} 堂`)] : []),
    separator(),
    statRow('🏷️ 已執行收入', `$${stats.executedRevenue.toLocaleString()}`),
    statRow('💰 實際收款', `$${stats.collectedAmount.toLocaleString()}`),
    separator(),
    // Daily breakdown header
    {
      type: 'box',
      layout: 'horizontal',
      margin: 'md',
      contents: [
        { type: 'text', text: '日期', size: 'xs', color: '#888888', flex: 3 },
        { type: 'text', text: '堂', size: 'xs', color: '#888888', flex: 1, align: 'end' },
        { type: 'text', text: '執行收入', size: 'xs', color: '#888888', flex: 3, align: 'end' },
        { type: 'text', text: '實際收款', size: 'xs', color: '#888888', flex: 3, align: 'end' },
      ],
    } as FlexComponent,
    ...stats.dailyBreakdown.map((d, i) => {
      const dayName = DAY_NAMES[i];
      const label = `${fmtDate(d.date)}（${dayName}）`;
      const hasData = d.checkedIn > 0 || d.collected > 0;
      const color = hasData ? '#333333' : '#BBBBBB';
      return {
        type: 'box',
        layout: 'horizontal',
        margin: 'sm',
        contents: [
          { type: 'text', text: label, size: 'xs', color, flex: 3 },
          { type: 'text', text: hasData ? `${d.checkedIn}` : '-', size: 'xs', color, flex: 1, align: 'end' },
          { type: 'text', text: hasData ? `$${d.executedRevenue.toLocaleString()}` : '-', size: 'xs', color, flex: 3, align: 'end' },
          { type: 'text', text: hasData ? `$${d.collected.toLocaleString()}` : '-', size: 'xs', color, flex: 3, align: 'end' },
        ],
      } as FlexComponent;
    }),
  ];

  // Week navigation bounds
  const now = nowTaipei();
  const currentWeekStart = format(subDays(now, now.getDay()), 'yyyy-MM-dd');
  const weekStartDate = parseISO(stats.weekStart);
  // Earliest navigable: the Sunday of the week containing the 1st of the displayed month
  const monthFirst = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), 1);
  const earliestWeekStart = format(subDays(monthFirst, monthFirst.getDay()), 'yyyy-MM-dd');

  const isFirst = stats.weekStart <= earliestWeekStart;
  const isLast = stats.weekStart >= currentWeekStart;

  const prevWeekStart = format(subDays(weekStartDate, 7), 'yyyy-MM-dd');
  const nextWeekStart = format(addDays(weekStartDate, 7), 'yyyy-MM-dd');

  const navContents: FlexComponent[] = [];
  if (!isFirst) {
    navContents.push({
      type: 'button',
      action: {
        type: 'postback',
        label: `← 上週`,
        data: `${ACTION.VIEW_WEEK_STATS}:${prevWeekStart}`,
      },
      style: 'secondary',
      height: 'sm',
      flex: 1,
    } as FlexComponent);
  } else {
    navContents.push({ type: 'filler' } as FlexComponent);
  }
  if (!isLast) {
    navContents.push({
      type: 'button',
      action: {
        type: 'postback',
        label: `下週 →`,
        data: `${ACTION.VIEW_WEEK_STATS}:${nextWeekStart}`,
      },
      style: 'secondary',
      height: 'sm',
      flex: 1,
    } as FlexComponent);
  } else {
    navContents.push({ type: 'filler' } as FlexComponent);
  }

  const hasNav = !(isFirst && isLast);

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '週統計',
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

  if (hasNav) {
    bubble.footer = {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: navContents,
      paddingAll: '12px',
    };
  }

  return bubble;
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
