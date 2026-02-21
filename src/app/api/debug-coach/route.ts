import { NextResponse } from 'next/server';
import { getAllCoaches } from '@/lib/notion/coaches';
import { getAllStudents } from '@/lib/notion/students';

export async function GET() {
  try {
    const [coaches, students] = await Promise.all([
      getAllCoaches(),
      getAllStudents(),
    ]);
    return NextResponse.json({
      coaches: coaches.map((c) => ({
        name: c.name,
        lineUrl: c.lineUrl,
        hasLineUrl: !!c.lineUrl,
      })),
      sampleStudents: students.slice(0, 3).map((s) => ({
        name: s.name,
        coachId: s.coachId,
        hasCoachId: !!s.coachId,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
