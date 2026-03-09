import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;

function toRocDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(y, 10) - 1911}-${m}-${d}`;
}

/**
 * 單堂繳費確認卡片
 * 顯示課程資訊與預設金額，提供「確認」和「調整金額」按鈕
 */
export function sessionPaymentConfirmCard(
  studentName: string,
  studentId: string,
  dateStr: string,
  timeSlot: string,
  durationMinutes: number,
  defaultFee: number,
): FlexBubble {
  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '單堂繳費確認',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: studentName,
          size: 'sm',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#3E6B8A',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '日期', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: toRocDate(dateStr), size: 'sm', color: '#333333', flex: 3, align: 'end' },
          ],
          margin: 'md',
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '時段', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: timeSlot || '-', size: 'sm', color: '#333333', flex: 3, align: 'end' },
          ],
          margin: 'sm',
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '時長', size: 'sm', color: '#888888', flex: 2 },
            { type: 'text', text: `${durationMinutes} 分鐘`, size: 'sm', color: '#333333', flex: 3, align: 'end' },
          ],
          margin: 'sm',
        },
        { type: 'separator', margin: 'lg' },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '收費金額', size: 'md', color: '#333333', weight: 'bold', flex: 2 },
            { type: 'text', text: `$${defaultFee.toLocaleString()}`, size: 'md', color: '#e74c3c', weight: 'bold', flex: 3, align: 'end' },
          ],
          margin: 'lg',
        },
      ],
      paddingAll: '16px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'postback',
            label: `確認 $${defaultFee.toLocaleString()}`,
            data: `${ACTION.CONFIRM_SESSION_PAY}:${studentId}:${dateStr}`,
            displayText: `確認繳費 $${defaultFee.toLocaleString()}`,
          },
          style: 'primary',
          color: '#4A8A6A',
          height: 'sm',
        },
        {
          type: 'button',
          action: {
            type: 'postback',
            label: '調整金額',
            data: `${ACTION.SESSION_PAY_CUSTOM}:${studentId}:${dateStr}`,
            displayText: '調整金額',
          },
          style: 'link',
          height: 'sm',
          margin: 'sm',
        },
      ],
      paddingAll: '12px',
    },
  };
}
