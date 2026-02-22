import { getStudentById } from '@/lib/notion/students';
import { findCoachByLineId } from '@/lib/notion/coaches';
import { createCheckinRecord, findCheckinToday } from '@/lib/notion/checkins';
import { createPaymentRecord, getPaymentsByDate } from '@/lib/notion/payments';
import { getStudentOverflowInfo } from '@/lib/notion/hours';
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
  const durationMinutes = computeDurationMinutes(event.startTime, event.endTime);
  const classStartTime = `${targetDate}T${event.startTime}:00+08:00`;
  const classEndTime = `${targetDate}T${event.endTime}:00+08:00`;

  // 打卡前先取得分桶資訊（避免 Notion 索引延遲）
  const { summary: oldSummary, buckets } = await getStudentOverflowInfo(student.id);

  // Create checkin record with date range
  await createCheckinRecord({
    studentName: student.name,
    studentId: student.id,
    coachId: coach.id,
    classDate: targetDate,
    classStartTime,
    classEndTime,
    checkinTime,
  });

  // 用打卡前的資料 + 本次時長，算出新的剩餘時數
  const newRemainingHours = Math.round((oldSummary.remainingHours - durationMinutes / 60) * 10) / 10;
  const summary = { ...oldSummary, remainingHours: newRemainingHours };

  // 檢查本次打卡是否剛好消耗完當前桶（當期最後一堂課）
  let periodJustEnded = false;
  const activeIdx = buckets.findIndex(b => {
    const consumed = b.checkins.reduce((sum, c) => sum + c.durationMinutes, 0);
    return consumed < b.purchasedHours * 60;
  });
  if (activeIdx >= 0) {
    const bucket = buckets[activeIdx];
    const consumed = bucket.checkins.reduce((sum, c) => sum + c.durationMinutes, 0);
    const remainingInBucket = bucket.purchasedHours * 60 - consumed;
    // 本次打卡用完當期，且沒有下一期預繳
    periodJustEnded = durationMinutes >= remainingInBucket && activeIdx === buckets.length - 1;
  }

  // Push notification to student
  if (student.lineUserId) {
    const isToday = targetDate === todayDateString();
    const dateLabel = isToday ? '今日' : targetDate;
    const studentMsg = [
      `✅ ${dateLabel}課程已完成打卡！`,
      `📅 課程時段：${event.startTime}–${event.endTime}`,
      `⏱️ 課程時長：${durationMinutes} 分鐘`,
      `📊 剩餘時數：${formatHours(summary.remainingHours)}`,
      ...(summary.remainingHours <= 1 && !periodJustEnded ? [`\n⚠️ 剩餘時數不多，請盡早聯繫教練續約。`] : []),
    ].join('\n');
    pushText(student.lineUserId, studentMsg).catch((err) =>
      console.error('Push checkin notification to student failed:', err)
    );

    // 當期時數用完 → 發送繳費提醒
    if (periodJustEnded) {
      const reminderMsg = [
        `💳 繳費提醒`,
        ``,
        `您的當期課程時數已全部使用完畢，`,
        `請盡早聯繫教練續購下一期課程，以免影響上課權益。`,
      ].join('\n');
      pushText(student.lineUserId, reminderMsg).catch((err) =>
        console.error('Push payment reminder to student failed:', err)
      );
    }
  }

  let balanceWarning = '';
  if (summary.remainingHours <= 1) {
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

/** 單堂學員繳費 — 根據當日課程建立繳費紀錄 */
export async function recordSessionPayment(
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

  if (student.paymentType !== '單堂' || !student.perSessionFee) {
    return { success: false, message: `${student.name} 不是單堂收費學員，或尚未設定單堂費用。` };
  }

  const targetDate = dateStr || todayDateString();

  // 檢查是否已有當日繳費紀錄（防重複）
  const existingPayments = await getPaymentsByDate(targetDate);
  const alreadyPaid = existingPayments.some(p => p.studentId === student.id && p.isSessionPayment);
  if (alreadyPaid) {
    return { success: false, message: `${student.name} 在 ${targetDate} 已有繳費紀錄。` };
  }

  // 查 Google Calendar 取得課程時長
  const event = dateStr
    ? await findStudentEventForDate(student.name, dateStr)
    : await findStudentEventToday(student.name);
  if (!event) {
    return { success: false, message: `${targetDate} 沒有 ${student.name} 的課程安排。` };
  }

  const durationMinutes = computeDurationMinutes(event.startTime, event.endTime);
  const durationHours = Math.round((durationMinutes / 60) * 10) / 10;
  const fee = student.perSessionFee;
  const pricePerHour = Math.round((fee / durationHours) * 100) / 100;

  // 建立繳費紀錄（overrideDate 讓建立日期對齊課程日期，確保查詢正確）
  await createPaymentRecord({
    studentId: student.id,
    studentName: student.name,
    coachId: coach.id,
    purchasedHours: durationHours,
    pricePerHour,
    status: '已繳費',
    paidAmount: fee,
    periodDate: targetDate,
    overrideDate: targetDate,
    isSessionPayment: true,
  });

  // 推播通知學員
  if (student.lineUserId) {
    const now = nowTaipei();
    const studentMsg = [
      `💰 繳費紀錄`,
      `📅 日期：${targetDate}`,
      `⏱️ 課程時長：${durationMinutes} 分鐘`,
      `💵 金額：$${fee}`,
      `⏰ 紀錄時間：${formatDateTime(now)}`,
    ].join('\n');
    pushText(student.lineUserId, studentMsg).catch((err) =>
      console.error('Push session payment notification failed:', err)
    );
  }

  const isToday = targetDate === todayDateString();
  const datePrefix = isToday ? '' : `（${targetDate}）`;

  return {
    success: true,
    message: [
      `💰 已為 ${student.name} 記錄繳費！${datePrefix}`,
      `📅 課程時段：${event.startTime}–${event.endTime}`,
      `💵 金額：$${fee}`,
    ].join('\n'),
  };
}
