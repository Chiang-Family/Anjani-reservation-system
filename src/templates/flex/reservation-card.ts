import type { messagingApi } from '@line/bot-sdk';
import type { Reservation } from '@/types';
import { ACTION, RESERVATION_STATUS } from '@/lib/config/constants';
import { formatSlotDisplay } from '@/lib/utils/date';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function reservationCard(reservation: Reservation): FlexBubble {
  const statusColor = getStatusColor(reservation.status);
  const buttons: FlexComponent[] = [];

  if (reservation.status === RESERVATION_STATUS.RESERVED) {
    buttons.push(
      {
        type: 'button',
        action: {
          type: 'postback',
          label: '取消預約',
          data: `${ACTION.CONFIRM_CANCEL}:${reservation.id}`,
          displayText: '取消預約',
        },
        style: 'secondary',
      },
      {
        type: 'button',
        action: {
          type: 'postback',
          label: '請假',
          data: `${ACTION.CONFIRM_LEAVE}:${reservation.id}`,
          displayText: '請假',
        },
        style: 'secondary',
      }
    );
  }

  const title = reservation.classSlotTitle || '課程';
  const bodyContents: FlexComponent[] = [];

  if (reservation.date && reservation.startTime) {
    bodyContents.push({
      type: 'text',
      text: formatSlotDisplay(reservation.date, reservation.startTime, reservation.endTime || ''),
      size: 'sm',
      color: '#555555',
    });
  }

  if (bodyContents.length === 0) {
    bodyContents.push({
      type: 'text',
      text: reservation.status,
      size: 'sm',
      color: statusColor,
    });
  }

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: title,
          weight: 'bold',
          size: 'md',
          flex: 3,
        },
        {
          type: 'text',
          text: reservation.status,
          size: 'xs',
          color: statusColor,
          align: 'end',
          flex: 1,
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
    },
  };

  if (buttons.length > 0) {
    bubble.footer = {
      type: 'box',
      layout: 'horizontal',
      contents: buttons,
      spacing: 'sm',
      paddingAll: '16px',
    };
  }

  return bubble;
}

function getStatusColor(status: string): string {
  switch (status) {
    case RESERVATION_STATUS.RESERVED:
      return '#4a90d9';
    case RESERVATION_STATUS.CHECKED_IN:
      return '#27ae60';
    case RESERVATION_STATUS.CANCELLED:
      return '#e74c3c';
    case RESERVATION_STATUS.ON_LEAVE:
      return '#f39c12';
    default:
      return '#999999';
  }
}
