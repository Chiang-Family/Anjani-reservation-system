import type { messagingApi } from '@line/bot-sdk';
import type { CoachMonthlyStats, RenewalStudent } from '@/services/stats.service';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function monthlyStatsCard(stats: CoachMonthlyStats): FlexBubble {
  const bodyContents: FlexComponent[] = [
    statRow('📅 已預約堂數', `${stats.scheduledClasses} 堂`),
    statRow('✅ 已打卡堂數', `${stats.checkedInClasses} 堂`),
    separator(),
    statRow('💵 預計執行收入', `$${stats.estimatedRevenue.toLocaleString()}`),
    statRow('🏷️ 已執行收入', `$${stats.executedRevenue.toLocaleString()}`),
    separator(),
    statRow('💰 實際收款', `$${stats.collectedAmount.toLocaleString()}`),
    statRow('📋 待收款', `$${stats.pendingAmount.toLocaleString()}`),
  ];

  // Renewal forecast summary (no per-student details)
  const forecast = stats.renewalForecast;
  if (forecast.studentCount > 0) {
    bodyContents.push(separator());
    bodyContents.push({
      type: 'text',
      text: '🔮 預估續約',
      size: 'sm',
      weight: 'bold',
      color: '#333333',
      margin: 'md',
    } as FlexComponent);
    bodyContents.push(
      statRow('本月到期學員', `${forecast.studentCount} 人`),
      statRow('本月續約總額', `$${forecast.expectedAmount.toLocaleString()}`),
    );
  }

  const unpaidCount = forecast.students.filter(s => !s.isPaid).length;
  const paidCount = forecast.students.length - unpaidCount;

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
      backgroundColor: '#5B4B6D',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      paddingAll: '20px',
      spacing: 'md',
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: `❌ 未繳費 (${unpaidCount})`,
            data: ACTION.VIEW_RENEWAL_UNPAID,
          },
          style: 'secondary',
          height: 'sm',
          flex: 1,
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: `✅ 已繳費 (${paidCount})`,
            data: ACTION.VIEW_RENEWAL_PAID,
          },
          style: 'secondary',
          height: 'sm',
          flex: 1,
        },
      ],
      spacing: 'sm',
      paddingAll: '12px',
    },
  };
}

export function renewalStudentListCard(
  title: string,
  students: RenewalStudent[],
  headerColor: string,
): FlexBubble {
  const fmtDate = (d: string) => d ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : '待確認';

  const bodyContents: FlexComponent[] = [];

  if (students.length === 0) {
    bodyContents.push({
      type: 'text',
      text: '沒有符合條件的學員',
      size: 'sm',
      color: '#888888',
      align: 'center',
      margin: 'lg',
    } as FlexComponent);
  }

  for (const s of students) {
    bodyContents.push({
      type: 'text',
      text: s.name,
      size: 'sm',
      weight: 'bold',
      color: '#333333',
      margin: bodyContents.length > 0 ? 'lg' : 'none',
    } as FlexComponent);
    bodyContents.push(
      detailRow('到期日', fmtDate(s.expiryDate)),
      detailRow('續約日', fmtDate(s.renewalDate)),
      detailRow('續約時數', `${s.expectedRenewalHours} hr`),
      detailRow('金額', `$${s.expectedRenewalAmount.toLocaleString()}`),
    );
    if (!s.isPaid && s.paidAmount > 0) {
      bodyContents.push(detailRow('已付', `$${s.paidAmount.toLocaleString()}`));
    }
    if (bodyContents.length < 50) {
      bodyContents.push(separator());
    }
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
          text: title,
          weight: 'bold',
          size: 'md',
          color: '#FFFFFF',
        },
      ],
      paddingAll: '16px',
      backgroundColor: headerColor,
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      paddingAll: '16px',
      spacing: 'sm',
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

function detailRow(label: string, value: string): FlexComponent {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'xs',
        color: '#888888',
        flex: 2,
      },
      {
        type: 'text',
        text: value,
        size: 'xs',
        weight: 'bold',
        color: '#555555',
        flex: 3,
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
