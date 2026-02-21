import type { messagingApi } from '@line/bot-sdk';
import { KEYWORD } from '@/lib/config/constants';

type QuickReplyItem = messagingApi.QuickReplyItem;

export function studentQuickReply(): QuickReplyItem[] {
  return [
    quickReplyButton(KEYWORD.CLASS_HISTORY),
    quickReplyButton(KEYWORD.PAYMENT_HISTORY),
    quickReplyButton(KEYWORD.MENU),
  ];
}

export function coachQuickReply(): QuickReplyItem[] {
  return [
    quickReplyButton(KEYWORD.TODAY_SCHEDULE),
    quickReplyButton(KEYWORD.COACH_CHECKIN),
    quickReplyButton(KEYWORD.STUDENT_MGMT),
    quickReplyButton(KEYWORD.MONTHLY_STATS),
    quickReplyButton(KEYWORD.MENU),
  ];
}

export function menuQuickReply(): QuickReplyItem[] {
  return [quickReplyButton(KEYWORD.MENU)];
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
