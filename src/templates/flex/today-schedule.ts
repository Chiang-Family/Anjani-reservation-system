import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';
import type { ScheduleItem } from '@/services/coach.service';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

function checkinStatus(studentChecked: boolean, coachChecked: boolean): { text: string; color: string } {
  if (studentChecked && coachChecked) {
    return { text: '✅ 雙方已打卡', color: '#27ae60' };
  }
  if (studentChecked) {
    return { text: '👤 學員已打卡', color: '#2980b9' };
  }
  if (coachChecked) {
    return { text: '🏋️ 教練已打卡', color: '#8e44ad' };
  }
  return { text: '⏳ 未打卡', color: '#e67e22' };
}

export function todayScheduleList(items: ScheduleItem[]): FlexBubble {
  const bothDone = (item: ScheduleItem) => item.studentChecked && item.coachChecked;

  const rows: FlexComponent[] = items.map((item) => {
    const status = checkinStatus(item.studentChecked, item.coachChecked);

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
            text: status.text,
            size: 'xs',
            color: status.color,
            margin: 'sm',
          },
        ],
      },
    ];

    // Show check-in button only if coach hasn't checked in yet and student is in Notion
    if (!item.coachChecked && item.studentNotionId) {
      contents.push({
        type: 'button',
        action: {
          type: 'postback',
          label: '教練打卡',
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
      backgroundColor: bothDone(item) ? '#f0fdf4' : '#ffffff',
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
