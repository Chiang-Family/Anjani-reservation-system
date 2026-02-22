import type { messagingApi } from '@line/bot-sdk';
import { KEYWORD } from '@/lib/config/constants';

type QuickReplyItem = messagingApi.QuickReplyItem;

export function studentQuickReply(paymentType?: string): QuickReplyItem[] {
  const isPerSession = paymentType === '單堂';
  return [
    quickReplyButton(KEYWORD.NEXT_WEEK),
    quickReplyButton(isPerSession ? KEYWORD.SESSION_CLASS_HISTORY : KEYWORD.CLASS_HISTORY),
    ...(!isPerSession ? [quickReplyButton(KEYWORD.PAYMENT_HISTORY)] : []),
    quickReplyButton(KEYWORD.MENU),
  ];
}

export function coachQuickReply(): QuickReplyItem[] {
  return [
    quickReplyButton(KEYWORD.TODAY_SCHEDULE),
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
