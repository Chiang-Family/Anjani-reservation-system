import type { messagingApi } from '@line/bot-sdk';
import { KEYWORD } from '@/lib/config/constants';

type QuickReplyItem = messagingApi.QuickReplyItem;

export function studentQuickReply(_paymentType?: string): QuickReplyItem[] | undefined {
  // Rich Menu 已常駐，學員不需要 Quick Reply
  return undefined;
}

export function coachQuickReply(): QuickReplyItem[] {
  // Rich Menu 已常駐：每日課表、學員管理、每週統計、每月統計
  return [
    quickReplyButton(KEYWORD.ADD_STUDENT),
    quickReplyButton(KEYWORD.MISSING_CHECKINS),
    quickReplyButton(KEYWORD.ANNUAL_STATS),
    quickReplyButton(KEYWORD.MONTHLY_REPORT),
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
