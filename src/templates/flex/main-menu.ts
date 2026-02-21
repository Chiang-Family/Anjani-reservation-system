import type { messagingApi } from '@line/bot-sdk';
import { KEYWORD } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;

function menuButton(label: string, color = '#4A90D9'): messagingApi.FlexButton {
  return {
    type: 'button',
    action: {
      type: 'message',
      label,
      text: label,
    },
    style: 'primary',
    color,
    margin: 'sm',
  };
}

export function studentMenu(name: string): FlexBubble {
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'Anjani 健身管理',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#1B4965',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `${name}，歡迎回來！`,
          weight: 'bold',
          size: 'md',
        },
        {
          type: 'text',
          text: '請選擇要使用的功能：',
          size: 'sm',
          color: '#555555',
          margin: 'md',
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        menuButton(KEYWORD.CLASS_HISTORY, '#4A90D9'),
        menuButton(KEYWORD.PAYMENT_HISTORY),
      ] as messagingApi.FlexComponent[],
      paddingAll: '16px',
      spacing: 'sm',
    },
  };
}

export function coachMenu(name: string): FlexBubble {
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'Anjani 教練管理',
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
          text: `${name} 教練，歡迎回來！`,
          weight: 'bold',
          size: 'md',
        },
        {
          type: 'text',
          text: '請選擇要使用的功能：',
          size: 'sm',
          color: '#555555',
          margin: 'md',
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        menuButton(KEYWORD.TODAY_SCHEDULE),
        menuButton(KEYWORD.COACH_CHECKIN, '#27ae60'),
        menuButton(KEYWORD.STUDENT_MGMT, '#e67e22'),
        menuButton(KEYWORD.ADD_STUDENT, '#f39c12'),
        menuButton(KEYWORD.MONTHLY_STATS, '#8e44ad'),
      ] as messagingApi.FlexComponent[],
      paddingAll: '16px',
      spacing: 'sm',
    },
  };
}
