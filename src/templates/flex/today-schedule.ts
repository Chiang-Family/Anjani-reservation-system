import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';
import { todayDateString, addDays, formatDateLabel } from '@/lib/utils/date';
import type { ScheduleItem } from '@/services/coach.service';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export type ScheduleMode = 'schedule' | 'checkin';

export function scheduleList(items: ScheduleItem[], dateStr: string, mode: ScheduleMode = 'schedule'): FlexBubble {
  const today = todayDateString();
  const isToday = dateStr === today;
  const dateLabel = formatDateLabel(dateStr);

  const headerText = mode === 'checkin'
    ? (isToday ? `打卡清單 ${dateLabel}` : `補打卡 ${dateLabel}`)
    : (isToday ? `每日課表 ${dateLabel}` : `課表 ${dateLabel}`);

  const navAction = mode === 'checkin' ? ACTION.CHECKIN_SCHEDULE : ACTION.VIEW_SCHEDULE;

  const rows: FlexComponent[] = items.length > 0
    ? items.map((item) => {
      const statusText = item.isCheckedIn ? '✅ 已打卡' : '⏳ 未打卡';
      const statusColor = item.isCheckedIn ? '#27ae60' : '#e67e22';

      const contents: FlexComponent[] = [
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: `${item.event.startTime}–${item.event.endTime}`,
                  size: 'sm',
                  color: '#555555',
                  flex: 3,
                },
                {
                  type: 'text',
                  text: item.studentName,
                  size: 'sm',
                  weight: 'bold',
                  color: '#333333',
                  flex: 3,
                },
              ],
            },
            {
              type: 'text',
              text: statusText,
              size: 'xs',
              color: statusColor,
              margin: 'sm',
            },
          ],
        },
      ];

      if (!item.isCheckedIn && item.studentNotionId && item.isExactMatch) {
        contents.push({
          type: 'button',
          action: {
            type: 'postback',
            label: '打卡',
            data: `${ACTION.COACH_CHECKIN}:${item.studentNotionId}:${dateStr}`,
            displayText: `幫 ${item.studentName} 打卡`,
          },
          style: 'primary',
          color: '#27ae60',
          height: 'sm',
          margin: 'sm',
        } as FlexComponent);
      }

      return {
        type: 'box',
        layout: 'vertical',
        contents,
        paddingAll: '12px',
        backgroundColor: item.isCheckedIn ? '#f0fdf4' : '#ffffff',
        cornerRadius: '8px',
        margin: 'sm',
      } as FlexComponent;
    })
    : [
      {
        type: 'text',
        text: mode === 'checkin' ? '這天沒有安排課程。' : '這天沒有安排課程。',
        size: 'sm',
        color: '#999999',
        margin: 'md',
        align: 'center',
      } as FlexComponent,
    ];

  // Date picker (±7 days from today)
  const minDate = addDays(today, -7);
  const maxDate = addDays(today, 7);

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: headerText,
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `共 ${items.filter(i => i.studentNotionId).length} 堂課`,
          size: 'sm',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
      backgroundColor: mode === 'checkin' ? '#1B6549' : '#1B4965',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: rows,
      paddingAll: '12px',
      spacing: 'none',
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'button',
          action: {
            type: 'datetimepicker',
            label: '選擇日期',
            data: navAction,
            mode: 'date',
            initial: dateStr,
            min: minDate,
            max: maxDate,
          },
          style: 'link',
          height: 'sm',
        } as FlexComponent,
      ],
      paddingAll: '8px',
      spacing: 'sm',
    },
  };
}
