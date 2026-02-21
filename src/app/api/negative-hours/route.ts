import { NextResponse } from 'next/server';
import { getAllStudents } from '@/lib/notion/students';
import { getStudentHoursSummary } from '@/lib/notion/hours';
import { pMap } from '@/lib/utils/concurrency';

export async function GET() {
  try {
    const students = await getAllStudents();
    const summaries = await pMap(students, (s) => getStudentHoursSummary(s.id));

    const negative = students
      .map((s, i) => ({
        name: s.name,
        remainingHours: summaries[i].remainingHours,
        purchasedHours: summaries[i].purchasedHours,
        completedHours: summaries[i].completedHours,
      }))
      .filter((s) => s.remainingHours < 0)
      .sort((a, b) => a.remainingHours - b.remainingHours);

    return NextResponse.json({ count: negative.length, students: negative });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
