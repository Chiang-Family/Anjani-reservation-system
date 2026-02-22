import type { messagingApi } from '@line/bot-sdk';
import { ACTION } from '@/lib/config/constants';
import type { Student, StudentHoursSummary } from '@/types';
import { formatHours } from '@/lib/utils/date';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function studentMgmtList(students: Array<Student & { summary: StudentHoursSummary; monthlyCheckinCount?: number; monthlyUnpaidCount?: number; historicalUnpaidCount?: number }>): FlexBubble[] {
  return students.map((student) => {
    const { summary } = student;
    const isPerSession = student.paymentType === '單堂';

    const monthlyUnpaid = student.monthlyUnpaidCount ?? 0;
    const historicalUnpaid = student.historicalUnpaidCount ?? 0;
    const bodyContents: FlexComponent[] = isPerSession
      ? [
          infoRow('單堂費用', `$${(student.perSessionFee ?? 0).toLocaleString()}`),
          infoRow('當月上課', `${student.monthlyCheckinCount ?? 0} 堂`),
          ...(monthlyUnpaid > 0
            ? [infoRow('當月欠費', `${monthlyUnpaid} 堂`, '#D4524A')]
            : []),
          ...(historicalUnpaid > 0
            ? [infoRow('歷史欠費', `${historicalUnpaid} 堂`, '#D4524A')]
            : []),
        ]
      : [
          infoRow('購買時數', formatHours(summary.purchasedHours)),
          infoRow('已上時數', formatHours(summary.completedHours)),
          infoRow('剩餘時數', formatHours(summary.remainingHours)),
        ];

    return {
      type: 'bubble',
      size: 'kilo',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: student.name,
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF',
          },
        ],
        paddingAll: '16px',
        backgroundColor: '#3E6B8A',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: bodyContents,
        paddingAll: '16px',
        spacing: 'sm',
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'postback',
              label: isPerSession ? '收款' : '收款/加值',
              data: `${ACTION.COLLECT_AND_ADD}:${student.id}`,
              displayText: isPerSession
                ? `為 ${student.name} 收款`
                : `為 ${student.name} 收款/加值`,
            },
            style: 'primary',
            color: '#4A8A6A',
            height: 'sm',
          },
          {
            type: 'button',
            action: {
              type: 'postback',
              label: isPerSession ? '當月上課/繳費' : '當期上課紀錄',
              data: `${ACTION.VIEW_STUDENT_HISTORY}:${student.id}`,
              displayText: `查看 ${student.name} 的上課紀錄`,
            },
            style: 'primary',
            color: '#4D80A8',
            height: 'sm',
          },
          ...(!isPerSession
            ? [{
              type: 'button',
              action: {
                type: 'postback',
                label: '繳費紀錄',
                data: `${ACTION.VIEW_PAYMENT_HISTORY}:${student.id}`,
                displayText: `查看 ${student.name} 的繳費紀錄`,
              },
              style: 'primary',
              color: '#6D5D85',
              height: 'sm',
            } as FlexComponent]
            : []),
        ] as FlexComponent[],
        paddingAll: '12px',
        spacing: 'sm',
      },
    } as FlexBubble;
  });
}

function infoRow(label: string, value: string, valueColor = '#333333'): FlexComponent {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'sm',
        color: '#999999',
        flex: 2,
      },
      {
        type: 'text',
        text: value,
        size: 'sm',
        color: valueColor,
        weight: valueColor !== '#333333' ? 'bold' : 'regular',
        flex: 3,
      },
    ],
  };
}
