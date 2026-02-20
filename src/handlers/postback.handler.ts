import type { PostbackEvent } from '@line/bot-sdk';
import { reserveClass, cancelReservation, leaveReservation } from '@/services/reservation.service';
import { checkinByReservationId, coachCheckinStudent } from '@/services/checkin.service';
import { rechargeStudent } from '@/services/student.service';
import { getSlotStudents, createSlotForCoach } from '@/services/coach.service';
import { getSlotById } from '@/lib/notion/class-slots';
import { getStudentById } from '@/lib/notion/students';
import { replyText, replyFlex, replyMessages } from '@/lib/line/reply';
import { ACTION } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { confirmDialog } from '@/templates/flex/confirm-dialog';
import { studentListCard } from '@/templates/flex/student-list';
import { rechargeAmountSelector } from '@/templates/flex/recharge-amount';
import { createSlotDuration } from '@/templates/flex/create-slot-duration';
import { createSlotCapacity } from '@/templates/flex/create-slot-capacity';
import { getReservationById } from '@/lib/notion/reservations';
import { menuQuickReply } from '@/templates/quick-reply';

function replyTextWithMenu(replyToken: string, text: string) {
  return replyMessages(replyToken, [
    { type: 'text', text, quickReply: { items: menuQuickReply() } },
  ]);
}

export async function handlePostback(event: PostbackEvent): Promise<void> {
  const lineUserId = event.source.userId;
  if (!lineUserId || !event.replyToken) return;

  const data = event.postback.data;
  const parts = data.split(':');
  const action = parts[0];
  const id = parts[1];

  try {
    switch (action) {
      case ACTION.RESERVE: {
        const result = await reserveClass(lineUserId, id);
        await replyTextWithMenu(event.replyToken, result.message);
        return;
      }

      case ACTION.CONFIRM_CANCEL: {
        const reservation = await getReservationById(id);
        if (!reservation) {
          await replyTextWithMenu(event.replyToken, '找不到此預約紀錄。');
          return;
        }
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
        await replyTextWithMenu(event.replyToken, result.message);
        return;
      }

      case ACTION.CONFIRM_LEAVE: {
        const reservation = await getReservationById(id);
        if (!reservation) {
          await replyTextWithMenu(event.replyToken, '找不到此預約紀錄。');
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
        await replyTextWithMenu(event.replyToken, result.message);
        return;
      }

      case ACTION.CHECKIN: {
        const result = await checkinByReservationId(id);
        await replyTextWithMenu(event.replyToken, result.message);
        return;
      }

      case ACTION.VIEW_STUDENTS: {
        const slot = await getSlotById(id);
        if (!slot) {
          await replyTextWithMenu(event.replyToken, '找不到此課程時段。');
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
        await replyTextWithMenu(event.replyToken, result.message);
        return;
      }

      case ACTION.RECHARGE_SELECT: {
        const student = await getStudentById(id);
        if (!student) {
          await replyTextWithMenu(event.replyToken, '找不到該學員資料。');
          return;
        }
        await replyFlex(
          event.replyToken,
          '選擇充值堂數',
          rechargeAmountSelector(student)
        );
        return;
      }

      case ACTION.RECHARGE_CONFIRM: {
        const amount = parseInt(parts[2], 10);
        if (!id || isNaN(amount) || amount <= 0) {
          await replyTextWithMenu(event.replyToken, '充值資料有誤，請重新操作。');
          return;
        }
        const result = await rechargeStudent(id, amount);
        await replyTextWithMenu(event.replyToken, result.message);
        return;
      }

      // === 教練新增課程流程 ===

      case ACTION.CREATE_SLOT_START: {
        const params = event.postback.params as { datetime?: string } | undefined;
        const datetime = params?.datetime;
        if (!datetime) {
          await replyTextWithMenu(event.replyToken, '無法取得日期時間，請重新操作。');
          return;
        }
        // datetime format: "2026-02-20T09:00"
        const dateStr = datetime.replace(/-/g, '').slice(0, 8); // "20260220"
        const startTimeStr = datetime.slice(11).replace(':', ''); // "0900"
        const displayDate = `${datetime.slice(0, 10)}`; // "2026-02-20"
        const displayTime = datetime.slice(11); // "09:00"

        await replyFlex(
          event.replyToken,
          '選擇時長',
          createSlotDuration(dateStr, startTimeStr, displayDate, displayTime)
        );
        return;
      }

      case ACTION.CREATE_SLOT_DURATION: {
        // data: create_slot_duration:YYYYMMDD:HHmm:MINUTES
        const dateStr = parts[1];
        const startTimeStr = parts[2];
        const minutes = parseInt(parts[3], 10);

        if (!dateStr || !startTimeStr || isNaN(minutes)) {
          await replyTextWithMenu(event.replyToken, '資料格式有誤，請重新操作。');
          return;
        }

        // Calculate end time
        const startHour = parseInt(startTimeStr.slice(0, 2), 10);
        const startMin = parseInt(startTimeStr.slice(2, 4), 10);
        const totalMin = startHour * 60 + startMin + minutes;
        const endHour = Math.floor(totalMin / 60).toString().padStart(2, '0');
        const endMin = (totalMin % 60).toString().padStart(2, '0');
        const endTimeStr = `${endHour}${endMin}`;

        const displayDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
        const displayStartTime = `${startTimeStr.slice(0, 2)}:${startTimeStr.slice(2, 4)}`;
        const displayEndTime = `${endHour}:${endMin}`;

        await replyFlex(
          event.replyToken,
          '選擇人數',
          createSlotCapacity(
            dateStr, startTimeStr, endTimeStr,
            displayDate, displayStartTime, displayEndTime
          )
        );
        return;
      }

      case ACTION.CREATE_SLOT_CONFIRM: {
        // data: create_slot_confirm:YYYYMMDD:HHmm:HHmm:CAPACITY
        const dateStr = parts[1];
        const startTimeStr = parts[2];
        const endTimeStr = parts[3];
        const capacity = parseInt(parts[4], 10);

        if (!dateStr || !startTimeStr || !endTimeStr || isNaN(capacity)) {
          await replyTextWithMenu(event.replyToken, '資料格式有誤，請重新操作。');
          return;
        }

        const result = await createSlotForCoach(
          lineUserId, dateStr, startTimeStr, endTimeStr, capacity
        );
        await replyTextWithMenu(event.replyToken, result.message);
        return;
      }

      default:
        await replyTextWithMenu(event.replyToken, TEXT.UNKNOWN_COMMAND);
    }
  } catch (error) {
    console.error('Postback handler error:', error);
    await replyTextWithMenu(event.replyToken, TEXT.ERROR);
  }
}
