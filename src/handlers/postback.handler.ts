import type { PostbackEvent } from '@line/bot-sdk';
import { coachCheckinForStudent } from '@/services/checkin.service';
import { startEditStudent, toggleStudentPayment } from '@/services/student-management.service';
import { getStudentById } from '@/lib/notion/students';
import { replyText, replyMessages } from '@/lib/line/reply';
import { ACTION } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
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

  try {
    switch (action) {
      case ACTION.COACH_CHECKIN: {
        const result = await coachCheckinForStudent(lineUserId, id);
        await replyTextWithMenu(event.replyToken, result.message);
        return;
      }

      case ACTION.EDIT_CLASSES: {
        const student = await getStudentById(id);
        if (!student) {
          await replyTextWithMenu(event.replyToken, '找不到該學員資料。');
          return;
        }
        const msg = startEditStudent(lineUserId, 'classes', id, student.name);
        await replyText(event.replyToken, msg);
        return;
      }

      case ACTION.EDIT_PRICE: {
        const student = await getStudentById(id);
        if (!student) {
          await replyTextWithMenu(event.replyToken, '找不到該學員資料。');
          return;
        }
        const msg = startEditStudent(lineUserId, 'price', id, student.name);
        await replyText(event.replyToken, msg);
        return;
      }

      case ACTION.TOGGLE_PAYMENT: {
        const msg = await toggleStudentPayment(id);
        const qr = coachQuickReply();
        await replyMessages(event.replyToken, [
          { type: 'text', text: msg, quickReply: { items: qr } },
        ]);
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
