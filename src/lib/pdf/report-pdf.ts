import path from 'path';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import type { ReportData } from '@/services/report.service';

// pdfmake server-side Printer (no types available)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinterModule = require('pdfmake/src/Printer');
const PdfPrinter = PdfPrinterModule.default || PdfPrinterModule;

const FONT_DIR = path.join(process.cwd(), 'fonts');

const printer = new PdfPrinter({
  NotoSansTC: {
    normal: path.join(FONT_DIR, 'NotoSansTC-Regular.otf'),
    bold: path.join(FONT_DIR, 'NotoSansTC-Bold.otf'),
    italics: path.join(FONT_DIR, 'NotoSansTC-Regular.otf'),
    bolditalics: path.join(FONT_DIR, 'NotoSansTC-Bold.otf'),
  },
});

// A4 = 595.28pt; margins [56, 40, 56, 60] → content width ≈ 483pt
// pdfmake column widths are content-only; padding is added outside.
// With padding 8+8 per column × 5 cols = 80pt, column widths must sum to 403.
const MARGIN_LR = 56;
const CONTENT_WIDTH = 483;
const COL_WIDTH_TOTAL = 403; // CONTENT_WIDTH - 5 cols × 16pt padding

const COLORS = {
  headerBg: '#3A6B8A',
  headerText: '#FFFFFF',
  totalBg: '#D5E3ED',
  separator: '#E0E0E0',
  sectionTitle: '#3A6B8A',
};

const GROUP_COLORS = ['#EBF0F5', '#FFFFFF'];

/** Build alternating row colors grouped by first column value (student name) */
function buildGroupColors(rows: (string | number)[][]): (string | null)[] {
  const colorMap = new Map<string, string>();
  let idx = 0;
  return rows.map(row => {
    if (row.length === 0 || row[0] === '合計') return null;
    const name = String(row[0]);
    if (!colorMap.has(name)) {
      colorMap.set(name, GROUP_COLORS[idx % GROUP_COLORS.length]);
      idx++;
    }
    return colorMap.get(name)!;
  });
}

function formatNumber(val: string | number, colIndex: number): string {
  if (typeof val === 'number') {
    return colIndex >= 3 ? val.toLocaleString() : String(val);
  }
  return String(val);
}

/** Section title with bottom border line (matches HTML h2 style) */
function sectionTitle(text: string, pageBreak?: boolean): Content[] {
  return [
    {
      text,
      style: 'sectionTitle',
      ...(pageBreak ? { pageBreak: 'before' as const } : {}),
    },
    {
      canvas: [{
        type: 'line' as const,
        x1: 0, y1: 0,
        x2: CONTENT_WIDTH, y2: 0,
        lineWidth: 2,
        lineColor: COLORS.sectionTitle,
      }],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    },
  ];
}

function buildTable(
  headers: string[],
  rows: (string | number)[][],
  dedup1stCol: boolean,
  widths: number[],
  rowColors?: (string | null)[],
  centerCols?: Set<number>,
): Content {
  const headerCells: TableCell[] = headers.map((h, i) => ({
    text: h,
    style: 'tableHeader',
    alignment: centerCols?.has(i) ? 'center' as const : undefined,
  }));

  const filteredRows = rows.filter(row => row.length > 0);
  const totalIdx = filteredRows.findIndex(row => row[0] === '合計');
  const hasTotal = totalIdx >= 0;
  const totalAtTop = hasTotal && totalIdx === 0;

  let prevFirst = '';
  const bodyCells: TableCell[][] = rows
    .filter(row => row.length > 0)
    .map(row => {
      const isTotal = row[0] === '合計';
      return row.map((cell, ci) => {
        let displayText = formatNumber(cell, ci);

        if (dedup1stCol && ci === 0 && !isTotal) {
          if (displayText === prevFirst) {
            displayText = '';
          } else {
            prevFirst = displayText;
          }
        }

        const cellDef: TableCell = {
          text: displayText,
          alignment: centerCols?.has(ci) ? 'center' as const : undefined,
        };

        if (isTotal) {
          cellDef.fillColor = COLORS.totalBg;
          cellDef.bold = true;
        }

        return cellDef;
      });
    });

  return {
    table: {
      headerRows: 1,
      widths,
      body: [headerCells, ...bodyCells],
    },
    layout: {
      // Clean horizontal lines only — no vertical lines (matches HTML)
      hLineWidth: (i: number, node: { table: { body: TableCell[][] } }) => {
        const total = node.table.body.length;
        if (i === 0) return 0;                             // no top border
        if (i === 1) return 2;                             // thick below header
        if (i === total) return 0;                         // no bottom border
        if (hasTotal && totalAtTop && i === 2) return 1.5; // below total row (top)
        if (hasTotal && !totalAtTop && i === total - 1) return 1.5; // above total row (bottom)
        return 0.5;                                        // thin separators
      },
      vLineWidth: () => 0,
      hLineColor: (i: number) => (i <= 1 ? COLORS.headerBg : COLORS.separator),
      fillColor: (rowIndex: number) => {
        if (rowIndex === 0) return COLORS.headerBg;
        if (rowColors && rowColors[rowIndex - 1]) return rowColors[rowIndex - 1];
        return null;
      },
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 16] as [number, number, number, number],
  };
}

