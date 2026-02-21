import type { messagingApi } from '@line/bot-sdk';
import type { CheckinRecord, PaymentRecord } from '@/types';
import { formatHours } from '@/lib/utils/date';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function classHistoryCard(
  studentName: string,
  records: CheckinRecord[],
  remainingHours: number
): FlexBubble {
  const totalCount = records.length;

  // records 目前是從近到遠 (newest first)
  // 加上序號（i=0 是最新一筆，對應總數 totalCount）
  const withSequence = records.map((r, i) => ({
    ...r,
    sequence: totalCount - i
  }));

  // 取最近 10 筆，並反轉陣列（變成由遠至近，如 "第 19 堂", "第 20 堂", "第 21 堂" 往下排）
  const recent = withSequence.slice(0, 10).reverse();

  const rows: FlexComponent[] = recent.length > 0
    ? recent.map((r) => ({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: `${r.sequence}`, // 移除 #
          size: 'sm',
          color: '#888888',
          flex: 1, // 減小：堂數與日期靠近
        },
        {
          type: 'text',
          text: (() => {
            const [y, m, d] = r.classDate.split('-');
            return `${parseInt(y, 10) - 1911}-${m}-${d}`;
          })(),
          size: 'sm',
          color: '#555555',
          flex: 4, // 增加比例，拉開與時段的距離
        },
        {
          type: 'text',
          text: r.classTimeSlot,
          size: 'sm',
          color: '#333333',
          flex: 4, // 相對應縮小比例
        },
        {
          type: 'text',
          text: r.durationMinutes > 0 ? `${r.durationMinutes}分` : '-',
          size: 'sm',
          color: '#333333',
          flex: 2,
          align: 'end',
        },
      ],
      margin: 'sm',
    } as FlexComponent))
    : [
      {
        type: 'text',
        text: '目前沒有上課紀錄。',
        size: 'sm',
        color: '#999999',
        margin: 'md',
      } as FlexComponent,
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
          text: '上課紀錄',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `${studentName}｜剩餘 ${formatHours(remainingHours)}`,
          size: 'sm',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#1B4965',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: '堂數',
              size: 'xs',
              color: '#999999',
              weight: 'bold',
              flex: 1, // 對齊資料列
            },
            {
              type: 'text',
              text: '日期',
              size: 'xs',
              color: '#999999',
              weight: 'bold',
              flex: 4, // 與資料列一致
            },
            {
              type: 'text',
              text: '時段',
              size: 'xs',
              color: '#999999',
              weight: 'bold',
              flex: 4, // 與資料列一致
            },
            {
              type: 'text',
              text: '時長',
              size: 'xs',
              color: '#999999',
              weight: 'bold',
              flex: 2,
              align: 'end',
            },
          ],
        },
        {
          type: 'separator',
          margin: 'sm',
        } as FlexComponent,
        ...rows,
        ...(records.length > 10
          ? [
            {
              type: 'text',
              text: `⋯ 還有 ${records.length - 10} 筆紀錄`,
              size: 'xs',
              color: '#999999',
              margin: 'md',
              align: 'center',
            } as FlexComponent,
          ]
          : []),
      ],
      paddingAll: '16px',
      spacing: 'none',
    },
  };
}

function toRocDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(y, 10) - 1911}/${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export function paymentPeriodSelector(
  studentName: string,
  payments: PaymentRecord[],
  studentId: string,
  remainingHours: number
): FlexBubble {
  const buttons: FlexComponent[] = payments.map((p, i) => ({
    type: 'button',
    action: {
      type: 'postback',
      label: `${toRocDate(p.createdAt)} ｜ ${p.purchasedHours}hr ｜ $${p.totalAmount.toLocaleString()}`,
      data: `${ACTION.VIEW_CLASS_BY_PAYMENT}:${studentId}:${i}`,
      displayText: `查詢 ${toRocDate(p.createdAt)} 上課紀錄`,
    },
    style: 'secondary',
    height: 'sm',
    margin: 'sm',
  } as FlexComponent));

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '上課紀錄',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `${studentName}｜剩餘 ${formatHours(remainingHours)}`,
          size: 'sm',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#1B4965',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '請選擇繳費期數查看上課紀錄：',
          size: 'sm',
          color: '#555555',
          margin: 'none',
        } as FlexComponent,
        ...buttons,
      ],
      paddingAll: '16px',
    },
  };
}
