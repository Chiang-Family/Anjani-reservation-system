import type { messagingApi } from '@line/bot-sdk';
import type { PaymentRecord, StudentHoursSummary } from '@/types';
import { formatHours } from '@/lib/utils/date';

type FlexBubble = messagingApi.FlexBubble;
type FlexComponent = messagingApi.FlexComponent;

export function paymentHistoryCard(
    studentName: string,
    records: PaymentRecord[],
    summary: StudentHoursSummary
): FlexBubble {
    const recent = records.slice(0, 10);

    const rows: FlexComponent[] = recent.length > 0
        ? recent.map((r) => ({
            type: 'box',
            layout: 'horizontal',
            contents: [
                {
                    type: 'text',
                    text: (() => {
                        const [y, m, d] = r.createdAt.split('-');
                        return `${parseInt(y, 10) - 1911}-${m}-${d}`;
                    })(),
                    size: 'sm',
                    color: '#555555',
                    flex: 3,
                },
                {
                    type: 'text',
                    text: `${r.purchasedHours}hr`,
                    size: 'sm',
                    color: '#333333',
                    flex: 3,
                    align: 'center',
                },
                {
                    type: 'text',
                    text: `$${r.totalAmount.toLocaleString()}`,
                    size: 'sm',
                    color: '#333333',
                    flex: 3,
                    align: 'end',
                },
                {
                    type: 'text',
                    text: r.status,
                    size: 'xs',
                    color: r.status === '已繳費' ? '#27ae60' : r.status === '部分繳費' ? '#f39c12' : '#e74c3c',
                    flex: 3,
                    align: 'end',
                    weight: 'bold',
                },
            ],
            margin: 'sm',
        } as FlexComponent))
        : [
            {
                type: 'text',
                text: '目前沒有繳費紀錄。',
                size: 'sm',
                color: '#999999',
                margin: 'md',
            } as FlexComponent,
        ];

    return {
        type: 'bubble',
        size: 'mega',
        header: {
            type: 'box',
            layout: 'vertical',
            contents: [
                {
                    type: 'text',
                    text: '繳費紀錄',
                    weight: 'bold',
                    size: 'lg',
                    color: '#FFFFFF',
                },
                {
                    type: 'text',
                    text: `${studentName}｜剩餘 ${formatHours(summary.remainingHours)}`,
                    size: 'sm',
                    color: '#FFFFFFCC',
                    margin: 'sm',
                },
            ],
            paddingAll: '20px',
            backgroundColor: '#1B4965',
        },
        body: {
            type: 'box',
            layout: 'vertical',
            contents: [
                {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                        {
                            type: 'text',
                            text: '日期',
                            size: 'xs',
                            color: '#999999',
                            weight: 'bold',
                            flex: 3,
                        },
                        {
                            type: 'text',
                            text: '時數',
                            size: 'xs',
                            color: '#999999',
                            weight: 'bold',
                            flex: 3,
                            align: 'center',
                        },
                        {
                            type: 'text',
                            text: '總金額',
                            size: 'xs',
                            color: '#999999',
                            weight: 'bold',
                            flex: 3,
                            align: 'end',
                        },
                        {
                            type: 'text',
                            text: '狀態',
                            size: 'xs',
                            color: '#999999',
                            weight: 'bold',
                            flex: 3,
                            align: 'end',
                        },
                    ],
                },
                {
                    type: 'separator',
                    margin: 'sm',
                } as FlexComponent,
                ...rows,
                ...(records.length > 10
                    ? [
                        {
                            type: 'text',
                            text: `⋯ 還有 ${records.length - 10} 筆紀錄`,
                            size: 'xs',
                            color: '#999999',
                            margin: 'md',
                            align: 'center',
                        } as FlexComponent,
                    ]
                    : []),
            ],
            paddingAll: '16px',
            spacing: 'none',
        },
    };
}
