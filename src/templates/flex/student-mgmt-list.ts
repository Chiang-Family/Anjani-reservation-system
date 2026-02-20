import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';
import type { Student } from '@/types';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function studentMgmtList(students: Student[]): FlexBubble[] {
  return students.map((student) => {
    const remaining = student.purchasedClasses - student.completedClasses;
    const paymentStatus = student.isPaid ? '已繳費' : '未繳費';
    const paymentColor = student.isPaid ? '#27ae60' : '#e74c3c';

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
          infoRow('購買堂數', `${student.purchasedClasses} 堂`),
          infoRow('已上堂數', `${student.completedClasses} 堂`),
          infoRow('剩餘堂數', `${remaining} 堂`),
          infoRow('每堂單價', `${student.pricePerClass} 元`),
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: '繳費狀態',
                size: 'sm',
                color: '#999999',
                flex: 2,
              },
              {
                type: 'text',
                text: paymentStatus,
                size: 'sm',
                weight: 'bold',
                color: paymentColor,
                flex: 3,
              },
            ],
          },
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
              label: '加值堂數（續約）',
              data: `${ACTION.ADD_CLASSES}:${student.id}`,
              displayText: `為 ${student.name} 加值堂數`,
            },
            style: 'primary',
            color: '#27ae60',
            height: 'sm',
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: '修改購買堂數',
              data: `${ACTION.EDIT_CLASSES}:${student.id}`,
              displayText: `修改 ${student.name} 的購買堂數`,
            },
            style: 'primary',
            color: '#4A90D9',
            height: 'sm',
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: '修改每堂單價',
              data: `${ACTION.EDIT_PRICE}:${student.id}`,
              displayText: `修改 ${student.name} 的每堂單價`,
            },
            style: 'primary',
            color: '#4A90D9',
            height: 'sm',
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: student.isPaid ? '標記為未繳費' : '標記為已繳費',
              data: `${ACTION.TOGGLE_PAYMENT}:${student.id}`,
              displayText: `切換 ${student.name} 的繳費狀態`,
            },
            style: 'primary',
            color: student.isPaid ? '#e74c3c' : '#27ae60',
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
