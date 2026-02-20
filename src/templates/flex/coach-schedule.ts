import type { messagingApi } from '@line/bot-sdk';
import type { ClassSlot } from '@/types';
import { ACTION } from '@/lib/config/constants';
import { formatSlotDisplay } from '@/lib/utils/date';

type FlexBubble = messagingApi.FlexBubble;
type FlexContainer = messagingApi.FlexContainer;
type FlexComponent = messagingApi.FlexComponent;

export function coachScheduleCard(slot: ClassSlot): FlexBubble {
  const bodyContents: FlexComponent[] = [
    {
      type: 'text',
      text: formatSlotDisplay(slot.date, slot.startTime, slot.endTime),
      size: 'sm',
      color: '#555555',
    },
    {
      type: 'text',
      text: `已預約：${slot.currentCount}/${slot.maxCapacity} 人`,
      size: 'sm',
      color: '#555555',
      margin: 'sm',
    },
  ];

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: slot.title,
          weight: 'bold',
          size: 'lg',
          color: '#1a1a1a',
        },
      ],
      paddingAll: '16px',
      backgroundColor: '#f5f5f5',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      paddingAll: '16px',
      spacing: 'sm',
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '查看學員',
            data: `${ACTION.VIEW_STUDENTS}:${slot.id}`,
            displayText: `查看 ${slot.title} 學員`,
          },
          style: 'primary',
          color: '#4a90d9',
          flex: 1,
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '刪除課程',
            data: `${ACTION.CONFIRM_DELETE_SLOT}:${slot.id}`,
            displayText: `刪除 ${slot.title}`,
          },
          style: 'secondary',
          flex: 1,
        },
      ] as FlexComponent[],
      spacing: 'sm',
      paddingAll: '16px',
    },
  };
}

export function coachScheduleList(slots: ClassSlot[]): FlexContainer {
  if (slots.length === 1) {
    return coachScheduleCard(slots[0]);
  }

  return {
    type: 'carousel',
    contents: slots.slice(0, 10).map(coachScheduleCard),
  };
}
