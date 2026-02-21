import type { messagingApi } from '@line/bot-sdk';
import type { CoachMonthlyStats } from '@/services/stats.service';

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

  // Renewal forecast section
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
    for (const s of forecast.students) {
      const isPaid = s.paidAmount >= s.expectedRenewalAmount;
      const icon = isPaid ? '✅' : '❌';
      const fmtDate = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;
      const expiryDate = fmtDate(s.predictedRenewalDate);
      const renewDate = s.renewedDate ? fmtDate(s.renewedDate) : '未繳';
      const detail = `${icon} ${s.name} 到期${expiryDate} 續約${renewDate} ${s.expectedRenewalHours}hr $${s.expectedRenewalAmount.toLocaleString()}`;
      bodyContents.push({
        type: 'text',
        text: detail,
        size: 'xs',
        color: isPaid ? '#2ecc71' : '#888888',
        margin: 'sm',
        wrap: true,
      } as FlexComponent);
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
