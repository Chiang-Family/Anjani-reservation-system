import { getLineClient } from './client';
import type { messagingApi } from '@line/bot-sdk';

type Message = messagingApi.Message;
type FlexContainer = messagingApi.FlexContainer;

export async function replyText(replyToken: string, text: string): Promise<void> {
  await getLineClient().replyMessage({
    replyToken,
    messages: [{ type: 'text', text }],
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
  contents: FlexContainer
): Promise<void> {
  await getLineClient().replyMessage({
    replyToken,
    messages: [
      {
        type: 'flex',
        altText,
        contents,
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
          contents: bubbles,
        },
      },
    ],
  });
}
