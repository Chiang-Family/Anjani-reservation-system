import { getLineClient } from './client';
import type { messagingApi } from '@line/bot-sdk';

type Message = messagingApi.Message;
type FlexContainer = messagingApi.FlexContainer;
type QuickReplyItem = messagingApi.QuickReplyItem;

export async function replyText(
  replyToken: string,
  text: string,
  quickReplyItems?: QuickReplyItem[]
): Promise<void> {
  await getLineClient().replyMessage({
    replyToken,
    messages: [{
      type: 'text',
      text,
      ...(quickReplyItems && { quickReply: { items: quickReplyItems } }),
    }],
  });
}

export async function replyMessages(
  replyToken: string,
  messages: Message[]
): Promise<void> {
  await getLineClient().replyMessage({
    replyToken,
    messages,
  });
}

export async function replyFlex(
  replyToken: string,
  altText: string,
  contents: FlexContainer,
  quickReplyItems?: QuickReplyItem[]
): Promise<void> {
  await getLineClient().replyMessage({
    replyToken,
    messages: [
      {
        type: 'flex',
        altText,
        contents,
        ...(quickReplyItems && { quickReply: { items: quickReplyItems } }),
      },
    ],
  });
}

export async function replyFlexCarousel(
  replyToken: string,
  altText: string,
  bubbles: messagingApi.FlexBubble[]
): Promise<void> {
  await getLineClient().replyMessage({
    replyToken,
    messages: [
      {
        type: 'flex',
        altText,
        contents: {
          type: 'carousel',
          contents: bubbles.slice(0, 12),
        },
      },
    ],
  });
}
