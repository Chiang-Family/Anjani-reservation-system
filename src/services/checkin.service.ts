import { findStudentByLineId, findStudentByName, updateCompletedClasses } from '@/lib/notion/students';
import { findCoachByLineId } from '@/lib/notion/coaches';
import { createCheckinRecord, findCheckinToday } from '@/lib/notion/checkins';
import { findStudentEventToday } from './calendar.service';
import { todayDateString, formatDateTime, nowTaipei } from '@/lib/utils/date';
import type { Student, CalendarEvent } from '@/types';

export interface CheckinResult {
  success: boolean;
  message: string;
}

export async function studentCheckin(lineUserId: string): Promise<CheckinResult> {
  const student = await findStudentByLineId(lineUserId);
  if (!student) {
    return { success: false, message: '找不到您的學員資料，請聯繫工作人員。' };
  }

  return doCheckin(student);
}

export async function coachCheckinForStudent(
  coachLineUserId: string,
  studentNotionId: string
): Promise<CheckinResult> {
  const coach = await findCoachByLineId(coachLineUserId);
  if (!coach) {
    return { success: false, message: '找不到教練資料。' };
  }

  // Import dynamically to avoid circular dependency
  const { getStudentById } = await import('@/lib/notion/students');
  const student = await getStudentById(studentNotionId);
  if (!student) {
    return { success: false, message: '找不到該學員資料。' };
  }

  return doCheckin(student);
}

async function doCheckin(student: Student): Promise<CheckinResult> {
  const today = todayDateString();

  // Check if already checked in today
  const existing = await findCheckinToday(student.id, today);
  if (existing) {
    return { success: false, message: '您今天已經打過卡了！' };
  }

  // Find today's calendar event for this student
  const event = await findStudentEventToday(student.name);
  if (!event) {
    return { success: false, message: '今天沒有您的課程安排。' };
  }

  // Create check-in record
  const now = nowTaipei();
  const checkinTime = now.toISOString();
  const classTimeSlot = `${event.startTime}-${event.endTime}`;

  await createCheckinRecord({
    studentName: student.name,
    studentId: student.id,
    coachId: student.coachId || '',
    checkinTime,
    classDate: today,
    classTimeSlot,
  });

  // Update completed classes
  const newCompleted = student.completedClasses + 1;
  await updateCompletedClasses(student.id, newCompleted);

  const remaining = student.purchasedClasses - newCompleted;
  let balanceWarning = '';
  if (remaining <= 2) {
    balanceWarning = `\n\n⚠️ 剩餘堂數僅剩 ${remaining} 堂，請盡早聯繫教練購買。`;
  }

  return {
    success: true,
    message: [
      '✅ 打卡成功！',
      `📅 課程時段：${event.startTime}–${event.endTime}`,
      `⏰ 打卡時間：${formatDateTime(now)}`,
      `📊 剩餘堂數：${remaining} 堂`,
      balanceWarning,
    ].filter(Boolean).join('\n'),
  };
}
