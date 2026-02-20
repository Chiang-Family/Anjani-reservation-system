import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;

const CAPACITY_OPTIONS = [1, 2, 4, 6];

export function createSlotCapacity(
  dateStr: string,
  startTimeStr: string,
  endTimeStr: string,
  displayDate: string,
  displayStartTime: string,
  displayEndTime: string
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
          text: '新增課程 — 步驟 3/3',
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
          text: `時段：${displayStartTime}–${displayEndTime}`,
          size: 'md',
          weight: 'bold',
          margin: 'sm',
        },
        {
          type: 'text',
          text: '請選擇容納人數：',
          size: 'sm',
          color: '#555555',
          margin: 'lg',
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      contents: CAPACITY_OPTIONS.map((cap) => ({
        type: 'button' as const,
        action: {
          type: 'postback' as const,
          label: `${cap} 人`,
          data: `${ACTION.CREATE_SLOT_CONFIRM}:${dateStr}:${startTimeStr}:${endTimeStr}:${cap}`,
          displayText: `選擇人數：${cap} 人`,
        },
        style: 'primary' as const,
        color: '#2D6A4F',
        flex: 1,
      })) as messagingApi.FlexComponent[],
      paddingAll: '16px',
      spacing: 'sm',
    },
  };
}
