import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';
import type { Student, StudentHoursSummary } from '@/types';
import { formatHours } from '@/lib/utils/date';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function studentMgmtList(students: Array<Student & { summary: StudentHoursSummary }>): FlexBubble[] {
  return students.map((student) => {
    const { summary } = student;

    return {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: student.name,
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF',
          },
        ],
        paddingAll: '16px',
        backgroundColor: '#1B4965',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          infoRow('購買時數', formatHours(summary.purchasedHours)),
          infoRow('已上時數', formatHours(summary.completedHours)),
          infoRow('剩餘時數', formatHours(summary.remainingHours)),
        ] as FlexComponent[],
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
              label: '收款/加值',
              data: `${ACTION.COLLECT_AND_ADD}:${student.id}`,
              displayText: `為 ${student.name} 收款/加值`,
            },
            style: 'primary',
            color: '#27ae60',
            height: 'sm',
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: '打卡紀錄',
              data: `${ACTION.VIEW_STUDENT_HISTORY}:${student.id}`,
              displayText: `查看 ${student.name} 的打卡紀錄`,
            },
            style: 'primary',
            color: '#4A90D9',
            height: 'sm',
          },
        ] as FlexComponent[],
        paddingAll: '12px',
        spacing: 'sm',
      },
    } as FlexBubble;
  });
}

function infoRow(label: string, value: string): FlexComponent {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'sm',
        color: '#999999',
        flex: 2,
      },
      {
        type: 'text',
        text: value,
        size: 'sm',
        color: '#333333',
        flex: 3,
      },
    ],
  };
}
