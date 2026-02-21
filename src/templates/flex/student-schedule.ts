import type { messagingApi } from '@line/bot-sdk';
import type { CalendarEvent } from '@/types';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function studentScheduleCard(
  studentName: string,
  events: CalendarEvent[],
  fromDate: string,
  toDate: string
): FlexBubble {
  const fromRoc = toRocDate(fromDate);
  const toRoc = toRocDate(toDate);

  const rows: FlexComponent[] = events.length > 0
    ? events.map((e) => {
      const d = new Date(e.date + 'T00:00:00+08:00');
      const weekday = WEEKDAYS[d.getDay()];
      const [y, m, day] = e.date.split('-');
      const dateStr = `${parseInt(m, 10)}/${parseInt(day, 10)}（${weekday}）`;
      return {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: dateStr,
            size: 'sm',
            color: '#555555',
            flex: 5,
          },
          {
            type: 'text',
            text: `${e.startTime}-${e.endTime}`,
            size: 'sm',
            color: '#333333',
            flex: 4,
            align: 'end',
          },
        ],
        margin: 'sm',
      } as FlexComponent;
    })
    : [
      {
        type: 'text',
        text: '下週沒有排課。',
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
          text: '下週課程',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `${studentName}｜${fromRoc} ~ ${toRoc}`,
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
              flex: 5,
            },
            {
              type: 'text',
              text: '時段',
              size: 'xs',
              color: '#999999',
              weight: 'bold',
              flex: 4,
              align: 'end',
            },
          ],
        },
        {
          type: 'separator',
          margin: 'sm',
        } as FlexComponent,
        ...rows,
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
