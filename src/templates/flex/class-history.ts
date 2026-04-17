import type { messagingApi } from '@line/bot-sdk';
import type { CheckinRecord, PaymentRecord } from '@/types';
import { formatHours } from '@/lib/utils/date';
import { ACTION } from '@/lib/config/constants';

type FlexBubble = messagingApi.FlexBubble;
type FlexCarousel = messagingApi.FlexCarousel;
type FlexContainer = messagingApi.FlexContainer;
type FlexComponent = messagingApi.FlexComponent;

const ROWS_PER_PAGE = 15;

function buildClassHistoryRows(
  pageRecords: Array<CheckinRecord & { sequence: number }>,
  isSharedPool: boolean,
): FlexComponent[] {
  return pageRecords.map((r) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: `${r.sequence}`,
        size: 'sm',
        color: '#888888',
        flex: 1,
      },
      {
        type: 'text',
        text: (() => {
          const [y, m, d] = r.classDate.split('-');
          const date = `${parseInt(y, 10) - 1911}-${m}-${d}`;
          if (r.studentName && isSharedPool) {
            return `${date}(${r.studentName.slice(0, 1)})`;
          }
          return date;
        })(),
        size: 'sm',
        color: '#555555',
        flex: 4,
      },
      {
        type: 'text',
        text: r.classTimeSlot,
        size: 'sm',
        color: '#333333',
        flex: 4,
      },
      {
        type: 'text',
        text: r.durationMinutes > 0 ? `${r.durationMinutes}分` : '-',
        size: 'sm',
        color: '#333333',
        flex: 2,
        align: 'end',
      },
    ],
    margin: 'sm',
  } as FlexComponent));
}

function buildClassHistoryBubble(
  studentName: string,
  pageRecords: Array<CheckinRecord & { sequence: number }>,
  remainingHours: number,
  isSharedPool: boolean,
  periodLabel?: string,
  pageInfo?: { page: number; total: number },
): FlexBubble {
  const rows: FlexComponent[] = pageRecords.length > 0
    ? buildClassHistoryRows(pageRecords, isSharedPool)
    : [{
      type: 'text',
      text: '目前沒有上課紀錄。',
      size: 'sm',
      color: '#999999',
      margin: 'md',
    } as FlexComponent];

  const subtitle = pageInfo
    ? `${studentName}｜第 ${pageRecords[0].sequence}–${pageRecords[pageRecords.length - 1].sequence} 堂（${pageInfo.page}/${pageInfo.total}）`
    : periodLabel
      ? `${studentName}｜${periodLabel}`
      : `${studentName}｜剩餘 ${formatHours(remainingHours)}`;

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: periodLabel ? `上課紀錄（${periodLabel}）` : '上課紀錄',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: subtitle,
          size: 'sm',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
      backgroundColor: periodLabel === '未繳費' ? '#c0392b' : '#1B4965',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '堂數', size: 'xs', color: '#999999', weight: 'bold', flex: 1 },
            { type: 'text', text: '日期', size: 'xs', color: '#999999', weight: 'bold', flex: 4 },
            { type: 'text', text: '時段', size: 'xs', color: '#999999', weight: 'bold', flex: 4 },
            { type: 'text', text: '時長', size: 'xs', color: '#999999', weight: 'bold', flex: 2, align: 'end' },
          ],
        },
        { type: 'separator', margin: 'sm' } as FlexComponent,
        ...rows,
      ],
      paddingAll: '16px',
      spacing: 'none',
    },
  };
}

export function classHistoryCard(
  studentName: string,
  records: CheckinRecord[],
  remainingHours: number,
  periodLabel?: string
): FlexContainer {
  const totalCount = records.length;

  // records 目前是從近到遠 (newest first)，加上序號後反轉為由遠至近
  const withSequence = records
    .map((r, i) => ({ ...r, sequence: totalCount - i }))
    .reverse();

  const allNames = new Set(records.map(r => r.studentName).filter(Boolean));
  const isSharedPool = allNames.size > 1;

  if (totalCount <= ROWS_PER_PAGE) {
    return buildClassHistoryBubble(studentName, withSequence, remainingHours, isSharedPool, periodLabel);
  }

  // 超過一頁：分頁成 carousel（最多 12 頁）
  const pages: Array<Array<CheckinRecord & { sequence: number }>> = [];
  for (let i = 0; i < withSequence.length; i += ROWS_PER_PAGE) {
    pages.push(withSequence.slice(i, i + ROWS_PER_PAGE));
  }
  const cappedPages = pages.slice(0, 12);

  const bubbles = cappedPages.map((pageRecords, idx) =>
    buildClassHistoryBubble(
      studentName,
      pageRecords,
      remainingHours,
      isSharedPool,
      periodLabel,
      { page: idx + 1, total: cappedPages.length },
    )
  );

  return { type: 'carousel', contents: bubbles } as FlexCarousel;
}

