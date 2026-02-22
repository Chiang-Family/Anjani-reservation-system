import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

function toRocDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(y, 10) - 1911}-${m}-${d}`;
}

/**
 * 收款期數選擇卡片：新的一期 or 補繳到現有期
 * periodDates: 現有繳費期（按日期降序，已去重）
 * periodHoursMap: { date → totalHours } 各期合計時數
 */
export function paymentPeriodChoiceCard(
  studentName: string,
  studentId: string,
  amount: number,
  pricePerHour: number,
  hours: number,
  periodDates: string[],
  periodHoursMap: Map<string, number>
): FlexBubble {
  const newPeriodBtn: FlexComponent = {
    type: 'button',
    action: {
      type: 'postback',
      label: '新的一期',
      data: `${ACTION.CONFIRM_PAYMENT}:${studentId}:${amount}:${pricePerHour}:new`,
      displayText: '新的一期',
    },
    style: 'primary',
    color: '#3A6B5A',
    height: 'sm',
    margin: 'sm',
  };

  const supplementBtns: FlexComponent[] = periodDates.map(date => {
    const totalHrs = periodHoursMap.get(date) ?? 0;
    return {
      type: 'button',
      action: {
        type: 'postback',
        label: `補繳到 ${toRocDate(date)}（${totalHrs}hr）`,
        data: `${ACTION.CONFIRM_PAYMENT}:${studentId}:${amount}:${pricePerHour}:${date}`,
        displayText: `補繳到 ${toRocDate(date)}`,
      },
      style: 'secondary',
      height: 'sm',
      margin: 'sm',
    } as FlexComponent;
  });

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '收款確認',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `${studentName}｜$${amount.toLocaleString()}｜${hours}hr`,
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
          text: '請選擇歸入哪一期：',
          size: 'sm',
          color: '#555555',
          margin: 'none',
        } as FlexComponent,
        newPeriodBtn,
        ...supplementBtns,
      ],
      paddingAll: '16px',
    },
  };
}
