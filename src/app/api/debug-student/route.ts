import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron/auth';
import { findStudentByName } from '@/lib/notion/students';

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const name = url.searchParams.get('name') ?? '蔡宜庭';

  const student = await findStudentByName(name);
  return NextResponse.json({ student });
}
