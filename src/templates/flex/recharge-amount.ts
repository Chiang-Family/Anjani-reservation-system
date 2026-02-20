import type { messagingApi } from '@line/bot-sdk';
import type { Student } from '@/types';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;

const RECHARGE_OPTIONS = [1, 4, 8, 12];

export function rechargeAmountSelector(student: Student): FlexBubble {
  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '選擇充值堂數',
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
          text: student.name,
          weight: 'bold',
          size: 'md',
        },
        {
          type: 'text',
          text: `目前堂數：${student.remainingClasses} 堂`,
          size: 'sm',
          color: '#555555',
          margin: 'sm',
        },
      ] as messagingApi.FlexComponent[],
      paddingAll: '16px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: RECHARGE_OPTIONS.map((amount) => ({
        type: 'button' as const,
        action: {
          type: 'postback' as const,
          label: `+${amount} 堂`,
          data: `${ACTION.RECHARGE_CONFIRM}:${student.id}:${amount}`,
          displayText: `充值 ${student.name} +${amount} 堂`,
        },
        style: 'primary' as const,
        color: '#4A90D9',
        margin: 'sm' as const,
      })) as messagingApi.FlexComponent[],
      paddingAll: '16px',
      spacing: 'sm',
    },
  };
}
