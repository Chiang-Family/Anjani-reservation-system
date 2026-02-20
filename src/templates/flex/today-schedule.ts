import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';
import type { ScheduleItem } from '@/services/coach.service';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function todayScheduleList(items: ScheduleItem[]): FlexBubble {
  const rows: FlexComponent[] = items.map((item) => {
    const statusText = item.isCheckedIn ? '✅ 已打卡' : '⏳ 未打卡';
    const statusColor = item.isCheckedIn ? '#27ae60' : '#e67e22';

    const contents: FlexComponent[] = [
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
          {
            type: 'text',
            text: statusText,
            size: 'xs',
            color: statusColor,
            flex: 2,
            align: 'end',
          },
        ],
      },
    ];

    // Add check-in button for unchecked students with Notion ID
    if (!item.isCheckedIn && item.studentNotionId) {
      contents.push({
        type: 'button',
        action: {
          type: 'postback',
          label: '幫打卡',
          data: `${ACTION.COACH_CHECKIN}:${item.studentNotionId}`,
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
  });

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '今日課表',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `共 ${items.length} 堂課`,
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
      contents: rows,
      paddingAll: '12px',
      spacing: 'none',
    },
  };
}
