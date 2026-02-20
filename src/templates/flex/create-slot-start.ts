import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';
import { format, addDays } from 'date-fns';
import { nowTaipei } from '@/lib/utils/date';

type FlexBubble = messagingApi.FlexBubble;

export function createSlotStart(): FlexBubble {
  const now = nowTaipei();
  const minDate = format(now, "yyyy-MM-dd'T'06:00");
  const maxDate = format(addDays(now, 30), "yyyy-MM-dd'T'22:00");

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '新增課程 — 步驟 1/3',
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
          text: '請選擇課程的開始日期與時間：',
          size: 'md',
          wrap: true,
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'datetimepicker',
            label: '選擇日期時間',
            data: ACTION.CREATE_SLOT_START,
            mode: 'datetime',
            initial: format(now, "yyyy-MM-dd'T'HH:00"),
            min: minDate,
            max: maxDate,
          },
          style: 'primary',
          color: '#2D6A4F',
        },
      ] as messagingApi.FlexComponent[],
      paddingAll: '16px',
    },
  };
}
