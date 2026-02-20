import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;

interface DurationOption {
  label: string;
  minutes: number;
}

const DURATION_OPTIONS: DurationOption[] = [
  { label: '1 小時', minutes: 60 },
  { label: '1.5 小時', minutes: 90 },
  { label: '2 小時', minutes: 120 },
];

export function createSlotDuration(
  dateStr: string,
  startTimeStr: string,
  displayDate: string,
  displayTime: string
): FlexBubble {
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '新增課程 — 步驟 2/3',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#2D6A4F',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `日期：${displayDate}`,
          size: 'md',
          weight: 'bold',
        },
        {
          type: 'text',
          text: `開始時間：${displayTime}`,
          size: 'md',
          weight: 'bold',
          margin: 'sm',
        },
        {
          type: 'text',
          text: '請選擇課程時長：',
          size: 'sm',
          color: '#555555',
          margin: 'lg',
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: DURATION_OPTIONS.map((opt) => ({
        type: 'button' as const,
        action: {
          type: 'postback' as const,
          label: opt.label,
          data: `${ACTION.CREATE_SLOT_DURATION}:${dateStr}:${startTimeStr}:${opt.minutes}`,
          displayText: `選擇時長：${opt.label}`,
        },
        style: 'primary' as const,
        color: '#2D6A4F',
        margin: 'sm' as const,
      })) as messagingApi.FlexComponent[],
      paddingAll: '16px',
      spacing: 'sm',
    },
  };
}
