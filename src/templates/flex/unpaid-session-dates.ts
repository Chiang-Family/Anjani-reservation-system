import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';
import type { CheckinRecord } from '@/types';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

function toRocDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(y, 10) - 1911}-${m}-${d}`;
}

/**
 * 單堂學員未繳費課程卡片
 * 每個未繳費日期一個按鈕，觸發 session_pay:{studentId}:{date}
 */
export function unpaidSessionDatesCard(
  studentName: string,
  studentId: string,
  perSessionFee: number,
  unpaidCheckins: CheckinRecord[]
): FlexBubble {
  // 按日期降序排列（最近的在上面）
  const sorted = [...unpaidCheckins].sort((a, b) => b.classDate.localeCompare(a.classDate));

  const buttons: FlexComponent[] = sorted.map(checkin => ({
    type: 'button',
    action: {
      type: 'postback',
      label: `${toRocDate(checkin.classDate)} ${checkin.classTimeSlot}`,
      data: `${ACTION.SESSION_PAYMENT}:${studentId}:${checkin.classDate}`,
      displayText: `繳費 ${toRocDate(checkin.classDate)}`,
    },
    style: 'primary',
    color: '#e74c3c',
    height: 'sm',
    margin: 'sm',
  } as FlexComponent));

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '未繳費課程',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `${studentName}｜單堂 $${perSessionFee.toLocaleString()}`,
          size: 'sm',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
      backgroundColor: '#243447',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `共 ${sorted.length} 堂未繳費，請選擇繳費日期：`,
          size: 'sm',
          color: '#555555',
          margin: 'none',
        } as FlexComponent,
        ...buttons,
      ],
      paddingAll: '16px',
    },
  };
}
