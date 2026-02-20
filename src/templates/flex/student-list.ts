import type { messagingApi } from '@line/bot-sdk';
import type { Reservation } from '@/types';
import { ACTION, RESERVATION_STATUS } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function studentListCard(
  slotTitle: string,
  reservations: Reservation[],
  slotId?: string
): FlexBubble {
  const checkedIn = reservations.filter((r) => r.status === RESERVATION_STATUS.CHECKED_IN);

  const studentRows: FlexComponent[] = reservations.map((r) => {
    const name = r.studentName || '學員';
    const statusLabel =
      r.status === RESERVATION_STATUS.CHECKED_IN ? ' [已報到]' : '';

    const contents: FlexComponent[] = [
      {
        type: 'text',
        text: `${name}${statusLabel}`,
        size: 'sm',
        color: r.status === RESERVATION_STATUS.CHECKED_IN ? '#27ae60' : '#333333',
        flex: 3,
      },
    ];

    if (r.status === RESERVATION_STATUS.RESERVED) {
      contents.push({
        type: 'button',
        action: {
          type: 'postback',
          label: '報到',
          data: `${ACTION.COACH_CHECKIN}:${r.id}`,
          displayText: `幫 ${name} 報到`,
        },
        style: 'primary',
        color: '#27ae60',
        height: 'sm',
        flex: 2,
      });
    }

    return {
      type: 'box' as const,
      layout: 'horizontal' as const,
      contents,
      alignItems: 'center' as const,
    };
  });

  const bodyContents: FlexComponent[] =
    studentRows.length > 0
      ? studentRows
      : [{ type: 'text', text: '尚無學員預約', size: 'sm', color: '#999999' }];

  const footerContents: FlexComponent[] = [];
  if (slotId) {
    footerContents.push({
      type: 'button',
      action: {
        type: 'postback',
        label: '編輯人數',
        data: `${ACTION.EDIT_CAPACITY}:${slotId}`,
        displayText: '編輯人數上限',
      },
      style: 'secondary',
    });
  }

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: slotTitle,
          weight: 'bold',
          size: 'lg',
          color: '#1a1a1a',
        },
        {
          type: 'text',
          text: `已報到 ${checkedIn.length} / 已預約 ${reservations.length}`,
          size: 'xs',
          color: '#888888',
          margin: 'sm',
        },
      ],
      paddingAll: '16px',
      backgroundColor: '#f5f5f5',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
      paddingAll: '16px',
      spacing: 'md',
    },
  };

  if (footerContents.length > 0) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      contents: footerContents,
      paddingAll: '16px',
    };
  }

  return bubble;
}
