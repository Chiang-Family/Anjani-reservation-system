import { getSlotsByDate } from '@/lib/notion/class-slots';
import { getReservationsBySlot, updateReservationStatus } from '@/lib/notion/reservations';
import { getStudentById, updateRemainingClasses } from '@/lib/notion/students';
import { updateSlotCurrentCount } from '@/lib/notion/class-slots';
import { getAllCoaches } from '@/lib/notion/coaches';
import { getSlotsByCoachAndDateRange } from '@/lib/notion/class-slots';
import { RESERVATION_STATUS } from '@/lib/config/constants';
import { todayDateString, nowTaipei, parseSlotTime } from '@/lib/utils/date';
import { pushText } from '@/lib/line/push';
import { format, subDays } from 'date-fns';

/** 自動標記缺席：課程結束 15 分鐘後仍未報到的預約 */
export async function markAbsentReservations(): Promise<{ processed: number }> {
  const today = todayDateString();
  const slots = await getSlotsByDate(today);
  const now = nowTaipei();
  let processed = 0;

  for (const slot of slots) {
    if (!slot.endTime || !slot.date) continue;

    const slotEnd = parseSlotTime(slot.date, slot.endTime);
    const deadline = new Date(slotEnd.getTime() + 15 * 60 * 1000);

    if (now <= deadline) continue;

    const reservations = await getReservationsBySlot(slot.id, RESERVATION_STATUS.RESERVED);

    for (const reservation of reservations) {
      // 標記為缺席
      await updateReservationStatus(reservation.id, RESERVATION_STATUS.ABSENT);

      // 退還 1 堂
      if (reservation.studentId) {
        const student = await getStudentById(reservation.studentId);
        if (student) {
          await updateRemainingClasses(student.id, student.remainingClasses + 1);

          // Push 通知學員
          try {
            await pushText(
              student.lineUserId,
              `您未出席「${slot.title}」，已標記為缺席，堂數已退還。`
            );
          } catch (err) {
            console.error(`Failed to push absent notification to ${student.lineUserId}:`, err);
          }
        }
      }

      // slot count -1
      if (slot.currentCount > 0) {
        await updateSlotCurrentCount(slot.id, slot.currentCount - 1);
      }

      processed++;
    }
  }

  return { processed };
}

/** 課前提醒：未來 30~75 分鐘內開始的課程 */
export async function sendCourseReminders(): Promise<{ sent: number }> {
  const today = todayDateString();
  const slots = await getSlotsByDate(today);
  const now = nowTaipei();
  let sent = 0;

  for (const slot of slots) {
    if (!slot.startTime || !slot.date) continue;

    const slotStart = parseSlotTime(slot.date, slot.startTime);
    const diffMin = (slotStart.getTime() - now.getTime()) / (1000 * 60);

    // 30~75 分鐘窗口（涵蓋 15 分鐘 cron 間隔的誤差）
    if (diffMin < 30 || diffMin > 75) continue;

    const reservations = await getReservationsBySlot(slot.id, RESERVATION_STATUS.RESERVED);

    for (const reservation of reservations) {
      if (!reservation.studentId) continue;

      const student = await getStudentById(reservation.studentId);
      if (!student) continue;

      try {
        await pushText(
          student.lineUserId,
          `您預約的「${slot.title}」將於 ${slot.startTime} 開始，請準時出席！`
        );
        sent++;
      } catch (err) {
        console.error(`Failed to push reminder to ${student.lineUserId}:`, err);
      }
    }
  }

  return { sent };
}

/** 教練週報 */
export async function sendWeeklyReports(): Promise<{ sent: number }> {
  const coaches = await getAllCoaches();
  const now = nowTaipei();
  const weekAgo = format(subDays(now, 7), 'yyyy-MM-dd');
  const today = todayDateString();
  let sent = 0;

  for (const coach of coaches) {
    if (!coach.lineUserId) continue;

    const slots = await getSlotsByCoachAndDateRange(coach.id, weekAgo, today);

    let totalSlots = slots.length;
    let totalReserved = 0;
    let totalCheckedIn = 0;
    let totalAbsent = 0;
    let totalCancelled = 0;

    for (const slot of slots) {
      const reservations = await getReservationsBySlot(slot.id);
      for (const r of reservations) {
        totalReserved++;
        if (r.status === RESERVATION_STATUS.CHECKED_IN) totalCheckedIn++;
        else if (r.status === RESERVATION_STATUS.ABSENT) totalAbsent++;
        else if (r.status === RESERVATION_STATUS.CANCELLED || r.status === RESERVATION_STATUS.ON_LEAVE) totalCancelled++;
      }
    }

    const attendanceRate = totalReserved > 0
      ? Math.round((totalCheckedIn / totalReserved) * 100)
      : 0;

    const report = [
      `📊 ${coach.name} 教練週報`,
      '',
      `📅 期間：${weekAgo} ~ ${today}`,
      `📋 開課數：${totalSlots} 堂`,
      `👥 總預約人次：${totalReserved}`,
      `✅ 出席：${totalCheckedIn}`,
      `❌ 缺席：${totalAbsent}`,
      `🔄 取消/請假：${totalCancelled}`,
      `📈 出席率：${attendanceRate}%`,
    ].join('\n');

    try {
      await pushText(coach.lineUserId, report);
      sent++;
    } catch (err) {
      console.error(`Failed to push weekly report to ${coach.lineUserId}:`, err);
    }
  }

  return { sent };
}
