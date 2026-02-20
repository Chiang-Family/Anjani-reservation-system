import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron/auth';
import { markAbsentReservations } from '@/services/cron.service';

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await markAbsentReservations();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('mark-absent cron error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
