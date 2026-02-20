import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron/auth';
import { setupStudentRichMenu, setupCoachRichMenu } from '@/lib/line/rich-menu';

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const studentMenuId = await setupStudentRichMenu();
    const coachMenuId = await setupCoachRichMenu();

    return NextResponse.json({
      success: true,
      studentMenuId,
      coachMenuId,
      note: 'Set these as RICH_MENU_STUDENT_ID and RICH_MENU_COACH_ID in your environment variables.',
    });
  } catch (error) {
    console.error('Rich menu setup error:', error);
    return NextResponse.json({ error: 'Internal error', details: String(error) }, { status: 500 });
  }
}
