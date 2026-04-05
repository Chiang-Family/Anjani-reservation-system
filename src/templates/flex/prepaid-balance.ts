import type { messagingApi } from '@line/bot-sdk';
import type { CoachPrepaidBalance } from '@/services/stats.service';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

function studentRow(name: string, price: number, hours: number, amount: number, bgColor?: string): FlexComponent {
  const hoursStr = hours % 1 === 0 ? `${hours}` : hours.toFixed(1);
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: name, size: 'xs', color: '#333333', flex: 4 },
      { type: 'text', text: `$${price.toLocaleString()}`, size: 'xs', color: '#555555', flex: 2, align: 'end' },
      { type: 'text', text: `${hoursStr}堂`, size: 'xs', color: '#555555', flex: 2, align: 'end' },
      { type: 'text', text: `$${amount.toLocaleString()}`, size: 'xs', color: '#333333', flex: 3, align: 'end', weight: 'bold' },
    ],
    paddingAll: '6px',
    ...(bgColor ? { backgroundColor: bgColor } : {}),
  } as FlexComponent;
}

export function prepaidBalanceCard(data: CoachPrepaidBalance): FlexBubble {
  const rows: FlexComponent[] = [];

  // Header row
  rows.push({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: '學員', size: 'xxs', color: '#888888', flex: 4, weight: 'bold' },
      { type: 'text', text: '單價', size: 'xxs', color: '#888888', flex: 2, align: 'end', weight: 'bold' },
      { type: 'text', text: '剩餘', size: 'xxs', color: '#888888', flex: 2, align: 'end', weight: 'bold' },
      { type: 'text', text: '預收金額', size: 'xxs', color: '#888888', flex: 3, align: 'end', weight: 'bold' },
    ],
    paddingAll: '6px',
    paddingBottom: '2px',
  } as FlexComponent);

  rows.push({ type: 'separator', color: '#CCCCCC' } as FlexComponent);

  // Student rows with alternating background
  for (let i = 0; i < data.rows.length; i++) {
    const r = data.rows[i];
    rows.push(studentRow(r.name, r.pricePerHour, r.remainingHours, r.prepaidAmount, i % 2 === 1 ? '#F5F5F5' : undefined));
  }

  // Total
  rows.push({ type: 'separator', color: '#CCCCCC', margin: 'sm' } as FlexComponent);
  rows.push({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: `合計 (${data.rows.length} 人)`, size: 'sm', color: '#333333', flex: 8, weight: 'bold' },
      { type: 'text', text: `$${data.totalPrepaid.toLocaleString()}`, size: 'sm', color: '#1B4965', flex: 3, align: 'end', weight: 'bold' },
    ],
    paddingAll: '8px',
    margin: 'sm',
  } as FlexComponent);

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '預收餘額', weight: 'bold', size: 'lg', color: '#FFFFFF' },
        { type: 'text', text: '已繳費、未上課的剩餘金額', size: 'xs', color: '#C0D6E4', margin: 'sm' },
      ],
      paddingAll: '20px',
      backgroundColor: '#375A7F',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: rows,
      paddingAll: '12px',
    },
  };
}
