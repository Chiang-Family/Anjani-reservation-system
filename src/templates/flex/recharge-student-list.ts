import type { messagingApi } from '@line/bot-sdk';
import type { Student } from '@/types';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;

export function rechargeStudentList(students: Student[]): FlexBubble[] {
  return students.slice(0, 10).map((student) => ({
    type: 'bubble' as const,
    size: 'kilo' as const,
    body: {
      type: 'box' as const,
      layout: 'vertical' as const,
      contents: [
        {
          type: 'text' as const,
          text: student.name,
          weight: 'bold' as const,
          size: 'lg' as const,
          color: '#1a1a1a',
        },
        {
          type: 'text' as const,
          text: `剩餘堂數：${student.remainingClasses} 堂`,
          size: 'sm' as const,
          color: '#555555',
          margin: 'md' as const,
        },
      ] as messagingApi.FlexComponent[],
      paddingAll: '16px',
    },
    footer: {
      type: 'box' as const,
      layout: 'vertical' as const,
      contents: [
        {
          type: 'button' as const,
          action: {
            type: 'postback' as const,
            label: '充值',
            data: `${ACTION.RECHARGE_SELECT}:${student.id}`,
            displayText: `充值 ${student.name}`,
          },
          style: 'primary' as const,
          color: '#4A90D9',
        },
      ] as messagingApi.FlexComponent[],
      paddingAll: '16px',
    },
  }));
}
