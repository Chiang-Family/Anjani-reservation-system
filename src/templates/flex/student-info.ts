import type { messagingApi } from '@line/bot-sdk';
import type { Student } from '@/types';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function studentInfoCard(student: Student): FlexBubble {
  const rows: FlexComponent[] = [
    infoRow('姓名', student.name),
    infoRow('剩餘堂數', `${student.remainingClasses} 堂`),
  ];

  if (student.phone) rows.push(infoRow('電話', student.phone));
  if (student.status) rows.push(infoRow('狀態', student.status));

  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '學員資訊',
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
      contents: rows,
      paddingAll: '16px',
      spacing: 'md',
    },
  };
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
        wrap: true,
      },
    ],
  };
}
