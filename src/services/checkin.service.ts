import { findStudentByLineId, updateCompletedClasses, getStudentById } from '@/lib/notion/students';
import { findCoachByLineId } from '@/lib/notion/coaches';
import { createCheckinRecord, findCheckinToday, updateCheckinFlags } from '@/lib/notion/checkins';
import { findStudentEventToday } from './calendar.service';
import { todayDateString, formatDateTime, nowTaipei } from '@/lib/utils/date';
import type { Student } from '@/types';

export interface CheckinResult {
  success: boolean;
  message: string;
}

/** 學員自己打卡 */
export async function studentCheckin(lineUserId: string): Promise<CheckinResult> {
  const student = await findStudentByLineId(lineUserId);
  if (!student) {
    return { success: false, message: '找不到您的學員資料，請聯繫工作人員。' };
  }

  const today = todayDateString();
  const existing = await findCheckinToday(student.id, today);

  // Already checked in by student
  if (existing?.studentChecked) {
    return { success: false, message: '您今天已經打過卡了！' };
  }

  // Find today's calendar event
  const event = await findStudentEventToday(student.name);
  if (!event) {
    return { success: false, message: '今天沒有您的課程安排。' };
  }

  const now = nowTaipei();
  const classTimeSlot = `${event.startTime}-${event.endTime}`;

  if (existing) {
    // Record exists (coach checked in first) → mark student checked
    await updateCheckinFlags(existing.id, { studentChecked: true });

    // Both checked in → deduct class
    if (existing.coachChecked) {
      return completeCheckin(student, event.startTime, event.endTime, now);
    }

    return {
      success: true,
      message: [
        '✅ 學員打卡成功！',
        `📅 課程時段：${event.startTime}–${event.endTime}`,
        `⏰ 打卡時間：${formatDateTime(now)}`,
        '',
        '⏳ 等待教練打卡確認後將扣除堂數。',
      ].join('\n'),
    };
  }

  // No record yet → create with student checked
  await createCheckinRecord({
    studentName: student.name,
    studentId: student.id,
    coachId: student.coachId || '',
    checkinTime: now.toISOString(),
    classDate: today,
    classTimeSlot,
    studentChecked: true,
    coachChecked: false,
  });

  return {
    success: true,
    message: [
      '✅ 學員打卡成功！',
      `📅 課程時段：${event.startTime}–${event.endTime}`,
      `⏰ 打卡時間：${formatDateTime(now)}`,
      '',
      '⏳ 等待教練打卡確認後將扣除堂數。',
    ].join('\n'),
  };
}

/** 教練幫學員打卡 */
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

  // Already checked in by coach
  if (existing?.coachChecked) {
    return { success: false, message: `已經幫 ${student.name} 打過卡了！` };
  }

  // Find today's calendar event
  const event = await findStudentEventToday(student.name);
  if (!event) {
    return { success: false, message: `今天沒有 ${student.name} 的課程安排。` };
  }

  const now = nowTaipei();
  const classTimeSlot = `${event.startTime}-${event.endTime}`;

  if (existing) {
    // Record exists (student checked in first) → mark coach checked
    await updateCheckinFlags(existing.id, { coachChecked: true });

    // Both checked in → deduct class
    if (existing.studentChecked) {
      const newCompleted = student.completedClasses + 1;
      await updateCompletedClasses(student.id, newCompleted);
      const remaining = student.purchasedClasses - newCompleted;

      return {
        success: true,
        message: [
          `✅ 教練打卡確認完成！`,
          `👤 學員：${student.name}`,
          `📅 課程時段：${event.startTime}–${event.endTime}`,
          '',
          `🎉 雙方打卡完成，已扣除 1 堂。`,
          `📊 ${student.name} 剩餘堂數：${remaining} 堂`,
        ].join('\n'),
      };
    }

    return {
      success: true,
      message: [
        `✅ 已為 ${student.name} 打卡！`,
        `📅 課程時段：${event.startTime}–${event.endTime}`,
        '',
        `⏳ 等待學員打卡後將扣除堂數。`,
      ].join('\n'),
    };
  }

  // No record yet → create with coach checked
  await createCheckinRecord({
    studentName: student.name,
    studentId: student.id,
    coachId: coach.id,
    checkinTime: now.toISOString(),
    classDate: today,
    classTimeSlot,
    studentChecked: false,
    coachChecked: true,
  });

  return {
    success: true,
    message: [
      `✅ 已為 ${student.name} 打卡！`,
      `📅 課程時段：${event.startTime}–${event.endTime}`,
      '',
      `⏳ 等待學員打卡後將扣除堂數。`,
    ].join('\n'),
  };
}

/** 雙方都打卡完成 → 扣除堂數 */
async function completeCheckin(
  student: Student,
  startTime: string,
  endTime: string,
  now: Date
): Promise<CheckinResult> {
  const newCompleted = student.completedClasses + 1;
  await updateCompletedClasses(student.id, newCompleted);
  const remaining = student.purchasedClasses - newCompleted;

  let balanceWarning = '';
  if (remaining <= 2) {
    balanceWarning = `\n⚠️ 剩餘堂數僅剩 ${remaining} 堂，請盡早聯繫教練購買。`;
  }

  return {
    success: true,
    message: [
      '✅ 打卡成功！',
      `📅 課程時段：${startTime}–${endTime}`,
      `⏰ 打卡時間：${formatDateTime(now)}`,
      '',
      `🎉 雙方打卡完成，已扣除 1 堂。`,
      `📊 剩餘堂數：${remaining} 堂`,
      balanceWarning,
    ].filter(Boolean).join('\n'),
  };
}
