import type { PostbackEvent } from '@line/bot-sdk';
import { coachCheckinForStudent } from '@/services/checkin.service';
import { getCoachScheduleForDate } from '@/services/coach.service';
import { startCollectAndAdd, executeAddStudent, executeConfirmPayment } from '@/services/student-management.service';
import { getStudentById } from '@/lib/notion/students';
import { getStudentOverflowInfo } from '@/lib/notion/hours';
import { replyText, replyFlex, replyMessages } from '@/lib/line/reply';
import { ACTION } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { scheduleList } from '@/templates/flex/today-schedule';
import { classHistoryCard, paymentPeriodSelector, paymentDetailCard } from '@/templates/flex/class-history';
import { renewalStudentListCard } from '@/templates/flex/monthly-stats';
import { getCoachMonthlyStats } from '@/services/stats.service';
import { formatDateLabel, todayDateString } from '@/lib/utils/date';
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

      case ACTION.ADD_STUDENT_CONFIRM: {
        // data = add_student_confirm:{name}:{hours}:{price}
        const studentName = decodeURIComponent(id);
        const hours = parseFloat(extra);
        const price = parseInt(parts[3], 10);
        const msg = await executeAddStudent(lineUserId, studentName, hours, price);
        const qr = coachQuickReply();
        await replyMessages(event.replyToken, [
          { type: 'text', text: msg, quickReply: { items: qr } },
        ]);
        return;
      }

      case ACTION.COLLECT_AND_ADD: {
        const msg = await startCollectAndAdd(id, lineUserId);
        await replyText(event.replyToken, msg);
        return;
      }

      case ACTION.CONFIRM_PAYMENT: {
        // data = confirm_pay:{studentId}:{amount}:{pricePerHour}:{periodDate|new}
        const amount = parseInt(extra, 10);
        const pricePerHour = parseInt(parts[3], 10);
        const periodDate = parts[4] || 'new';
        const result = await executeConfirmPayment(lineUserId, id, amount, pricePerHour, periodDate);
        const qr = coachQuickReply();
        await replyMessages(event.replyToken, [
          { type: 'text', text: result.message, quickReply: { items: qr } },
        ]);
        return;
      }

      case ACTION.VIEW_CLASS_BY_PAYMENT: {
        // data = view_class_pay:{studentId}:{bucketDate}
        const bucketDate = extra;
        const { summary: hoursSummary, buckets } = await getStudentOverflowInfo(id);
        const bucket = buckets.find(b => b.paymentDate === bucketDate);
        if (!bucket) {
          await replyTextWithMenu(event.replyToken, '找不到該繳費紀錄。');
          return;
        }

        const student = await getStudentById(id);
        const studentName = student?.name ?? '';
        const checkinsDesc = [...bucket.checkins].reverse();
        await replyFlex(event.replyToken, `${studentName} 上課紀錄`,
          classHistoryCard(studentName, checkinsDesc, hoursSummary.remainingHours));
        return;
      }

      case ACTION.VIEW_PAYMENT_DETAIL: {
        // data = view_pay_dtl:{studentId}:{bucketDate}
        const detailDate = extra;
        const student = await getStudentById(id);
        if (!student) {
          await replyTextWithMenu(event.replyToken, '找不到該學員資料。');
          return;
        }
        const { payments: allPayments } = await getStudentOverflowInfo(id);
        const periodPayments = allPayments.filter(p => p.createdAt === detailDate);
        if (periodPayments.length === 0) {
          await replyTextWithMenu(event.replyToken, '找不到該期繳費紀錄。');
          return;
        }
        await replyFlex(event.replyToken, `${student.name} 繳費明細`,
          paymentDetailCard(student.name, detailDate, periodPayments, id));
        return;
      }

      case ACTION.VIEW_STUDENT_HISTORY: {
        // 顯示最新一期的上課紀錄（有 overflow 時顯示未繳費期）
        const student = await getStudentById(id);
        if (!student) {
          await replyTextWithMenu(event.replyToken, '找不到該學員資料。');
          return;
        }
        const { summary, overflow } = await getStudentOverflowInfo(id);
        if (overflow.hasOverflow) {
          const unpaidDesc = [...overflow.unpaidCheckins].reverse();
          await replyFlex(event.replyToken, `${student.name} 上課紀錄`,
            classHistoryCard(student.name, unpaidDesc, summary.remainingHours, '未繳費'));
        } else {
          const paidDesc = [...overflow.paidCheckins].reverse();
          await replyFlex(event.replyToken, `${student.name} 上課紀錄`,
            classHistoryCard(student.name, paidDesc, summary.remainingHours));
        }
        return;
      }

      case ACTION.VIEW_UNPAID_OVERFLOW: {
        // data = view_unpaid:{studentId}
        const student = await getStudentById(id);
        if (!student) {
          await replyTextWithMenu(event.replyToken, '找不到該學員資料。');
          return;
        }
        const { summary: overflowSummary, overflow: overflowInfo } = await getStudentOverflowInfo(id);
        if (!overflowInfo.hasOverflow) {
          await replyTextWithMenu(event.replyToken, `${student.name} 目前沒有未繳費的上課紀錄。`);
          return;
        }
        const unpaidDesc = [...overflowInfo.unpaidCheckins].reverse();
        await replyFlex(event.replyToken, `${student.name} 未繳費上課紀錄`,
          classHistoryCard(student.name, unpaidDesc, overflowSummary.remainingHours, '未繳費'));
        return;
      }

      case ACTION.VIEW_PAYMENT_HISTORY: {
        // 顯示繳費期數選單，點選後查看該期上課紀錄
        const student = await getStudentById(id);
        if (!student) {
          await replyTextWithMenu(event.replyToken, '找不到該學員資料。');
          return;
        }
        const { summary, overflow, payments } = await getStudentOverflowInfo(id);
        if (payments.length === 0) {
          await replyTextWithMenu(event.replyToken, `${student.name} 目前沒有繳費紀錄。`);
          return;
        }
        await replyFlex(event.replyToken, `${student.name} 繳費紀錄`,
          paymentPeriodSelector(student.name, payments, id, summary.remainingHours, overflow.hasOverflow));
        return;
      }

      case ACTION.VIEW_RENEWAL_UNPAID:
      case ACTION.VIEW_RENEWAL_PAID: {
        const stats = await getCoachMonthlyStats(lineUserId);
        if (!stats || stats.renewalForecast.students.length === 0) {
          await replyTextWithMenu(event.replyToken, '本月沒有續約學員資料。');
          return;
        }
        const showPaid = action === ACTION.VIEW_RENEWAL_PAID;
        const filtered = stats.renewalForecast.students.filter(s => {
          const isPaid = s.isPaid;
          return showPaid ? isPaid : !isPaid;
        });
        const title = showPaid ? '✅ 已繳費學員' : '❌ 未繳費學員';
        const color = showPaid ? '#2ecc71' : '#e74c3c';
        await replyFlex(event.replyToken, title,
          renewalStudentListCard(title, filtered, color));
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
