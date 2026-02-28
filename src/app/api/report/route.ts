import { NextRequest, NextResponse } from 'next/server';
import { verifyReportToken } from '@/lib/utils/report-token';
import { compileMonthlyReport } from '@/services/report.service';
import { generateReportPdf } from '@/lib/pdf/report-pdf';

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

  const pdfBuffer = await generateReportPdf(data);
  const filename = `${data.year}-${String(data.month).padStart(2, '0')}-${data.coachName}.pdf`;

  return new Response(Buffer.from(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
}
