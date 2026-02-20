import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron/auth';
import { sendWeeklyReports } from '@/services/cron.service';

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendWeeklyReports();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('weekly-report cron error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
