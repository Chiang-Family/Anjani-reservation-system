import type { messagingApi } from '@line/bot-sdk';
import { KEYWORD } from '@/lib/config/constants';

type QuickReplyItem = messagingApi.QuickReplyItem;

export function studentQuickReply(_paymentType?: string): QuickReplyItem[] {
  // Rich Menu 已常駐：近期預約、上課紀錄、繳費紀錄、注意事項
  return [quickReplyButton(KEYWORD.MENU)];
}

export function coachQuickReply(): QuickReplyItem[] {
  // Rich Menu 已常駐：每日課表、學員管理、每週統計、每月統計
  return [
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
