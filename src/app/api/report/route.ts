import { NextRequest, NextResponse } from 'next/server';
import { verifyReportToken } from '@/lib/utils/report-token';
import { compileMonthlyReport } from '@/services/report.service';
import type { ReportData } from '@/services/report.service';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const coachId = searchParams.get('coach');
  const yearStr = searchParams.get('year');
  const monthStr = searchParams.get('month');
  const token = searchParams.get('token');

  if (!coachId || !yearStr || !monthStr || !token) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }

  if (!verifyReportToken(coachId, year, month, token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const data = await compileMonthlyReport({ coachId }, year, month);
  if (!data) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  }

  const html = renderReportHtml(data);
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function renderTable(headers: string[], rows: (string | number)[][]) {
  const ths = headers.map(h => `<th>${h}</th>`).join('');
  const trs = rows.map((row, i) => {
    if (row.length === 0) return '<tr class="spacer"><td colspan="' + headers.length + '"></td></tr>';
    const isTotal = row[0] === '合計';
    const cls = isTotal ? ' class="total"' : (i % 2 === 1 ? ' class="stripe"' : '');
    const tds = row.map((cell, ci) => {
      const val = typeof cell === 'number'
        ? (ci >= 3 ? cell.toLocaleString() : cell)
        : cell;
      return `<td>${val}</td>`;
    }).join('');
    return `<tr${cls}>${tds}</tr>`;
  }).join('\n');
  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

function renderReportHtml(data: ReportData): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${data.title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Noto Sans TC", "Microsoft JhengHei", sans-serif;
    color: #333; background: #f5f5f5; padding: 16px;
  }
  .container { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.1); padding: 24px; }
  h1 { font-size: 20px; margin-bottom: 4px; color: #2c3e50; }
  .subtitle { color: #777; font-size: 14px; margin-bottom: 24px; }
  h2 { font-size: 16px; margin: 24px 0 8px; color: #3A6B8A; border-bottom: 2px solid #3A6B8A; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 8px; }
  th { background: #3A6B8A; color: #fff; font-weight: 600; text-align: left; padding: 8px 10px; white-space: nowrap; }
  td { padding: 6px 10px; border-bottom: 1px solid #e0e0e0; }
  tr.stripe td { background: #f9f9f9; }
  tr.total td { font-weight: 700; border-top: 2px solid #333; background: #f0f0f0; }
  tr.spacer td { padding: 2px; border: none; }
  .print-btn { display: inline-block; margin-bottom: 16px; padding: 8px 20px; background: #3A6B8A; color: #fff; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; }
  .print-btn:hover { background: #2c5570; }
  .empty { color: #999; font-style: italic; padding: 12px 0; }
  @media print {
    body { background: #fff; padding: 0; }
    .container { box-shadow: none; padding: 0; }
    .print-btn { display: none; }
    h1 { font-size: 18px; }
    table { font-size: 12px; }
    th { background: #ddd !important; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr.stripe td { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr.total td { background: #eee !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h2 { break-after: avoid; }
    table { break-inside: auto; }
    tr { break-inside: avoid; }
  }
  @media (max-width: 600px) {
    .container { padding: 12px; border-radius: 0; }
    table { font-size: 12px; }
    td, th { padding: 4px 6px; }
  }
</style>
</head>
<body>
<div class="container">
  <button class="print-btn" onclick="window.print()">列印報表</button>
  <h1>${data.title}</h1>
  <p class="subtitle">報表產生時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</p>

  <h2>彙總</h2>
  ${data.summary.rows.length > 0
    ? renderTable(data.summary.headers, data.summary.rows)
    : '<p class="empty">本月無資料</p>'}

  <h2>上課明細</h2>
  ${data.checkins.rows.length > 0
    ? renderTable(data.checkins.headers, data.checkins.rows)
    : '<p class="empty">本月無上課紀錄</p>'}

  <h2>繳費明細</h2>
  ${data.payments.rows.length > 0
    ? renderTable(data.payments.headers, data.payments.rows)
    : '<p class="empty">本月無繳費紀錄</p>'}
</div>
</body>
</html>`;
}
