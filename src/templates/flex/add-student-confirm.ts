import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';
import type { ParsedStudent } from '@/services/student-management.service';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function addStudentConfirmCard(parsed: ParsedStudent): FlexBubble {
  const detailItems: FlexComponent[] = [
    {
      type: 'text',
      text: `姓名：${parsed.name}`,
      size: 'md',
      weight: 'bold',
    },
  ];

  let postbackData: string;

  if (parsed.type === '單堂') {
    detailItems.push(
      {
        type: 'text',
        text: '收費方式：單堂',
        size: 'sm',
        color: '#555555',
        margin: 'sm',
      },
      {
        type: 'text',
        text: `單堂費用：${parsed.perSessionFee} 元`,
        size: 'sm',
        color: '#555555',
        margin: 'sm',
      },
    );
    postbackData = `${ACTION.ADD_STUDENT_CONFIRM}:${encodeURIComponent(parsed.name)}:1:${parsed.perSessionFee}`;
  } else {
    detailItems.push(
      {
        type: 'text',
        text: `購買時數：${parsed.hours} 小時`,
        size: 'sm',
        color: '#555555',
        margin: 'sm',
      },
      {
        type: 'text',
        text: `每小時單價：${parsed.price} 元`,
        size: 'sm',
        color: '#555555',
        margin: 'sm',
      },
    );
    postbackData = `${ACTION.ADD_STUDENT_CONFIRM}:${encodeURIComponent(parsed.name)}:${parsed.hours}:${parsed.price}`;
  }

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
      backgroundColor: '#1E352D',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: detailItems,
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
            data: postbackData,
          },
          style: 'primary',
          color: '#1E352D',
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
      ] as FlexComponent[],
      paddingAll: '16px',
      spacing: 'sm',
    },
  };
}
