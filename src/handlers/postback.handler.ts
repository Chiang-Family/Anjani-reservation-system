import type { PostbackEvent } from '@line/bot-sdk';
import { coachCheckinForStudent } from '@/services/checkin.service';
import { getCoachScheduleForDate } from '@/services/coach.service';
import { startCollectAndAdd } from '@/services/student-management.service';
import { getStudentById } from '@/lib/notion/students';
import { getCheckinsByStudent } from '@/lib/notion/checkins';
import { getStudentHoursSummary } from '@/lib/notion/hours';
import { getPaymentsByStudent } from '@/lib/notion/payments';
import { replyText, replyFlex, replyMessages } from '@/lib/line/reply';
import { ACTION } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { scheduleList } from '@/templates/flex/today-schedule';
import { classHistoryCard } from '@/templates/flex/class-history';
import { formatDateLabel, todayDateString, addDays } from '@/lib/utils/date';
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
        // data = view_schedule (date from datetimepicker params)
        const params = event.postback.params;
        const dateStr = (params && 'date' in params ? params.date : undefined) ?? id;
        const schedule = await getCoachScheduleForDate(lineUserId, dateStr);
        if (!schedule) {
          await replyTextWithMenu(event.replyToken, '找不到教練資料。');
          return;
        }
        const label = formatDateLabel(dateStr);
        await replyFlex(event.replyToken, `${label} 課表`, scheduleList(schedule.items, dateStr));
        return;
      }

      case ACTION.CHECKIN_SCHEDULE: {
        // data = checkin_schedule (date from datetimepicker params)
        const params = event.postback.params;
        const dateStr = (params && 'date' in params ? params.date : undefined) ?? id ?? todayDateString();
        const schedule = await getCoachScheduleForDate(lineUserId, dateStr);
        if (!schedule) {
          await replyTextWithMenu(event.replyToken, '找不到教練資料。');
          return;
        }
        const unchecked = schedule.items.filter((item) => !item.isCheckedIn && item.studentNotionId);
        const label = formatDateLabel(dateStr);
        await replyFlex(event.replyToken, `${label} 打卡清單`, scheduleList(unchecked, dateStr, 'checkin'));
        return;
      }

      case ACTION.COLLECT_AND_ADD: {
        const msg = await startCollectAndAdd(id, lineUserId);
        await replyText(event.replyToken, msg);
        return;
      }

      case ACTION.VIEW_CLASS_BY_PAYMENT: {
        // data = view_class_pay:{studentId}:{paymentIndex}
        const paymentIndex = parseInt(extra, 10);
        const [allPayments, allCheckins, hoursSummary] = await Promise.all([
          getPaymentsByStudent(id),
          getCheckinsByStudent(id),
          getStudentHoursSummary(id),
        ]);
        if (isNaN(paymentIndex) || paymentIndex >= allPayments.length) {
          await replyTextWithMenu(event.replyToken, '找不到該繳費紀錄。');
          return;
        }
        const fromDate = allPayments[paymentIndex].createdAt;
        const toDate = paymentIndex === 0
          ? todayDateString()
          : addDays(allPayments[paymentIndex - 1].createdAt, -1);
        const filtered = allCheckins.filter(
          (c) => c.classDate >= fromDate && c.classDate <= toDate
        );
        const student = await getStudentById(id);
        const studentName = student?.name ?? '';
        await replyFlex(event.replyToken, `${studentName} 上課紀錄`,
          classHistoryCard(studentName, filtered, hoursSummary.remainingHours));
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
