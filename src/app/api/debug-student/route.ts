import { NextResponse } from 'next/server';
import { findStudentByName } from '@/lib/notion/students';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get('name') ?? '蔡宜庭';

  const student = await findStudentByName(name);
  return NextResponse.json({ student });
}
