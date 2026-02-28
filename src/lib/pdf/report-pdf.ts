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
    bold: path.join(FONT_DIR, 'NotoSansTC-Regular.otf'),
    italics: path.join(FONT_DIR, 'NotoSansTC-Regular.otf'),
    bolditalics: path.join(FONT_DIR, 'NotoSansTC-Regular.otf'),
  },
});

const COLORS = {
  headerBg: '#3A6B8A',
  headerText: '#FFFFFF',
  totalBg: '#D5E3ED',
  border: '#CCCCCC',
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

function buildTable(
  headers: string[],
  rows: (string | number)[][],
  dedup1stCol: boolean,
  widths: (string | number)[],
  rowColors?: (string | null)[],
  centerCols?: Set<number>,
): Content {
  const headerCells: TableCell[] = headers.map((h, i) => ({
    text: h,
    style: 'tableHeader',
    alignment: centerCols?.has(i) ? 'center' as const : undefined,
  }));

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
          cellDef.fontSize = 10;
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
      hLineWidth: (i: number, node: { table: { body: TableCell[][] } }) =>
        i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
      vLineWidth: () => 0.5,
      hLineColor: (i: number) => (i <= 1 ? COLORS.headerBg : COLORS.border),
      vLineColor: () => COLORS.border,
      fillColor: (rowIndex: number) => {
        if (rowIndex === 0) return COLORS.headerBg;
        if (rowColors && rowColors[rowIndex - 1]) return rowColors[rowIndex - 1];
        return null;
      },
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 0, 0, 16] as [number, number, number, number],
  };
}

export async function generateReportPdf(data: ReportData): Promise<Uint8Array> {
  const generatedAt = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  const monthStr = `${data.year}年${data.month}月`;

  const content: Content[] = [
    {
      text: `安傑力月報表 ${monthStr}`,
      style: 'title',
    },
    {
      text: `${data.coachName} 教練`,
      style: 'subtitle',
    },
    {
      text: `報表產生時間：${generatedAt}`,
      style: 'meta',
    },
    { text: '', margin: [0, 8, 0, 0] as [number, number, number, number] },
  ];

  // Summary table — student group coloring
  content.push({ text: '彙總', style: 'sectionTitle' });
  if (data.summary.rows.length > 0) {
    const summaryColors = buildGroupColors(data.summary.rows);
    content.push(buildTable(
      data.summary.headers,
      data.summary.rows,
      false,
      [60, '*', '*', 70, 70],
      summaryColors,
    ));
  } else {
    content.push({ text: '本月無資料', style: 'empty' });
  }

  // Checkins table — page break + per-student lesson number + group coloring
  content.push({ text: '上課明細', style: 'sectionTitle', pageBreak: 'before' as const });
  if (data.checkins.rows.length > 0) {
    const checkinHeaders = [data.checkins.headers[0], '堂次', ...data.checkins.headers.slice(1)];
    const studentCounter = new Map<string, number>();
    const checkinRows = data.checkins.rows.map(row => {
      const name = String(row[0]);
      const count = (studentCounter.get(name) ?? 0) + 1;
      studentCounter.set(name, count);
      return [row[0], `#${count}`, ...row.slice(1)];
    });
    const checkinRowColors = buildGroupColors(checkinRows);

    content.push(buildTable(
      checkinHeaders,
      checkinRows,
      true,
      [60, 35, '*', '*', 50],
      checkinRowColors,
      new Set([1, 2, 3]),
    ));
  } else {
    content.push({ text: '本月無上課紀錄', style: 'empty' });
  }

  // Payments table — page break + student group coloring
  content.push({ text: '繳費明細', style: 'sectionTitle', pageBreak: 'before' as const });
  if (data.payments.rows.length > 0) {
    const paymentColors = buildGroupColors(data.payments.rows);
    content.push(buildTable(
      data.payments.headers,
      data.payments.rows,
      true,
      [60, '*', 60, '*', '*'],
      paymentColors,
    ));
  } else {
    content.push({ text: '本月無繳費紀錄', style: 'empty' });
  }

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [48, 40, 48, 60],
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
      margin: [48, 10, 48, 0] as [number, number, number, number],
    }),
    content,
    styles: {
      title: {
        fontSize: 18,
        color: '#2C3E50',
        margin: [0, 0, 0, 2],
      },
      subtitle: {
        fontSize: 14,
        color: '#555555',
        margin: [0, 0, 0, 2],
      },
      meta: {
        fontSize: 9,
        color: '#999999',
        margin: [0, 0, 0, 0],
      },
      sectionTitle: {
        fontSize: 13,
        color: COLORS.sectionTitle,
        margin: [0, 8, 0, 6],
      },
      tableHeader: {
        fontSize: 10,
        color: COLORS.headerText,
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
