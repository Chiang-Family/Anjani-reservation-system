import { getLineClient } from './client';
import type { messagingApi } from '@line/bot-sdk';

type Message = messagingApi.Message;
type FlexContainer = messagingApi.FlexContainer;
type QuickReplyItem = messagingApi.QuickReplyItem;

export async function pushText(userId: string, text: string, quickReplyItems?: QuickReplyItem[]): Promise<void> {
  await getLineClient().pushMessage({
    to: userId,
    messages: [{
      type: 'text',
      text,
      ...(quickReplyItems ? { quickReply: { items: quickReplyItems } } : {}),
    }],
  });
}

export async function pushFlex(
  userId: string,
  altText: string,
  contents: FlexContainer,
  quickReplyItems?: QuickReplyItem[],
): Promise<void> {
  await getLineClient().pushMessage({
    to: userId,
    messages: [
      {
        type: 'flex',
        altText,
        contents,
        ...(quickReplyItems ? { quickReply: { items: quickReplyItems } } : {}),
      },
    ],
  });
}

export async function pushMessages(
  userId: string,
  messages: Message[]
): Promise<void> {
  await getLineClient().pushMessage({
    to: userId,
    messages,
  });
}

export async function showLoading(userId: string, seconds: number = 10): Promise<void> {
  await getLineClient().showLoadingAnimation({
    chatId: userId,
    loadingSeconds: seconds,
  });
}
