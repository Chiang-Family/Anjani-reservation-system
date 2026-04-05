import type { messagingApi } from '@line/bot-sdk';
import type { CoachPrepaidBalance, StudentPrepaidRow } from '@/services/stats.service';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

const ROWS_PER_PAGE = 15;

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

function headerRow(): FlexComponent[] {
  return [
    {
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
    } as FlexComponent,
    { type: 'separator', color: '#CCCCCC' } as FlexComponent,
  ];
}

function buildPage(
  pageRows: StudentPrepaidRow[],
  startIdx: number,
  pageNum: number,
  totalPages: number,
  totalPrepaid: number,
  totalStudents: number,
): FlexBubble {
  const rows: FlexComponent[] = [...headerRow()];

  for (let i = 0; i < pageRows.length; i++) {
    const r = pageRows[i];
    const globalIdx = startIdx + i;
    rows.push(studentRow(r.name, r.pricePerHour, r.remainingHours, r.prepaidAmount, globalIdx % 2 === 1 ? '#F5F5F5' : undefined));
  }

  // 合計列（每頁底部都顯示）
  rows.push({ type: 'separator', color: '#CCCCCC', margin: 'sm' } as FlexComponent);
  rows.push({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: `合計 (${totalStudents} 人)`, size: 'sm', color: '#333333', flex: 8, weight: 'bold' },
      { type: 'text', text: `$${totalPrepaid.toLocaleString()}`, size: 'sm', color: '#1B4965', flex: 3, align: 'end', weight: 'bold' },
    ],
    paddingAll: '8px',
    margin: 'sm',
  } as FlexComponent);

  const subtitle = totalPages > 1
    ? `已繳費、未上課的剩餘金額 (${pageNum}/${totalPages})`
    : '已繳費、未上課的剩餘金額';

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '預收餘額', weight: 'bold', size: 'lg', color: '#FFFFFF' },
        { type: 'text', text: subtitle, size: 'xs', color: '#C0D6E4', margin: 'sm' },
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

export function prepaidBalanceCard(data: CoachPrepaidBalance): FlexBubble | messagingApi.FlexCarousel {
  const totalPages = Math.ceil(data.rows.length / ROWS_PER_PAGE);

  if (totalPages <= 1) {
    return buildPage(data.rows, 0, 1, 1, data.totalPrepaid, data.rows.length);
  }

  // Carousel（最多 12 頁）
  const bubbles: FlexBubble[] = [];
  for (let p = 0; p < Math.min(totalPages, 12); p++) {
    const start = p * ROWS_PER_PAGE;
    const pageRows = data.rows.slice(start, start + ROWS_PER_PAGE);
    bubbles.push(buildPage(pageRows, start, p + 1, totalPages, data.totalPrepaid, data.rows.length));
  }

  return { type: 'carousel', contents: bubbles };
}
