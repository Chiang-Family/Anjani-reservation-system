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

function uriButton(label: string, uri: string, color = '#4A90D9'): messagingApi.FlexButton {
  return {
    type: 'button',
    action: {
      type: 'uri',
      label,
      uri,
    },
    style: 'primary',
    color,
    margin: 'sm',
  };
}

export function studentMenu(name: string, coachLineUrl?: string, paymentType?: string): FlexBubble {
  const isPerSession = paymentType === '單堂';

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '安傑力課程管理系統',
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
        menuButton(KEYWORD.UPCOMING_CLASSES, '#2D6A4F'),
        menuButton(isPerSession ? KEYWORD.SESSION_CLASS_HISTORY : KEYWORD.CLASS_HISTORY, '#3D5A80'),
        ...(!isPerSession
          ? [menuButton(KEYWORD.PAYMENT_HISTORY, '#6D597A')]
          : []),
        ...(coachLineUrl
          ? [uriButton('聯繫教練', coachLineUrl, '#C0392B')]
          : []),
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
          text: '安傑力教練管理系統',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#1A2A3A',
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
        menuButton(KEYWORD.TODAY_SCHEDULE, '#2F4858'),
        menuButton(KEYWORD.STUDENT_MGMT, '#4A5E6D'),
        menuButton(KEYWORD.ADD_STUDENT, '#5A7A6B'),
        menuButton(KEYWORD.MONTHLY_STATS, '#4A4462'),
      ] as messagingApi.FlexComponent[],
      paddingAll: '16px',
      spacing: 'sm',
    },
  };
}
