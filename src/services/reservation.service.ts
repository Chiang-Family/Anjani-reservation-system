import { findStudentByLineId, updateRemainingClasses, getStudentById } from '@/lib/notion/students';
import {
  createReservation,
  getReservationsByStudent,
  findActiveReservation,
  updateReservationStatus,
  getReservationById,
} from '@/lib/notion/reservations';
import {
  getAvailableSlots,
  getSlotById,
  updateSlotCurrentCount,
} from '@/lib/notion/class-slots';
import { RESERVATION_STATUS } from '@/lib/config/constants';
import { todayDateString } from '@/lib/utils/date';
import type { ClassSlot, Reservation } from '@/types';

export interface ReserveResult {
  success: boolean;
  message: string;
  reservation?: Reservation;
}

export async function listAvailableSlots(): Promise<ClassSlot[]> {
  return getAvailableSlots(todayDateString());
}

export async function reserveClass(
  lineUserId: string,
  classSlotId: string
): Promise<ReserveResult> {
  const student = await findStudentByLineId(lineUserId);
  if (!student) {
    return { success: false, message: '找不到您的學員資料，請聯繫工作人員。' };
  }

  if (student.remainingClasses <= 0) {
    return { success: false, message: '您的剩餘堂數不足，無法預約。' };
  }

  const slot = await getSlotById(classSlotId);
  if (!slot) {
    return { success: false, message: '找不到此課程時段。' };
  }

  if (slot.currentCount >= slot.maxCapacity) {
    return { success: false, message: '此課程已額滿，無法預約。' };
  }

  // Check duplicate reservation
  const existing = await findActiveReservation(student.id, classSlotId);
  if (existing) {
    return { success: false, message: '您已預約此課程，請勿重複預約。' };
  }

  // Create reservation
  const reservation = await createReservation({
    studentId: student.id,
    studentName: student.name,
    classSlotId: slot.id,
    classSlotTitle: slot.title,
    date: slot.date,
  });

  // Deduct remaining classes
  await updateRemainingClasses(student.id, student.remainingClasses - 1);

  // Update slot count
  await updateSlotCurrentCount(slot.id, slot.currentCount + 1);

  return {
    success: true,
    message: '預約成功！',
    reservation,
  };
}

/** 取得學員的已預約紀錄，並填入課程時段資訊 */
export async function getMyReservations(lineUserId: string): Promise<Reservation[]> {
  const student = await findStudentByLineId(lineUserId);
  if (!student) return [];

  const reservations = await getReservationsByStudent(student.id, RESERVATION_STATUS.RESERVED);
  return enrichReservations(reservations);
}

/** 填入關聯的課程時段資訊 */
export async function enrichReservations(reservations: Reservation[]): Promise<Reservation[]> {
  const enriched = await Promise.all(
    reservations.map(async (r) => {
      if (r.classSlotId) {
        const slot = await getSlotById(r.classSlotId);
        if (slot) {
          return {
            ...r,
            classSlotTitle: slot.title,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
          };
        }
      }
      return r;
    })
  );
  return enriched;
}

/** 填入關聯的學員姓名 */
export async function enrichReservationsWithStudentName(reservations: Reservation[]): Promise<Reservation[]> {
  const enriched = await Promise.all(
    reservations.map(async (r) => {
      if (r.studentId) {
        const student = await getStudentById(r.studentId);
        if (student) {
          return { ...r, studentName: student.name };
        }
      }
      return r;
    })
  );
  return enriched;
}

export async function cancelReservation(reservationId: string): Promise<ReserveResult> {
  return changeReservationStatus(reservationId, RESERVATION_STATUS.CANCELLED);
}

export async function leaveReservation(reservationId: string): Promise<ReserveResult> {
  return changeReservationStatus(reservationId, RESERVATION_STATUS.ON_LEAVE);
}

async function changeReservationStatus(
  reservationId: string,
  newStatus: typeof RESERVATION_STATUS.CANCELLED | typeof RESERVATION_STATUS.ON_LEAVE
): Promise<ReserveResult> {
  const reservation = await getReservationById(reservationId);
  if (!reservation) {
    return { success: false, message: '找不到此預約紀錄。' };
  }

  if (reservation.status !== RESERVATION_STATUS.RESERVED) {
    return { success: false, message: '此預約已不是「已預約」狀態，無法操作。' };
  }

  // Update reservation status
  await updateReservationStatus(reservationId, newStatus);

  // Refund remaining classes (both cancel and leave refund)
  if (reservation.studentId) {
    const student = await getStudentById(reservation.studentId);
    if (student) {
      await updateRemainingClasses(student.id, student.remainingClasses + 1);
    }
  }

  // Decrease slot count
  if (reservation.classSlotId) {
    const slot = await getSlotById(reservation.classSlotId);
    if (slot && slot.currentCount > 0) {
      await updateSlotCurrentCount(slot.id, slot.currentCount - 1);
    }
  }

  const actionName = newStatus === RESERVATION_STATUS.CANCELLED ? '取消' : '請假';
  return { success: true, message: `${actionName}成功！堂數已退還。` };
}
