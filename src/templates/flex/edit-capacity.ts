import type { messagingApi } from '@line/bot-sdk';
import type { ClassSlot } from '@/types';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function editCapacityCard(slot: ClassSlot): FlexBubble {
  const capacities = [2, 4, 6, 8];

  const buttons: FlexComponent[] = capacities.map((cap) => ({
    type: 'button' as const,
    action: {
      type: 'postback' as const,
      label: `${cap} 人`,
      data: `${ACTION.EDIT_CAPACITY_CONFIRM}:${slot.id}:${cap}`,
      displayText: `設定上限為 ${cap} 人`,
    },
    style: (cap === slot.maxCapacity ? 'primary' : 'secondary') as 'primary' | 'secondary',
    color: cap === slot.maxCapacity ? '#4a90d9' : undefined,
    height: 'sm' as const,
  }));

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '編輯人數上限',
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
      contents: [
        {
          type: 'text',
          text: slot.title,
          weight: 'bold',
          size: 'md',
        },
        {
          type: 'text',
          text: `目前上限：${slot.maxCapacity} 人（已預約 ${slot.currentCount} 人）`,
          size: 'sm',
          color: '#555555',
          margin: 'sm',
        },
      ],
      paddingAll: '16px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: buttons,
      paddingAll: '16px',
      spacing: 'sm',
    },
  };
}
