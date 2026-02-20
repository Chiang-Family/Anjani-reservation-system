import { updateCompletedClasses, getStudentById } from '@/lib/notion/students';
import { findCoachByLineId } from '@/lib/notion/coaches';
import { createCheckinRecord, findCheckinToday } from '@/lib/notion/checkins';
import { findStudentEventToday } from './calendar.service';
import { todayDateString, formatDateTime, nowTaipei, nowTaipeiISO } from '@/lib/utils/date';
import { pushText } from '@/lib/line/push';

export interface CheckinResult {
  success: boolean;
  message: string;
}

/** 教練幫學員打卡（直接扣堂） */
export async function coachCheckinForStudent(
  coachLineUserId: string,
  studentNotionId: string
): Promise<CheckinResult> {
  const coach = await findCoachByLineId(coachLineUserId);
  if (!coach) {
    return { success: false, message: '找不到教練資料。' };
  }

  const student = await getStudentById(studentNotionId);
  if (!student) {
    return { success: false, message: '找不到該學員資料。' };
  }

  const today = todayDateString();
  const existing = await findCheckinToday(student.id, today);

  if (existing) {
    return { success: false, message: `已經幫 ${student.name} 打過卡了！` };
  }

  const event = await findStudentEventToday(student.name);
  if (!event) {
    return { success: false, message: `今天沒有 ${student.name} 的課程安排。` };
  }

  const now = nowTaipei();
  const checkinTime = nowTaipeiISO();
  const classTimeSlot = `${event.startTime}-${event.endTime}`;

  // Create checkin record
  await createCheckinRecord({
    studentName: student.name,
    studentId: student.id,
    coachId: coach.id,
    classDate: today,
    classTimeSlot,
    checkinTime,
  });

  // Deduct 1 class
  const newCompleted = student.completedClasses + 1;
  await updateCompletedClasses(student.id, newCompleted);
  const remaining = student.purchasedClasses - newCompleted;

  // Push notification to student
  if (student.lineUserId) {
    const studentMsg = [
      '✅ 今日課程已完成打卡！',
      `📅 課程時段：${event.startTime}–${event.endTime}`,
      `📊 剩餘堂數：${remaining} 堂`,
      ...(remaining <= 1 ? [`\n⚠️ 剩餘堂數不多，請盡早聯繫教練續約。`] : []),
    ].join('\n');
    pushText(student.lineUserId, studentMsg).catch((err) =>
      console.error('Push notification to student failed:', err)
    );
  }

  let balanceWarning = '';
  if (remaining <= 2) {
    balanceWarning = `\n⚠️ ${student.name} 剩餘堂數僅剩 ${remaining} 堂`;
  }

  return {
    success: true,
    message: [
      `✅ 已為 ${student.name} 打卡！`,
      `📅 課程時段：${event.startTime}–${event.endTime}`,
      `⏰ 打卡時間：${formatDateTime(now)}`,
      '',
      `🎉 已扣除 1 堂，剩餘 ${remaining} 堂`,
      balanceWarning,
    ].filter(Boolean).join('\n'),
  };
}
