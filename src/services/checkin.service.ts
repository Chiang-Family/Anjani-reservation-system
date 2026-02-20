import { findStudentByLineId } from '@/lib/notion/students';
import {
  getReservationsByStudent,
  updateReservationStatus,
  getReservationById,
} from '@/lib/notion/reservations';
import { getSlotById } from '@/lib/notion/class-slots';
import { RESERVATION_STATUS } from '@/lib/config/constants';
import { todayDateString, formatDateTime, nowTaipei } from '@/lib/utils/date';
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

  const now = nowTaipei();
  const checkinTimeStr = now.toISOString();

  await updateReservationStatus(
    reservation.id,
    RESERVATION_STATUS.CHECKED_IN,
    checkinTimeStr
  );

  return {
    success: true,
    message: `✅ 報到成功！\n報到時間：${formatDateTime(now)}\n輸入「剩餘堂數」可查看目前堂數。`,
    reservation: { ...reservation, status: RESERVATION_STATUS.CHECKED_IN },
  };
}
