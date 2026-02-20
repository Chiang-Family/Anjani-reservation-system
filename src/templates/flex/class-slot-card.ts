import type { messagingApi } from '@line/bot-sdk';
import type { ClassSlot } from '@/types';
import { ACTION } from '@/lib/config/constants';
import { formatSlotDisplay } from '@/lib/utils/date';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function classSlotCard(slot: ClassSlot): FlexBubble {
  const remaining = slot.maxCapacity - slot.currentCount;

  const bodyContents: FlexComponent[] = [
    {
      type: 'text',
      text: formatSlotDisplay(slot.date, slot.startTime, slot.endTime),
      size: 'sm',
      color: '#555555',
    },
    {
      type: 'text',
      text: `名額：${remaining}/${slot.maxCapacity}`,
      size: 'sm',
      color: remaining <= 2 ? '#ff4444' : '#555555',
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
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '預約此課程',
            data: `${ACTION.RESERVE}:${slot.id}`,
            displayText: `預約 ${slot.title}`,
          },
          style: 'primary',
          color: '#4a90d9',
        },
      ],
      paddingAll: '16px',
    },
  };
}
