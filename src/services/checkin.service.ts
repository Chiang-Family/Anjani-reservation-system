import { getStudentById } from '@/lib/notion/students';
import { findCoachByLineId } from '@/lib/notion/coaches';
import { createCheckinRecord, findCheckinToday, getCheckinsByStudent } from '@/lib/notion/checkins';
import { createPaymentRecord, getPaymentsByDate, getLatestPaymentByStudent, getPaymentsByStudent } from '@/lib/notion/payments';
import { getStudentOverflowInfo } from '@/lib/notion/hours';
import { findStudentEventToday, findStudentEventForDate } from './calendar.service';
import { todayDateString, formatDateTime, nowTaipeiISO, computeDurationMinutes, formatHours } from '@/lib/utils/date';
import { parseEventSummary } from '@/lib/utils/event';
import { pushText } from '@/lib/line/push';
import { studentQuickReply } from '@/templates/quick-reply';

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

  const { isMassage } = parseEventSummary(event.summary);
  const now = new Date();
  const checkinTime = nowTaipeiISO();
  const durationMinutes = computeDurationMinutes(event.startTime, event.endTime);
  const classStartTime = `${targetDate}T${event.startTime}:00+08:00`;
  const classEndTime = `${targetDate}T${event.endTime}:00+08:00`;

  // 打卡前先取得分桶資訊（避免 Notion 索引延遲）
  // 若學員有關聯學員（共用時數池），需找到持有付款記錄的主學員
  let hoursStudentId = student.id;
  let hoursRelatedIds: string[] | undefined;
  if (student.relatedStudentIds?.length) {
    const latestPayment = await getLatestPaymentByStudent(student.id);
    if (latestPayment) {
      // 本學員是主學員，關聯學員為副
      hoursRelatedIds = student.relatedStudentIds;
    } else {
      // 本學員是副學員，以第一位關聯學員為主
      hoursStudentId = student.relatedStudentIds[0];
      hoursRelatedIds = [student.id, ...student.relatedStudentIds.slice(1)];
    }
  }
  const { summary: oldSummary, buckets } = await getStudentOverflowInfo(hoursStudentId, hoursRelatedIds);

  // Create checkin record with date range
  await createCheckinRecord({
    studentName: student.name,
    studentId: student.id,
    coachId: coach.id,
    classDate: targetDate,
    classStartTime,
    classEndTime,
    checkinTime,
    isMassage,
  });

  // 用打卡前的資料 + 本次時長，算出新的剩餘時數
  const newRemainingHours = oldSummary.remainingHours - durationMinutes / 60;
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

  const isSessionStudent = student.paymentType === '單堂';

  // Push notification to student
  const isToday = targetDate === todayDateString();
  const dateLabel = isToday ? '今日' : targetDate;
  let pushFailed = false;

  if (student.lineUserId) {
    const qr = studentQuickReply(student.paymentType);

    if (isSessionStudent) {
      // 單堂學員：查詢未繳費課程 + 發送通知
      const fee = student.perSessionFee ?? 0;
      try {
        const [allCheckins, allPayments] = await Promise.all([
          getCheckinsByStudent(student.id),
          getPaymentsByStudent(student.id),
        ]);
        const paidDates = new Set(
          allPayments.filter(p => p.isSessionPayment).map(p => p.createdAt)
        );
        // 未繳費的歷史課程（不含本次打卡日期）
        const unpaidDates = allCheckins
          .filter(c => c.classDate && c.classDate !== targetDate && !paidDates.has(c.classDate))
          .map(c => c.classDate)
          .sort();

        const lines = [
          `✅ ${dateLabel}課程已完成打卡！`,
          `📅 課程時段：${event.startTime}–${event.endTime}`,
          `⏱️ 課程時長：${durationMinutes} 分鐘`,
          `💵 本堂費用：$${fee.toLocaleString()}`,
        ];
        if (unpaidDates.length > 0) {
          lines.push('', `⚠️ 尚有未繳費課程：`);
          for (const d of unpaidDates) {
            lines.push(`  • ${d.slice(5).replace('-', '/')} $${fee.toLocaleString()}`);
          }
        }
        lines.push('', '繳費完成後再麻煩通知教練，謝謝！');

        await pushText(student.lineUserId, lines.join('\n'), qr);
      } catch (err) {
        pushFailed = true;
        console.error('Push checkin notification to session student failed:', err);
      }
    } else {
      // 多堂學員：顯示剩餘時數 + 繳費提醒
      const paymentWarning = summary.remainingHours <= 0 && !periodJustEnded
        ? `\n⚠️ 目前課程時數已使用完畢，繳費完成後再麻煩通知教練，謝謝！`
        : summary.remainingHours <= 1 && !periodJustEnded
          ? `\n⚠️ 剩餘課程時數不多，繳費完成後再麻煩通知教練，謝謝！`
          : '';
      const studentMsg = [
        `✅ ${dateLabel}課程已完成打卡！`,
        `📅 課程時段：${event.startTime}–${event.endTime}`,
        `⏱️ 課程時長：${durationMinutes} 分鐘`,
        `📊 剩餘時數：${formatHours(summary.remainingHours)}`,
        ...(paymentWarning ? [paymentWarning] : []),
      ].join('\n');
      await pushText(student.lineUserId, studentMsg, qr).catch((err) => {
        pushFailed = true;
        console.error('Push checkin notification to student failed:', err);
      });

      // 當期時數用完 → 發送繳費提醒
      if (periodJustEnded) {
        const reminderMsg = [
          `💳 繳費提醒`,
          ``,
          `您的當期課程時數已全部使用完畢，`,
          `繳費完成後再麻煩通知教練，謝謝！`,
        ].join('\n');
        await pushText(student.lineUserId, reminderMsg, qr).catch((err) => {
          console.error('Push payment reminder to student failed:', err);
        });
      }
    }
  }

  // 共課學員通知：共課帳號（如「李容甄陸秀儀」）無 LINE ID，需通知各個關聯的個人帳號
  if (student.relatedStudentIds?.length) {
    const sharedMsg = [
      `✅ ${dateLabel}共課已完成打卡！`,
      `📅 課程時段：${event.startTime}–${event.endTime}`,
      `⏱️ 課程時長：${durationMinutes} 分鐘`,
    ].join('\n');
    for (const relatedId of student.relatedStudentIds) {
      const relatedStudent = await getStudentById(relatedId);
      if (relatedStudent?.lineUserId) {
        const qr = studentQuickReply(relatedStudent.paymentType);
        await pushText(relatedStudent.lineUserId, sharedMsg, qr).catch((err) => {
          pushFailed = true;
          console.error('Push checkin notification to related student failed:', err);
        });
      }
    }
  }

  let balanceWarning = '';
  if (!isSessionStudent && summary.remainingHours <= 1) {
    const warningLabel = hoursRelatedIds?.length ? `${student.name}（共用時數）` : student.name;
    balanceWarning = `\n⚠️ ${warningLabel} 剩餘時數僅剩 ${formatHours(summary.remainingHours)}`;
  }

  const datePrefix = isToday ? '' : `（${targetDate}）`;

  const pushWarning = pushFailed
    ? `\n⚠️ 學員通知發送失敗（LINE 推播額度可能已用完）`
    : '';

  return {
    success: true,
    message: [
      `✅ 已為 ${student.name} 打卡！${datePrefix}`,
      `📅 課程時段：${event.startTime}–${event.endTime}`,
      `⏰ 打卡時間：${formatDateTime(now)}`,
      '',
      isSessionStudent
        ? `🎉 已記錄 ${durationMinutes} 分鐘`
        : `🎉 已記錄 ${durationMinutes} 分鐘，剩餘 ${formatHours(summary.remainingHours)}`,
      balanceWarning,
      pushWarning,
    ].filter(Boolean).join('\n'),
  };
}