export async function generateReportPdf(data: ReportData): Promise<Uint8Array> {
  const generatedAt = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  const monthStr = `${data.year}年${data.month}月`;

  const content: Content[] = [
    // Title banner with accent bar
    {
      canvas: [{
        type: 'rect' as const,
        x: 0, y: 0,
        w: 4, h: 52,
        color: COLORS.headerBg,
      }],
      margin: [0, 0, 0, -52] as [number, number, number, number],
    },
    {
      text: `安傑力月報表 ${monthStr}`,
      style: 'title',
      margin: [14, 0, 0, 2] as [number, number, number, number],
    },
    {
      text: `${data.coachName} 教練`,
      style: 'subtitle',
      margin: [14, 0, 0, 2] as [number, number, number, number],
    },
    {
      text: `報表產生時間：${generatedAt}`,
      style: 'meta',
      margin: [14, 0, 0, 0] as [number, number, number, number],
    },
    { text: '', margin: [0, 16, 0, 0] as [number, number, number, number] },
  ];

  // Summary section
  content.push(...sectionTitle('彙總'));
  if (data.summary.rows.length > 0) {
    const totalRow = data.summary.rows.find(r => r[0] === '合計');
    const detailRows = data.summary.rows.filter(r => r.length > 0 && r[0] !== '合計');

    // Total banner — dashboard-style metrics
    if (totalRow) {
      const metrics = [
        { value: String(totalRow[1]), label: '執行堂數' },
        { value: String(totalRow[2]), label: '執行時數(時)' },
        { value: `$${(totalRow[3] as number).toLocaleString()}`, label: '執行收入' },
        { value: `$${(totalRow[4] as number).toLocaleString()}`, label: '繳費金額' },
      ];
      content.push({
        table: {
          widths: ['*', '*', '*', '*'],
          body: [
            metrics.map(m => ({
              text: m.value,
              bold: true,
              fontSize: 16,
              alignment: 'center' as const,
              color: '#1A3A4F',
            })),
            metrics.map(m => ({
              text: m.label,
              fontSize: 8,
              alignment: 'center' as const,
              color: '#888888',
            })),
          ],
        },
        layout: {
          hLineWidth: (i: number) => (i === 0 || i === 2) ? 1.5 : 0,
          vLineWidth: () => 0,
          hLineColor: () => COLORS.headerBg,
          fillColor: () => COLORS.totalBg,
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: (i: number) => i === 0 ? 10 : 2,
          paddingBottom: (i: number) => i === 0 ? 2 : 8,
        },
        margin: [0, 0, 0, 12] as [number, number, number, number],
      });
    }

    // Detail table (students only, no total row)
    if (detailRows.length > 0) {
      const summaryColors = buildGroupColors(detailRows);
      content.push(buildTable(
        data.summary.headers,
        detailRows,
        false,
        [70, 68, 68, 91, 106],
        summaryColors,
      ));
    }
  } else {
    content.push({ text: '本月無資料', style: 'empty' });
  }

  // Checkins table
  // 學員 | 堂次 | 上課日期 | 上課時段 | 時長(分)
  content.push(...sectionTitle('上課明細', true));
  if (data.checkins.rows.length > 0) {
    const checkinRowColors = buildGroupColors(data.checkins.rows);

    content.push(buildTable(
      data.checkins.headers,
      data.checkins.rows,
      true,
      [70, 35, 112, 112, 74],
      checkinRowColors,
      new Set([1, 2, 3]),
    ));
  } else {
    content.push({ text: '本月無上課紀錄', style: 'empty' });
  }

  // Payments table
  // 學員 | 繳費日期 | 購買時數 | 每小時單價 | 繳費金額
  content.push(...sectionTitle('繳費明細', true));
  if (data.payments.rows.length > 0) {
    const paymentColors = buildGroupColors(data.payments.rows);
    content.push(buildTable(
      data.payments.headers,
      data.payments.rows,
      true,
      [70, 108, 55, 78, 92],
      paymentColors,
    ));
  } else {
    content.push({ text: '本月無繳費紀錄', style: 'empty' });
  }

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [MARGIN_LR, 40, MARGIN_LR, 60],
    defaultStyle: {
      font: 'NotoSansTC',
      fontSize: 10,
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: `${monthStr} \u2014 ${data.coachName} 教練`,
          alignment: 'left' as const,
          fontSize: 8,
          color: '#888888',
        },
        {
          text: `第${currentPage}頁/共${pageCount}頁`,
          alignment: 'right' as const,
          fontSize: 8,
          color: '#888888',
        },
      ],
      margin: [MARGIN_LR, 10, MARGIN_LR, 0] as [number, number, number, number],
    }),
    content,
    styles: {
      title: {
        fontSize: 22,
        bold: true,
        color: '#1A3A4F',
        margin: [0, 0, 0, 4],
      },
      subtitle: {
        fontSize: 14,
        bold: true,
        color: '#555555',
        margin: [0, 0, 0, 4],
      },
      meta: {
        fontSize: 9,
        color: '#999999',
        margin: [0, 0, 0, 0],
      },
      sectionTitle: {
        fontSize: 14,
        color: COLORS.sectionTitle,
        margin: [0, 16, 0, 4],
      },
      tableHeader: {
        fontSize: 10,
        color: COLORS.headerText,
        bold: true,
      },
      empty: {
        fontSize: 10,
        color: '#999999',
        italics: true,
        margin: [0, 4, 0, 16],
      },
    },
  };

  const doc = await printer.createPdfKitDocument(docDefinition);

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    doc.on('end', () => {
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(result);
    });
    doc.on('error', reject);
    doc.end();
  });
}