/** 單堂學員當月上課 + 繳費狀態合併卡片 */
export function sessionMonthlyCard(
  studentName: string,
  records: Array<CheckinRecord & { isPaid: boolean }>,
  historicalUnpaid?: CheckinRecord[],
): FlexBubble {
  const totalCount = records.length;
  const withSequence = records.map((r, i) => ({
    ...r,
    sequence: totalCount - i,
  }));
  const recent = withSequence.slice(0, ROWS_PER_PAGE).reverse();

  const rows: FlexComponent[] = recent.length > 0
    ? recent.map((r) => ({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: `${r.sequence}`,
          size: 'sm',
          color: '#888888',
          flex: 1,
        },
        {
          type: 'text',
          text: (() => {
            const [y, m, d] = r.classDate.split('-');
            const date = `${parseInt(y, 10) - 1911}-${m}-${d}`;
            const isJoint = r.studentName && r.studentName !== studentName;
            return isJoint ? `${date}(共)` : date;
          })(),
          size: 'sm',
          color: '#555555',
          flex: 4,
        },
        {
          type: 'text',
          text: r.classTimeSlot,
          size: 'sm',
          color: '#333333',
          flex: 4,
        },
        {
          type: 'text',
          text: r.isPaid ? '✅' : '❌',
          size: 'sm',
          flex: 2,
          align: 'end',
        },
      ],
      margin: 'sm',
    } as FlexComponent))
    : [
      {
        type: 'text',
        text: '本月沒有上課紀錄。',
        size: 'sm',
        color: '#999999',
        margin: 'md',
      } as FlexComponent,
    ];

  const monthUnpaid = records.filter(r => !r.isPaid).length;
  const histCount = historicalUnpaid?.length ?? 0;
  const totalUnpaid = monthUnpaid + histCount;

  // 歷史欠費區塊
  const historicalSection: FlexComponent[] = histCount > 0
    ? [
      { type: 'separator', margin: 'lg' } as FlexComponent,
      {
        type: 'text',
        text: `歷史欠費（${histCount} 堂）`,
        size: 'sm',
        color: '#e74c3c',
        weight: 'bold',
        margin: 'lg',
      } as FlexComponent,
      // 按日期降序排列，取最近 5 筆
      ...[...historicalUnpaid!].sort((a, b) => b.classDate.localeCompare(a.classDate)).slice(0, 5).map((r) => ({
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: (() => {
              const [y, m, d] = r.classDate.split('-');
              const date = `${parseInt(y, 10) - 1911}-${m}-${d}`;
              const isJoint = r.studentName && r.studentName !== studentName;
              return isJoint ? `${date}(共)` : date;
            })(),
            size: 'sm',
            color: '#555555',
            flex: 5,
          },
          {
            type: 'text',
            text: r.classTimeSlot,
            size: 'sm',
            color: '#333333',
            flex: 4,
          },
          {
            type: 'text',
            text: '❌',
            size: 'sm',
            flex: 2,
            align: 'end',
          },
        ],
        margin: 'sm',
      } as FlexComponent)),
      ...(histCount > 5
        ? [{
          type: 'text',
          text: `⋯ 還有 ${histCount - 5} 筆`,
          size: 'xs',
          color: '#999999',
          margin: 'md',
          align: 'center',
        } as FlexComponent]
        : []),
    ]
    : [];

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '當月上課紀錄',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: totalUnpaid > 0
            ? `${studentName}｜欠費 ${totalUnpaid} 堂`
            : `${studentName}｜全數已繳`,
          size: 'sm',
          color: '#FFFFFFCC',
          margin: 'sm',
        },
      ],
      paddingAll: '20px',
      backgroundColor: totalUnpaid > 0 ? '#c0392b' : '#1B4965',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '堂數', size: 'xs', color: '#999999', weight: 'bold', flex: 1 },
            { type: 'text', text: '日期', size: 'xs', color: '#999999', weight: 'bold', flex: 4 },
            { type: 'text', text: '時段', size: 'xs', color: '#999999', weight: 'bold', flex: 4 },
            { type: 'text', text: '繳費', size: 'xs', color: '#999999', weight: 'bold', flex: 2, align: 'end' },
          ],
        } as FlexComponent,
        { type: 'separator', margin: 'sm' } as FlexComponent,
        ...rows,
        ...(records.length > ROWS_PER_PAGE
          ? [{
            type: 'text',
            text: `⋯ 還有 ${records.length - ROWS_PER_PAGE} 筆紀錄`,
            size: 'xs',
            color: '#999999',
            margin: 'md',
            align: 'center',
          } as FlexComponent]
          : []),
        ...historicalSection,
      ],
      paddingAll: '16px',
      spacing: 'none',
    },
  };
}

function toRocDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(y, 10) - 1911}-${m}-${d}`;
}

export function paymentPeriodSelector(
  studentName: string,
  payments: PaymentRecord[],
  studentId: string,
  remainingHours: number,
  hasOverflow = false
): FlexBubble {
  const unpaidButton: FlexComponent[] = hasOverflow
    ? [{
      type: 'button',
      action: {
        type: 'postback',
        label: '未繳費（超出時數）',
        data: `${ACTION.VIEW_UNPAID_OVERFLOW}:${studentId}`,
        displayText: '查詢未繳費期間上課紀錄',
      },
      style: 'primary',
      color: '#e74c3c',
      height: 'sm',
      margin: 'sm',
    } as FlexComponent]
    : [];

  // 按繳費日期分組（同日期多筆合併為一期）
  const grouped = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    const list = grouped.get(p.createdAt) ?? [];
    list.push(p);
    grouped.set(p.createdAt, list);
  }

  // 按日期降序排列（與 payments 順序一致：最新在前）
  const sortedDates = [...grouped.keys()].sort((a, b) => b.localeCompare(a));

  const buttons: FlexComponent[] = sortedDates.map(date => {
    const periodPayments = grouped.get(date)!;
    const totalHours = periodPayments.reduce((sum, p) => sum + p.purchasedHours, 0);
    const totalPaid = periodPayments.reduce((sum, p) => sum + p.paidAmount, 0);
    const isMulti = periodPayments.length > 1;

    return {
      type: 'button',
      action: {
        type: 'postback',
        label: `${toRocDate(date)} ｜ ${totalHours}hr ｜ $${totalPaid.toLocaleString()}`,
        data: isMulti
          ? `${ACTION.VIEW_PAYMENT_DETAIL}:${studentId}:${date}`
          : `${ACTION.VIEW_CLASS_BY_PAYMENT}:${studentId}:${date}`,
        displayText: isMulti
          ? `查詢 ${toRocDate(date)} 繳費明細`
          : `查詢 ${toRocDate(date)} 上課紀錄`,
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
          text: '上課紀錄',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `${studentName}｜剩餘 ${formatHours(remainingHours)}`,
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
          type: 'text',
          text: '請選擇繳費期數查看上課紀錄：',
          size: 'sm',
          color: '#555555',
          margin: 'none',
        } as FlexComponent,
        ...unpaidButton,
        ...buttons,
      ],
      paddingAll: '16px',
    },
  };
}

export function paymentDetailCard(
  studentName: string,
  bucketDate: string,
  periodPayments: PaymentRecord[],
  studentId: string
): FlexBubble {
  const totalHours = periodPayments.reduce((sum, p) => sum + p.purchasedHours, 0);
  const totalPaid = periodPayments.reduce((sum, p) => sum + p.paidAmount, 0);

  const rows: FlexComponent[] = periodPayments.map(p => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: `${p.purchasedHours}hr`,
        size: 'sm',
        color: '#555555',
        flex: 2,
      },
      {
        type: 'text',
        text: `$${p.paidAmount.toLocaleString()}`,
        size: 'sm',
        color: '#333333',
        flex: 3,
        align: 'end',
      },
    ],
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
          text: '繳費明細',
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
        },
        {
          type: 'text',
          text: `${studentName}｜${toRocDate(bucketDate)}｜共 ${totalHours}hr`,
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
            { type: 'text', text: '時數', size: 'xs', color: '#999999', weight: 'bold', flex: 2 },
            { type: 'text', text: '金額', size: 'xs', color: '#999999', weight: 'bold', flex: 3, align: 'end' },
          ],
        } as FlexComponent,
        { type: 'separator', margin: 'sm' } as FlexComponent,
        ...rows,
        { type: 'separator', margin: 'md' } as FlexComponent,
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: '合計', size: 'sm', color: '#333333', weight: 'bold', flex: 2 },
            { type: 'text', text: `$${totalPaid.toLocaleString()}`, size: 'sm', color: '#333333', weight: 'bold', flex: 3, align: 'end' },
          ],
          margin: 'sm',
        } as FlexComponent,
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
            label: '查看上課紀錄',
            data: `${ACTION.VIEW_CLASS_BY_PAYMENT}:${studentId}:${bucketDate}`,
            displayText: `查詢 ${toRocDate(bucketDate)} 上課紀錄`,
          },
          style: 'primary',
          color: '#1B4965',
          height: 'sm',
        },
      ],
      paddingAll: '16px',
    },
  };
}
