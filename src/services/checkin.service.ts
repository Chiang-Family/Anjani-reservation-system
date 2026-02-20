import { findStudentByLineId, getStudentById } from '@/lib/notion/students';
import {
  getReservationsByStudent,
  updateReservationStatus,
  getReservationById,
} from '@/lib/notion/reservations';
import { getSlotById } from '@/lib/notion/class-slots';
import { RESERVATION_STATUS } from '@/lib/config/constants';
import { todayDateString, formatDateTime, nowTaipei, parseSlotTime } from '@/lib/utils/date';
import { enrichReservations } from './reservation.service';
import type { Reservation } from '@/types';

export interface CheckinResult {
  success: boolean;
  message: string;
  reservation?: Reservation;
}

export async function studentCheckin(lineUserId: string): Promise<CheckinResult> {
  const student = await findStudentByLineId(lineUserId);
  if (!student) {
    return { success: false, message: '找不到您的學員資料，請聯繫工作人員。' };
  }

  const todayReservations = await getTodayReservations(lineUserId);

  if (todayReservations.length === 0) {
    return { success: false, message: '您今日沒有已預約的課程。' };
  }

  if (todayReservations.length === 1) {
    return doCheckin(todayReservations[0]);
  }

  // Multiple reservations today - return them for selection
  return {
    success: false,
    message: 'MULTIPLE_RESERVATIONS',
    reservation: undefined,
  };
}

/** 取得學員今日的已預約課程 */
export async function getTodayReservations(lineUserId: string): Promise<Reservation[]> {
  const student = await findStudentByLineId(lineUserId);
  if (!student) return [];

  const today = todayDateString();

  // 取得所有已預約的紀錄
  const allReserved = await getReservationsByStudent(student.id, RESERVATION_STATUS.RESERVED);

  // 填入課程時段資訊
  const enriched = await enrichReservations(allReserved);

  // 篩選今日的預約
  return enriched.filter((r) => r.date === today);
}

export async function checkinByReservationId(reservationId: string): Promise<CheckinResult> {
  const reservation = await getReservationById(reservationId);
  if (!reservation) {
    return { success: false, message: '找不到此預約紀錄。' };
  }
  return doCheckin(reservation);
}

export async function coachCheckinStudent(reservationId: string): Promise<CheckinResult> {
  return checkinByReservationId(reservationId);
}

async function doCheckin(reservation: Reservation): Promise<CheckinResult> {
  if (reservation.status !== RESERVATION_STATUS.RESERVED) {
    return { success: false, message: '此預約不是「已預約」狀態，無法報到。' };
  }

  // 取得課程時段資訊進行時間窗口驗證
  const slot = await getSlotById(reservation.classSlotId);
  if (!slot) {
    return { success: false, message: '找不到對應的課程時段。' };
  }

  const now = nowTaipei();
  const checkinTimeStr = now.toISOString();

  // 時間窗口驗證：課前 30 分鐘 ~ 課後 15 分鐘
  if (slot.date && slot.startTime && slot.endTime) {
    const slotStart = parseSlotTime(slot.date, slot.startTime);
    const slotEnd = parseSlotTime(slot.date, slot.endTime);
    const windowStart = new Date(slotStart.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(slotEnd.getTime() + 15 * 60 * 1000);

    if (now < windowStart || now > windowEnd) {
      const wStartH = windowStart.getHours().toString().padStart(2, '0');
      const wStartM = windowStart.getMinutes().toString().padStart(2, '0');
      const wEndH = windowEnd.getHours().toString().padStart(2, '0');
      const wEndM = windowEnd.getMinutes().toString().padStart(2, '0');
      return {
        success: false,
        message: `目前不在報到時段。\n可報到時間：${wStartH}:${wStartM}–${wEndH}:${wEndM}`,
      };
    }

    await updateReservationStatus(
      reservation.id,
      RESERVATION_STATUS.CHECKED_IN,
      checkinTimeStr
    );

    const isLate = now > slotStart;
    const lateNote = isLate ? '（遲到報到）' : '';

    // 查詢學員堂數提示
    let balanceWarning = '';
    if (reservation.studentId) {
      const student = await getStudentById(reservation.studentId);
      if (student && student.remainingClasses <= 2) {
        balanceWarning = `\n\n⚠️ 剩餘堂數僅剩 ${student.remainingClasses} 堂，請盡早聯繫教練充值。`;
      }
    }

    return {
      success: true,
      message: `✅ 報到成功！${lateNote}\n報到時間：${formatDateTime(now)}${balanceWarning}`,
      reservation: { ...reservation, status: RESERVATION_STATUS.CHECKED_IN },
    };
  }

  // 如果沒有時間資訊，直接報到（不驗證時間）
  await updateReservationStatus(
    reservation.id,
    RESERVATION_STATUS.CHECKED_IN,
    checkinTimeStr
  );

  return {
    success: true,
    message: `✅ 報到成功！\n報到時間：${formatDateTime(now)}`,
    reservation: { ...reservation, status: RESERVATION_STATUS.CHECKED_IN },
  };
}
