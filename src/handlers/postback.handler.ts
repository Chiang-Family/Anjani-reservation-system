import type { PostbackEvent } from '@line/bot-sdk';
import { reserveClass, cancelReservation, leaveReservation } from '@/services/reservation.service';
import { checkinByReservationId, coachCheckinStudent } from '@/services/checkin.service';
import { getSlotStudents } from '@/services/coach.service';
import { getSlotById } from '@/lib/notion/class-slots';
import { replyText, replyFlex } from '@/lib/line/reply';
import { ACTION } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { confirmDialog } from '@/templates/flex/confirm-dialog';
import { studentListCard } from '@/templates/flex/student-list';
import { getReservationById } from '@/lib/notion/reservations';

export async function handlePostback(event: PostbackEvent): Promise<void> {
  const lineUserId = event.source.userId;
  if (!lineUserId || !event.replyToken) return;

  const data = event.postback.data;
  const [action, id] = data.split(':');

  try {
    switch (action) {
      case ACTION.RESERVE: {
        const result = await reserveClass(lineUserId, id);
        await replyText(event.replyToken, result.message);
        return;
      }

      case ACTION.CONFIRM_CANCEL: {
        const reservation = await getReservationById(id);
        if (!reservation) {
          await replyText(event.replyToken, '找不到此預約紀錄。');
          return;
        }
        // 取得課程名稱
        let slotTitle = '此課程';
        if (reservation.classSlotId) {
          const slot = await getSlotById(reservation.classSlotId);
          if (slot) slotTitle = slot.title;
        }
        await replyFlex(
          event.replyToken,
          '確認取消',
          confirmDialog(
            '確認取消預約',
            `確定要取消「${slotTitle}」的預約嗎？\n堂數將會退還。`,
            { label: '確認取消', data: `${ACTION.CANCEL}:${id}` }
          )
        );
        return;
      }

      case ACTION.CANCEL: {
        const result = await cancelReservation(id);
        await replyText(event.replyToken, result.message);
        return;
      }

      case ACTION.CONFIRM_LEAVE: {
        const reservation = await getReservationById(id);
        if (!reservation) {
          await replyText(event.replyToken, '找不到此預約紀錄。');
          return;
        }
        let slotTitle = '此課程';
        if (reservation.classSlotId) {
          const slot = await getSlotById(reservation.classSlotId);
          if (slot) slotTitle = slot.title;
        }
        await replyFlex(
          event.replyToken,
          '確認請假',
          confirmDialog(
            '確認請假',
            `確定要為「${slotTitle}」請假嗎？\n堂數將會退還。`,
            { label: '確認請假', data: `${ACTION.LEAVE}:${id}` }
          )
        );
        return;
      }

      case ACTION.LEAVE: {
        const result = await leaveReservation(id);
        await replyText(event.replyToken, result.message);
        return;
      }

      case ACTION.CHECKIN: {
        const result = await checkinByReservationId(id);
        await replyText(event.replyToken, result.message);
        return;
      }

      case ACTION.VIEW_STUDENTS: {
        const slot = await getSlotById(id);
        if (!slot) {
          await replyText(event.replyToken, '找不到此課程時段。');
          return;
        }
        const reservations = await getSlotStudents(id);
        await replyFlex(
          event.replyToken,
          '學員名單',
          studentListCard(slot.title, reservations)
        );
        return;
      }

      case ACTION.COACH_CHECKIN: {
        const result = await coachCheckinStudent(id);
        await replyText(event.replyToken, result.message);
        return;
      }

      default:
        await replyText(event.replyToken, TEXT.UNKNOWN_COMMAND);
    }
  } catch (error) {
    console.error('Postback handler error:', error);
    await replyText(event.replyToken, TEXT.ERROR);
  }
}
