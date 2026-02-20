import type { messagingApi } from '@line/bot-sdk';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function emptyStateBubble(
  title: string,
  description: string,
  action?: { label: string; text: string }
): FlexBubble {
  const bubble: FlexBubble = {
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
          size: 'md',
          color: '#1a1a1a',
          wrap: true,
        },
        {
          type: 'text',
          text: description,
          size: 'sm',
          color: '#888888',
          margin: 'md',
          wrap: true,
        },
      ] as FlexComponent[],
      paddingAll: '20px',
      justifyContent: 'center',
      alignItems: 'center',
    },
  };

  if (action) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'message',
            label: action.label,
            text: action.text,
          },
          style: 'primary',
          color: '#4a90d9',
        },
      ],
      paddingAll: '16px',
    };
  }

  return bubble;
}
