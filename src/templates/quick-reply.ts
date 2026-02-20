import type { messagingApi } from '@line/bot-sdk';
import { KEYWORD } from '@/lib/config/constants';

type QuickReplyItem = messagingApi.QuickReplyItem;

export function studentQuickReply(): QuickReplyItem[] {
  return [
    quickReplyButton(KEYWORD.RESERVE),
    quickReplyButton(KEYWORD.MY_RESERVATIONS),
    quickReplyButton(KEYWORD.CHECKIN),
    quickReplyButton(KEYWORD.REMAINING),
  ];
}

export function coachQuickReply(): QuickReplyItem[] {
  return [
    quickReplyButton(KEYWORD.TODAY_CLASSES),
    quickReplyButton(KEYWORD.UPCOMING_CLASSES),
  ];
}

function quickReplyButton(label: string): QuickReplyItem {
  return {
    type: 'action',
    action: {
      type: 'message',
      label,
      text: label,
    },
  };
}
