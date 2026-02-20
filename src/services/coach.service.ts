import { findCoachByLineId } from '@/lib/notion/coaches';
import {
  getSlotsByCoachAndDateRange,
  createClassSlot,
  getSlotById,
  archiveClassSlot,
  updateSlotCurrentCount,
} from '@/lib/notion/class-slots';
import { getReservationsBySlot, updateReservationStatus } from '@/lib/notion/reservations';
import { getStudentById, updateRemainingClasses } from '@/lib/notion/students';
import { RESERVATION_STATUS } from '@/lib/config/constants';
import { todayDateString, nowTaipei } from '@/lib/utils/date';
import { enrichReservationsWithStudentName } from './reservation.service';
import { notifyCoachStudentsNewSlot } from './notification.service';
import { pushText } from '@/lib/line/push';
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

  const slot = await createClassSlot({
    title,
    coachId: coach.id,
    startDatetime,
    endDatetime,
    maxCapacity: capacity,
  });

  // 非同步通知教練的學員（不阻塞回覆）
  Promise.allSettled([
    notifyCoachStudentsNewSlot(coach.id, slot, coach.name),
  ]).catch((err) => console.error('Failed to notify students:', err));

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

/** 教練刪除課程：取消所有預約 + 退堂數 + 通知學員 */
export async function deleteSlotForCoach(
  slotId: string
): Promise<{ success: boolean; message: string }> {
  const slot = await getSlotById(slotId);
  if (!slot) {
    return { success: false, message: '找不到此課程時段。' };
  }

  // 查所有已預約的預約
  const reservations = await getReservationsBySlot(slotId, RESERVATION_STATUS.RESERVED);
  let cancelledCount = 0;

  for (const reservation of reservations) {
    // 改狀態為已取消
    await updateReservationStatus(reservation.id, RESERVATION_STATUS.CANCELLED);

    // 退還 1 堂
    if (reservation.studentId) {
      const student = await getStudentById(reservation.studentId);
      if (student) {
        await updateRemainingClasses(student.id, student.remainingClasses + 1);

        // Push 通知學員
        try {
          await pushText(
            student.lineUserId,
            `「${slot.title}」已被教練取消，您的預約已自動取消，堂數已退還。`
          );
        } catch (err) {
          console.error(`Failed to push delete notification to ${student.lineUserId}:`, err);
        }
      }
    }

    cancelledCount++;
  }

  // Archive slot
  await archiveClassSlot(slotId);

  const msg = cancelledCount > 0
    ? `✅ 已刪除課程「${slot.title}」，共取消 ${cancelledCount} 筆預約，堂數已退還。`
    : `✅ 已刪除課程「${slot.title}」。`;

  return { success: true, message: msg };
}
