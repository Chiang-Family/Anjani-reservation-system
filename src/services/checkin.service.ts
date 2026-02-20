import { getStudentById } from '@/lib/notion/students';
import { findCoachByLineId } from '@/lib/notion/coaches';
import { createCheckinRecord, findCheckinToday } from '@/lib/notion/checkins';
import { getStudentHoursSummary } from '@/lib/notion/hours';
import { findStudentEventToday, findStudentEventForDate } from './calendar.service';
import { todayDateString, formatDateTime, nowTaipei, nowTaipeiISO, computeDurationMinutes, formatHours } from '@/lib/utils/date';
import { pushText } from '@/lib/line/push';

export interface CheckinResult {
  success: boolean;
  message: string;
}

/** 教練幫學員打卡，支援指定日期 */
export async function coachCheckinForStudent(
  coachLineUserId: string,
  studentNotionId: string,
  dateStr?: string
): Promise<CheckinResult> {
  const coach = await findCoachByLineId(coachLineUserId);
  if (!coach) {
    return { success: false, message: '找不到教練資料。' };
  }

  const student = await getStudentById(studentNotionId);
  if (!student) {
    return { success: false, message: '找不到該學員資料。' };
  }

  const targetDate = dateStr || todayDateString();
  const existing = await findCheckinToday(student.id, targetDate);

  if (existing) {
    return { success: false, message: `已經幫 ${student.name} 打過卡了！` };
  }

  const event = dateStr
    ? await findStudentEventForDate(student.name, dateStr)
    : await findStudentEventToday(student.name);
  if (!event) {
    return { success: false, message: `${targetDate} 沒有 ${student.name} 的課程安排。` };
  }

  const now = nowTaipei();
  const checkinTime = nowTaipeiISO();
  const classTimeSlot = `${event.startTime}-${event.endTime}`;
  const durationMinutes = computeDurationMinutes(event.startTime, event.endTime);

  // Create checkin record with duration
  await createCheckinRecord({
    studentName: student.name,
    studentId: student.id,
    coachId: coach.id,
    classDate: targetDate,
    classTimeSlot,
    checkinTime,
    durationMinutes,
  });

  // Compute remaining hours from DB
  const summary = await getStudentHoursSummary(student.id);

  // Push notification to student
  if (student.lineUserId) {
    const isToday = targetDate === todayDateString();
    const dateLabel = isToday ? '今日' : targetDate;
    const studentMsg = [
      `✅ ${dateLabel}課程已完成打卡！`,
      `📅 課程時段：${event.startTime}–${event.endTime}`,
      `⏱️ 課程時長：${durationMinutes} 分鐘`,
      `📊 剩餘時數：${formatHours(summary.remainingHours)}`,
      ...(summary.remainingHours <= 2 ? [`\n⚠️ 剩餘時數不多，請盡早聯繫教練續約。`] : []),
    ].join('\n');
    pushText(student.lineUserId, studentMsg).catch((err) =>
      console.error('Push notification to student failed:', err)
    );
  }

  let balanceWarning = '';
  if (summary.remainingHours <= 2) {
    balanceWarning = `\n⚠️ ${student.name} 剩餘時數僅剩 ${formatHours(summary.remainingHours)}`;
  }

  const isToday = targetDate === todayDateString();
  const datePrefix = isToday ? '' : `（${targetDate}）`;

  return {
    success: true,
    message: [
      `✅ 已為 ${student.name} 打卡！${datePrefix}`,
      `📅 課程時段：${event.startTime}–${event.endTime}`,
      `⏰ 打卡時間：${formatDateTime(now)}`,
      '',
      `🎉 已記錄 ${durationMinutes} 分鐘，剩餘 ${formatHours(summary.remainingHours)}`,
      balanceWarning,
    ].filter(Boolean).join('\n'),
  };
}
