import type { messagingApi } from '@line/bot-sdk';
import type { CheckinRecord } from '@/types';
import { formatHours } from '@/lib/utils/date';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function classHistoryCard(
  studentName: string,
  records: CheckinRecord[],
  remainingHours: number
): FlexBubble {
  const recent = records.slice(0, 10);

  const rows: FlexComponent[] = recent.length > 0
    ? recent.map((r) => ({
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: r.classDate,
            size: 'sm',
            color: '#555555',
            flex: 4,
          },
          {
            type: 'text',
            text: r.classTimeSlot,
            size: 'sm',
            color: '#333333',
            flex: 4,
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
              text: '日期',
              size: 'xs',
              color: '#999999',
              weight: 'bold',
              flex: 4,
            },
            {
              type: 'text',
              text: '時段',
              size: 'xs',
              color: '#999999',
              weight: 'bold',
              flex: 4,
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
