import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';
import type { MissingCheckinEntry } from '@/services/checkin-query.service.ts';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function missingCheckinReportCard(
  monthLabel: string,
  missing: MissingCheckinEntry[],
): FlexBubble | messagingApi.FlexCarousel {
  const fmtDate = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;

  if (missing.length === 0) {
    return {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: `✅ ${monthLabel} 無缺漏`, weight: 'bold', size: 'lg', color: '#FFFFFF' }],
        paddingAll: '20px',
        backgroundColor: '#27AE60',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: '本月所有課程皆已完成打卡，太棒了！', size: 'sm', color: '#555555' }],
        paddingAll: '16px',
      },
    };
  }

  // Group by date to handle large lists
  const groupedByDate: Record<string, MissingCheckinEntry[]> = {};
  for (const item of missing) {
    if (!groupedByDate[item.date]) groupedByDate[item.date] = [];
    groupedByDate[item.date].push(item);
  }

  const uniqueDates = Object.keys(groupedByDate).sort();

  // If there are many entries, we might need a carousel or a long bubble.
  // For simplicity and readability, we'll use a bubble but limit the footer buttons.
  // The body will show the full list (LINE allows up to 50 components in a box).
  
  const bodyContents: FlexComponent[] = [
    {
      type: 'text',
      text: `以下為 ${monthLabel} 尚未打卡的課程：`,
      size: 'sm',
      color: '#555555',
      wrap: true,
    },
    { type: 'separator', margin: 'md' },
  ];

  for (const date of uniqueDates) {
    const entries = groupedByDate[date];
    const massageCount = entries.filter(e => e.isMassage).length;
    const label = massageCount > 0
      ? `${fmtDate(date)}（${entries.length} 堂，含 ${massageCount} 按摩）`
      : `${fmtDate(date)}（${entries.length} 堂）`;
    bodyContents.push({
      type: 'text',
      text: label,
      weight: 'bold',
      size: 'sm',
      margin: 'md',
      color: '#333333',
    });

    for (const entry of entries) {
      bodyContents.push({
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          { type: 'text', text: entry.isMassage ? `💆 ${entry.name}` : entry.name, size: 'sm', color: '#666666', flex: 3 },
          { type: 'text', text: entry.time, size: 'sm', color: '#999999', flex: 2, align: 'end' },
        ],
        margin: 'xs',
      });
    }
  }

  // Footer: buttons for "补打卡" for each unique date (limit to 5 most recent if a lot)
  const footerDates = uniqueDates.slice(-5); // Show most recent 5 dates as shortcuts
  const footerContents: FlexComponent[] = footerDates.map(date => ({
    type: 'button',
    action: {
      type: 'postback',
      label: `${fmtDate(date)} 補打卡`,
      data: `${ACTION.CHECKIN_SCHEDULE}:${date}`,
      displayText: `進行 ${date} 補打卡`,
    },
    style: 'primary',
    color: '#5B4B6D',
    height: 'sm',
    margin: 'xs',
  }));

  if (uniqueDates.length > 5) {
    footerContents.push({
      type: 'text',
      text: `（僅顯示最近 ${footerDates.length} 天的快速按鈕）`,
      size: 'xxs',
      color: '#AAAAAA',
      align: 'center',
      margin: 'sm',
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
          text: '📋 未打卡清單',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: monthLabel,
          size: 'sm',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#E67E22',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      paddingAll: '16px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: footerContents,
      paddingAll: '12px',
      spacing: 'xs',
    },
  };
}
