import { findCoachByLineId } from '@/lib/notion/coaches';
import { getSlotsByCoachAndDateRange } from '@/lib/notion/class-slots';
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
