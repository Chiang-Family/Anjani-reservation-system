import type { PostbackEvent } from '@line/bot-sdk';
import { coachCheckinForStudent } from '@/services/checkin.service';
import { getCoachScheduleForDate } from '@/services/coach.service';
import { startEditStudent, startPaymentCollection } from '@/services/student-management.service';
import { getStudentById } from '@/lib/notion/students';
import { replyText, replyFlex, replyMessages } from '@/lib/line/reply';
import { ACTION } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { scheduleList } from '@/templates/flex/today-schedule';
import { formatDateLabel } from '@/lib/utils/date';
import { menuQuickReply, coachQuickReply } from '@/templates/quick-reply';

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
  const extra = parts[2];

  try {
    switch (action) {
      case ACTION.COACH_CHECKIN: {
        // data = coach_checkin:{studentId}:{date?}
        const dateStr = extra || undefined;
        const result = await coachCheckinForStudent(lineUserId, id, dateStr);
        const qr = coachQuickReply();
        await replyMessages(event.replyToken, [
          { type: 'text', text: result.message, quickReply: { items: qr } },
        ]);
        return;
      }

      case ACTION.VIEW_SCHEDULE: {
        // data = view_schedule:{date}
        const dateStr = id;
        const schedule = await getCoachScheduleForDate(lineUserId, dateStr);
        if (!schedule) {
          await replyTextWithMenu(event.replyToken, '找不到教練資料。');
          return;
        }
        const label = formatDateLabel(dateStr);
        await replyFlex(event.replyToken, `${label} 課表`, scheduleList(schedule.items, dateStr));
        return;
      }

      case ACTION.ADD_HOURS: {
        const student = await getStudentById(id);
        if (!student) {
          await replyTextWithMenu(event.replyToken, '找不到該學員資料。');
          return;
        }
        const msg = startEditStudent(lineUserId, 'add_hours', id, student.name);
        await replyText(event.replyToken, msg);
        return;
      }

      case ACTION.EDIT_HOURS: {
        const student = await getStudentById(id);
        if (!student) {
          await replyTextWithMenu(event.replyToken, '找不到該學員資料。');
          return;
        }
        const msg = startEditStudent(lineUserId, 'hours', id, student.name);
        await replyText(event.replyToken, msg);
        return;
      }

      case ACTION.TOGGLE_PAYMENT: {
        const msg = await startPaymentCollection(id, lineUserId);
        await replyText(event.replyToken, msg);
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
