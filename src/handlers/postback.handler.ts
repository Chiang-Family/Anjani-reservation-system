import type { PostbackEvent } from '@line/bot-sdk';
import { reserveClass, cancelReservation, leaveReservation, enrichSlotsWithCoachName } from '@/services/reservation.service';
import { checkinByReservationId, coachCheckinStudent } from '@/services/checkin.service';
import { rechargeStudent } from '@/services/student.service';
import { getSlotStudents, createSlotForCoach, deleteSlotForCoach } from '@/services/coach.service';
import { getSlotById, updateSlotMaxCapacity } from '@/lib/notion/class-slots';
import { getStudentById } from '@/lib/notion/students';
import { replyText, replyFlex, replyMessages } from '@/lib/line/reply';
import { ACTION } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { confirmDialog } from '@/templates/flex/confirm-dialog';
import { studentListCard } from '@/templates/flex/student-list';
import { rechargeAmountSelector } from '@/templates/flex/recharge-amount';
import { createSlotDuration } from '@/templates/flex/create-slot-duration';
import { createSlotCapacity } from '@/templates/flex/create-slot-capacity';
import { editCapacityCard } from '@/templates/flex/edit-capacity';
import { getReservationById } from '@/lib/notion/reservations';
import { getCoachById } from '@/lib/notion/coaches';
import { menuQuickReply } from '@/templates/quick-reply';
import { formatSlotDisplay } from '@/lib/utils/date';

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
      case ACTION.CONFIRM_RESERVE: {
        const slot = await getSlotById(id);
        if (!slot) {
          await replyTextWithMenu(event.replyToken, '找不到此課程時段。');
          return;
        }
        let coachLabel = '';
        if (slot.coachId) {
          const coach = await getCoachById(slot.coachId);
          if (coach) coachLabel = `\n教練：${coach.name}`;
        }
        const slotDisplay = formatSlotDisplay(slot.date, slot.startTime, slot.endTime);
        await replyFlex(
          event.replyToken,
          '確認預約',
          confirmDialog(
            '確認預約課程',
            `「${slot.title}」\n${slotDisplay}${coachLabel}\n\n預約將扣除 1 堂課程。`,
            { label: '確認預約', data: `${ACTION.RESERVE}:${id}` },
            '取消',
            '#4a90d9'
          )
        );
        return;
      }

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
          `${slot.title} 學員名單`,
          studentListCard(slot.title, reservations, id)
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

      case ACTION.CONFIRM_DELETE_SLOT: {
        const slot = await getSlotById(id);
        if (!slot) {
          await replyTextWithMenu(event.replyToken, '找不到此課程時段。');
          return;
        }
        await replyFlex(
          event.replyToken,
          '確認刪除課程',
          confirmDialog(
            '確認刪除課程',
            `確定要刪除「${slot.title}」嗎？\n所有預約將自動取消，堂數將退還給學員。`,
            { label: '確認刪除', data: `${ACTION.DELETE_SLOT}:${id}` }
          )
        );
        return;
      }

      case ACTION.DELETE_SLOT: {
        const result = await deleteSlotForCoach(id);
        await replyTextWithMenu(event.replyToken, result.message);
        return;
      }

      case ACTION.EDIT_CAPACITY: {
        const slot = await getSlotById(id);
        if (!slot) {
          await replyTextWithMenu(event.replyToken, '找不到此課程時段。');
          return;
        }
        await replyFlex(
          event.replyToken,
          '編輯人數上限',
          editCapacityCard(slot)
        );
        return;
      }

      case ACTION.EDIT_CAPACITY_CONFIRM: {
        // data: edit_capacity_confirm:SLOT_ID:CAPACITY
        const slotId = parts[1];
        const newCapacity = parseInt(parts[2], 10);
        if (!slotId || isNaN(newCapacity) || newCapacity <= 0) {
          await replyTextWithMenu(event.replyToken, '資料格式有誤，請重新操作。');
          return;
        }
        const slot = await getSlotById(slotId);
        if (!slot) {
          await replyTextWithMenu(event.replyToken, '找不到此課程時段。');
          return;
        }
        if (newCapacity < slot.currentCount) {
          await replyTextWithMenu(event.replyToken, `新容量不能小於已預約人數（${slot.currentCount} 人）。`);
          return;
        }
        await updateSlotMaxCapacity(slotId, newCapacity);
        await replyTextWithMenu(event.replyToken, `✅ 已更新「${slot.title}」人數上限為 ${newCapacity} 人。`);
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
