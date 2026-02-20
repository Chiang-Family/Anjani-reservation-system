import type { messagingApi } from '@line/bot-sdk';

type FlexBubble = messagingApi.FlexBubble;

export function confirmDialog(
  title: string,
  message: string,
  confirmAction: { label: string; data: string },
  cancelLabel = '取消',
  confirmColor = '#e74c3c'
): FlexBubble {
  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: title,
          weight: 'bold',
          size: 'lg',
          color: '#1a1a1a',
        },
        {
          type: 'text',
          text: message,
          size: 'sm',
          color: '#555555',
          margin: 'lg',
          wrap: true,
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
            type: 'message',
            label: cancelLabel,
            text: cancelLabel,
          },
          style: 'secondary',
          flex: 1,
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: confirmAction.label,
            data: confirmAction.data,
            displayText: confirmAction.label,
          },
          style: 'primary',
          color: confirmColor,
          flex: 1,
        },
      ],
      spacing: 'sm',
      paddingAll: '16px',
    },
  };
}
