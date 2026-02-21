import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;

export function addStudentConfirmCard(
  name: string,
  hours: number,
  price: number
): FlexBubble {
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '確認新增學員',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#2D6A4F',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `姓名：${name}`,
          size: 'md',
          weight: 'bold',
        },
        {
          type: 'text',
          text: `購買時數：${hours} 小時`,
          size: 'sm',
          color: '#555555',
          margin: 'sm',
        },
        {
          type: 'text',
          text: `每小時單價：${price} 元`,
          size: 'sm',
          color: '#555555',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '確認新增',
            data: `${ACTION.ADD_STUDENT_CONFIRM}:${encodeURIComponent(name)}:${hours}:${price}`,
          },
          style: 'primary',
          color: '#2D6A4F',
        },
        {
          type: 'button',
          action: {
            type: 'message',
            label: '取消',
            text: '選單',
          },
          style: 'secondary',
          margin: 'sm',
        },
      ] as messagingApi.FlexComponent[],
      paddingAll: '16px',
      spacing: 'sm',
    },
  };
}
