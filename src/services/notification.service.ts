import { getStudentsByCoachId } from '@/lib/notion/students';
import { pushText } from '@/lib/line/push';
import type { ClassSlot } from '@/types';
import { formatSlotDisplay } from '@/lib/utils/date';

/** 通知教練的學員有新課程 */
export async function notifyCoachStudentsNewSlot(
  coachId: string,
  slot: ClassSlot,
  coachName: string
): Promise<void> {
  const students = await getStudentsByCoachId(coachId);
  if (students.length === 0) return;

  const slotDisplay = formatSlotDisplay(slot.date, slot.startTime, slot.endTime);
  const message = [
    `📢 ${coachName} 教練新增了課程！`,
    '',
    `📋 ${slot.title}`,
    `📅 ${slotDisplay}`,
    `👥 名額：${slot.maxCapacity} 人`,
    '',
    '輸入「預約課程」立即預約！',
  ].join('\n');

  const results = await Promise.allSettled(
    students.map((student) =>
      pushText(student.lineUserId, message)
    )
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(`Failed to notify ${failed.length}/${students.length} students about new slot`);
  }
}