/** 單堂學員繳費 — 根據當日課程建立繳費紀錄 */
export async function recordSessionPayment(
  coachLineUserId: string,
  studentNotionId: string,
  dateStr?: string,
  customFee?: number,
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

  // 優先從 Notion checkin 紀錄取得課程時長（補繳場景 Calendar 事件可能已不存在）
  const checkin = await findCheckinToday(student.id, targetDate);
  let durationMinutes: number;
  if (checkin && checkin.durationMinutes > 0) {
    durationMinutes = checkin.durationMinutes;
  } else {
    // fallback: 查 Google Calendar
    const event = dateStr
      ? await findStudentEventForDate(student.name, dateStr)
      : await findStudentEventToday(student.name);
    if (!event) {
      return { success: false, message: '該堂課尚未執行，請先打卡再進行繳費。' };
    }
    durationMinutes = computeDurationMinutes(event.startTime, event.endTime);
  }

  const durationHours = Math.round((durationMinutes / 60) * 10) / 10;
  const fee = customFee ?? student.perSessionFee;
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
  let payPushFailed = false;
  if (student.lineUserId) {
    const now = new Date();
    const studentMsg = [
      `💰 繳費紀錄`,
      `📅 日期：${targetDate}`,
      `⏱️ 課程時長：${durationMinutes} 分鐘`,
      `💵 金額：$${fee}`,
      `⏰ 紀錄時間：${formatDateTime(now)}`,
    ].join('\n');
    await pushText(student.lineUserId, studentMsg, studentQuickReply(student.paymentType)).catch((err) => {
      payPushFailed = true;
      console.error('Push session payment notification failed:', err);
    });
  }

  const timeSlot = checkin?.classTimeSlot ?? '';
  const payPushWarning = payPushFailed
    ? `\n⚠️ 學員通知發送失敗（LINE 推播額度可能已用完）`
    : '';

  return {
    success: true,
    message: [
      `💰 已為 ${student.name} 記錄繳費！`,
      `📅 課程時段：${targetDate} ${timeSlot}`.trim(),
      `💵 金額：$${fee}`,
      payPushWarning,
    ].filter(Boolean).join('\n'),
  };
}

// --- 自訂金額 State Machine ---

interface SessionPayCustomState {
  studentId: string;
  dateStr: string;
}

const sessionPayCustomStates = new Map<string, SessionPayCustomState>();

export function startSessionPayCustom(lineUserId: string, studentId: string, dateStr: string): void {
  sessionPayCustomStates.set(lineUserId, { studentId, dateStr });
}

export function getSessionPayCustomState(lineUserId: string): SessionPayCustomState | undefined {
  return sessionPayCustomStates.get(lineUserId);
}

export async function handleSessionPayCustomStep(
  lineUserId: string,
  input: string,
): Promise<CheckinResult> {
  const state = sessionPayCustomStates.get(lineUserId);
  if (!state) return { success: false, message: '沒有進行中的繳費流程。' };

  if (input.trim() === '取消') {
    sessionPayCustomStates.delete(lineUserId);
    return { success: true, message: '已取消繳費。' };
  }

  const fee = parseInt(input.trim(), 10);
  if (isNaN(fee) || fee <= 0) {
    return { success: false, message: '請輸入有效的正整數金額（或輸入「取消」放棄）：' };
  }

  sessionPayCustomStates.delete(lineUserId);
  return recordSessionPayment(lineUserId, state.studentId, state.dateStr, fee);
}
