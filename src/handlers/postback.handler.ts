import type { PostbackEvent } from '@line/bot-sdk';
import { coachCheckinForStudent } from '@/services/checkin.service';
import { getCoachScheduleForDate } from '@/services/coach.service';
import { startCollectAndAdd } from '@/services/student-management.service';
import { getStudentById } from '@/lib/notion/students';
import { getCheckinsByStudent } from '@/lib/notion/checkins';
import { getStudentHoursSummary } from '@/lib/notion/hours';
import { replyText, replyFlex, replyMessages } from '@/lib/line/reply';
import { ACTION } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { scheduleList } from '@/templates/flex/today-schedule';
import { classHistoryCard } from '@/templates/flex/class-history';
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

      case ACTION.COLLECT_AND_ADD: {
        const msg = await startCollectAndAdd(id, lineUserId);
        await replyText(event.replyToken, msg);
        return;
      }

      case ACTION.VIEW_STUDENT_HISTORY: {
        const student = await getStudentById(id);
        if (!student) {
          await replyTextWithMenu(event.replyToken, '找不到該學員資料。');
          return;
        }
        const [records, summary] = await Promise.all([
          getCheckinsByStudent(id),
          getStudentHoursSummary(id),
        ]);
        await replyFlex(event.replyToken, `${student.name} 上課紀錄`,
          classHistoryCard(student.name, records, summary.remainingHours));
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
