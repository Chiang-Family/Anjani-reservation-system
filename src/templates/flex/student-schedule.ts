import type { messagingApi } from '@line/bot-sdk';
import type { CalendarEvent } from '@/types';
import { toZonedTime } from 'date-fns-tz';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

const TZ = 'Asia/Taipei';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function studentScheduleCard(
  studentName: string,
  events: CalendarEvent[],
): FlexBubble {
  const rows: FlexComponent[] = events.length > 0
    ? events.map((e) => {
      const d = toZonedTime(new Date(e.date + 'T00:00:00+08:00'), TZ);
      const weekday = WEEKDAYS[d.getDay()];
      const [, m, day] = e.date.split('-');
      const rocYear = parseInt(e.date.split('-')[0], 10) - 1911;
      const isJoint = e.summary.trim() !== studentName;
      const dateStr = `${rocYear}/${parseInt(m, 10)}/${parseInt(day, 10)}（${weekday}）${isJoint ? '(共)' : ''}`;
      return {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: dateStr,
            size: 'sm',
            color: '#555555',
            flex: 6,
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
        text: '目前沒有預約課程。',
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
          text: '近期預約',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: studentName,
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
              flex: 6,
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
