import { findCoachByLineId } from '@/lib/notion/coaches';
import { getSlotsByCoachAndDateRange, createClassSlot } from '@/lib/notion/class-slots';
import { getReservationsBySlot } from '@/lib/notion/reservations';
import { RESERVATION_STATUS } from '@/lib/config/constants';
import { todayDateString, nowTaipei } from '@/lib/utils/date';
import { enrichReservationsWithStudentName } from './reservation.service';
import { format, addDays } from 'date-fns';
import type { ClassSlot, Reservation } from '@/types';

export async function getCoachTodayClasses(lineUserId: string): Promise<ClassSlot[]> {
  const coach = await findCoachByLineId(lineUserId);
  if (!coach) return [];

  return getSlotsByCoachAndDateRange(coach.id, todayDateString(), todayDateString());
}

export async function getCoachUpcomingClasses(lineUserId: string): Promise<ClassSlot[]> {
  const coach = await findCoachByLineId(lineUserId);
  if (!coach) return [];

  const today = todayDateString();
  const endDate = format(addDays(nowTaipei(), 14), 'yyyy-MM-dd');

  return getSlotsByCoachAndDateRange(coach.id, today, endDate);
}

/** 取得某課程時段的已預約學員（含學員姓名） */
export async function getSlotStudents(classSlotId: string): Promise<Reservation[]> {
  const reservations = await getReservationsBySlot(classSlotId, RESERVATION_STATUS.RESERVED);
  return enrichReservationsWithStudentName(reservations);
}

/** 取得某課程時段的所有預約紀錄（含學員姓名） */
export async function getSlotAllReservations(classSlotId: string): Promise<Reservation[]> {
  const reservations = await getReservationsBySlot(classSlotId);
  return enrichReservationsWithStudentName(reservations);
}

/** 教練建立新課程時段 */
export async function createSlotForCoach(
  lineUserId: string,
  dateStr: string, // YYYYMMDD
  startTime: string, // HHmm
  endTime: string, // HHmm
  capacity: number
): Promise<{ success: boolean; message: string }> {
  const coach = await findCoachByLineId(lineUserId);
  if (!coach) {
    return { success: false, message: '找不到教練資料。' };
  }

  const dateFormatted = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  const startFormatted = `${startTime.slice(0, 2)}:${startTime.slice(2, 4)}`;
  const endFormatted = `${endTime.slice(0, 2)}:${endTime.slice(2, 4)}`;

  const title = `教練課 ${dateStr.slice(4, 6)}/${dateStr.slice(6, 8)} ${startFormatted}`;
  const startDatetime = `${dateFormatted}T${startFormatted}:00+08:00`;
  const endDatetime = `${dateFormatted}T${endFormatted}:00+08:00`;

  await createClassSlot({
    title,
    coachId: coach.id,
    startDatetime,
    endDatetime,
    maxCapacity: capacity,
  });

  return {
    success: true,
    message: [
      '✅ 課程建立成功！',
      '',
      `📅 日期：${dateFormatted}`,
      `⏰ 時段：${startFormatted}–${endFormatted}`,
      `👥 人數上限：${capacity} 人`,
      `📝 標題：${title}`,
    ].join('\n'),
  };
}
