import type { PostbackEvent } from '@line/bot-sdk';
import { coachCheckinForStudent, recordSessionPayment } from '@/services/checkin.service';
import { getCoachScheduleForDate } from '@/services/coach.service';
import { startCollectAndAdd, executeAddStudent, executeConfirmPayment } from '@/services/student-management.service';
import { getStudentById } from '@/lib/notion/students';
import { getCheckinsByStudent } from '@/lib/notion/checkins';
import { getStudentOverflowInfo, resolveOverflowIds } from '@/lib/notion/hours';
import { replyText, replyFlex, replyMessages } from '@/lib/line/reply';
import { findCoachByLineId } from '@/lib/notion/coaches';
import { generateReportToken } from '@/lib/utils/report-token';
import { ACTION } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { scheduleList } from '@/templates/flex/today-schedule';
import { classHistoryCard, sessionMonthlyCard, paymentPeriodSelector, paymentDetailCard } from '@/templates/flex/class-history';
import { getPaymentsByStudent } from '@/lib/notion/payments';
import { renewalStudentListCard, monthlyStatsCard } from '@/templates/flex/monthly-stats';
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

      case ACTION.SESSION_PAYMENT: {
        // data = session_pay:{studentId}:{date?}
        const dateStr = extra || undefined;
        const result = await recordSessionPayment(lineUserId, id, dateStr);
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
        await replyFlex(event.replyToken, `${label} 課表`, scheduleList(schedule.items, dateStr), menuQuickReply());
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
        await replyFlex(event.replyToken, `${label} 打卡清單`, scheduleList(unchecked, dateStr, 'checkin'), menuQuickReply());
        return;
      }

      case ACTION.ADD_STUDENT_CONFIRM: {
        // data = add_student_confirm:{name}:{hours}:{price}
        const studentName = decodeURIComponent(id);
        const hours = parseFloat(extra);
        const price = parseInt(parts[3], 10);
        const parsed = hours === 1
          ? { name: studentName, type: '單堂' as const, perSessionFee: price }
          : { name: studentName, type: '多堂' as const, hours, price };
        const msg = await executeAddStudent(lineUserId, parsed);
        const qr = coachQuickReply();
        await replyMessages(event.replyToken, [
          { type: 'text', text: msg, quickReply: { items: qr } },
        ]);
        return;
      }

      case ACTION.COLLECT_AND_ADD: {
        const collectResult = await startCollectAndAdd(id, lineUserId);
        if (collectResult.type === 'flex') {
          await replyFlex(event.replyToken, collectResult.title, collectResult.content, menuQuickReply());
        } else {
          await replyText(event.replyToken, collectResult.message, menuQuickReply());
        }
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
        const student = await getStudentById(id);
        const studentName = student?.name ?? '';
        const { primaryId: vcbPrimaryId, relatedIds: vcbRelatedIds } = await resolveOverflowIds(student ?? { id });
        const { summary: hoursSummary, buckets } = await getStudentOverflowInfo(vcbPrimaryId, vcbRelatedIds);
        const bucket = buckets.find(b => b.paymentDate === bucketDate);
        if (!bucket) {
          await replyTextWithMenu(event.replyToken, '找不到該繳費紀錄。');
          return;
        }
        const checkinsDesc = [...bucket.checkins].reverse();
        await replyFlex(event.replyToken, `${studentName} 上課紀錄`,
          classHistoryCard(studentName, checkinsDesc, hoursSummary.remainingHours), menuQuickReply());
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
        const { primaryId: vpPrimaryId, relatedIds: vpRelatedIds } = await resolveOverflowIds(student);
        const { payments: allPayments } = await getStudentOverflowInfo(vpPrimaryId, vpRelatedIds);
        const periodPayments = allPayments.filter(p => p.createdAt === detailDate);
        if (periodPayments.length === 0) {
          await replyTextWithMenu(event.replyToken, '找不到該期繳費紀錄。');
          return;
        }
        await replyFlex(event.replyToken, `${student.name} 繳費明細`,
          paymentDetailCard(student.name, detailDate, periodPayments, id), menuQuickReply());
        return;
      }

      case ACTION.VIEW_STUDENT_HISTORY: {
        const student = await getStudentById(id);
        if (!student) {
          await replyTextWithMenu(event.replyToken, '找不到該學員資料。');
          return;
        }

        // 單堂學員：顯示當月上課 + 繳費狀態合併視圖
        if (student.paymentType === '單堂') {
          const [checkins, payments] = await Promise.all([
            getCheckinsByStudent(id),
            getPaymentsByStudent(id),
          ]);
          const currentMonth = todayDateString().slice(0, 7);
          const paidDates = new Set(
            payments.filter(p => p.isSessionPayment).map(p => p.actualDate)
          );
          const monthRecords = checkins
            .filter(c => c.classDate.startsWith(currentMonth))
            .map(c => ({ ...c, isPaid: paidDates.has(c.classDate) }));
          const historicalUnpaid = checkins
            .filter(c => !c.classDate.startsWith(currentMonth) && !paidDates.has(c.classDate));
          await replyFlex(event.replyToken, `${student.name} 當月上課紀錄`,
            sessionMonthlyCard(student.name, monthRecords, historicalUnpaid), menuQuickReply());
          return;
        }

        // 多堂學員：顯示最新一期的上課紀錄（有 overflow 時顯示未繳費期）
        const { primaryId: vshPrimaryId, relatedIds: vshRelatedIds } = await resolveOverflowIds(student);
        const { summary, overflow } = await getStudentOverflowInfo(vshPrimaryId, vshRelatedIds);
        if (overflow.hasOverflow) {
          const unpaidDesc = [...overflow.unpaidCheckins].reverse();
          await replyFlex(event.replyToken, `${student.name} 上課紀錄`,
            classHistoryCard(student.name, unpaidDesc, summary.remainingHours, '未繳費'), menuQuickReply());
        } else {
          const paidDesc = [...overflow.paidCheckins].reverse();
          await replyFlex(event.replyToken, `${student.name} 上課紀錄`,
            classHistoryCard(student.name, paidDesc, summary.remainingHours), menuQuickReply());
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
        const { primaryId: vuoPrimaryId, relatedIds: vuoRelatedIds } = await resolveOverflowIds(student);
        const { summary: overflowSummary, overflow: overflowInfo } = await getStudentOverflowInfo(vuoPrimaryId, vuoRelatedIds);
        if (!overflowInfo.hasOverflow) {
          await replyTextWithMenu(event.replyToken, `${student.name} 目前沒有未繳費的上課紀錄。`);
          return;
        }
        const unpaidDesc = [...overflowInfo.unpaidCheckins].reverse();
        await replyFlex(event.replyToken, `${student.name} 未繳費上課紀錄`,
          classHistoryCard(student.name, unpaidDesc, overflowSummary.remainingHours, '未繳費'), menuQuickReply());
        return;
      }

      case ACTION.VIEW_PAYMENT_HISTORY: {
        // 顯示繳費期數選單，點選後查看該期上課紀錄
        const student = await getStudentById(id);
        if (!student) {
          await replyTextWithMenu(event.replyToken, '找不到該學員資料。');
          return;
        }
        const { primaryId: vphPrimaryId, relatedIds: vphRelatedIds } = await resolveOverflowIds(student);
        const { summary, overflow, payments } = await getStudentOverflowInfo(vphPrimaryId, vphRelatedIds);
        if (payments.length === 0) {
          await replyTextWithMenu(event.replyToken, `${student.name} 目前沒有繳費紀錄。`);
          return;
        }
        await replyFlex(event.replyToken, `${student.name} 繳費紀錄`,
          paymentPeriodSelector(student.name, payments, vphPrimaryId, summary.remainingHours, overflow.hasOverflow), menuQuickReply());
        return;
      }

      case ACTION.VIEW_RENEWAL_UNPAID:
      case ACTION.VIEW_RENEWAL_PAID: {
        // data = renewal_paid:YYYY:M 或 renewal_unpaid:YYYY:M
        const targetYear = parts[1] ? parseInt(parts[1]) : undefined;
        const targetMonth = parts[2] ? parseInt(parts[2]) : undefined;
        const stats = await getCoachMonthlyStats(lineUserId, targetYear, targetMonth);
        if (!stats || stats.renewalForecast.students.length === 0) {
          await replyTextWithMenu(event.replyToken, '本月沒有續約學員資料。');
          return;
        }
        const showPaid = action === ACTION.VIEW_RENEWAL_PAID;
        const filtered = stats.renewalForecast.students.filter(s => showPaid ? s.isPaid : !s.isPaid);
        const title = showPaid ? '✅ 已繳費學員' : '❌ 未繳費學員';
        const color = showPaid ? '#2ecc71' : '#e74c3c';
        await replyFlex(event.replyToken, title,
          renewalStudentListCard(title, filtered, color), menuQuickReply());
        return;
      }

      case ACTION.VIEW_MONTH_STATS: {
        // data = view_month_stats:YYYY:M
        const targetYear = parts[1] ? parseInt(parts[1]) : undefined;
        const targetMonth = parts[2] ? parseInt(parts[2]) : undefined;
        const stats = await getCoachMonthlyStats(lineUserId, targetYear, targetMonth);
        if (!stats) {
          await replyTextWithMenu(event.replyToken, '找不到教練資料。');
          return;
        }
        await replyFlex(
          event.replyToken,
          `${stats.year}/${stats.month} 月度統計`,
          monthlyStatsCard(stats),
          coachQuickReply(),
        );
        return;
      }

      case ACTION.GENERATE_REPORT: {
        // data = gen_report:YYYY-MM
        const match = id?.match(/^(\d{4})-(\d{2})$/);
        if (!match) {
          await replyTextWithMenu(event.replyToken, '報表格式錯誤。');
          return;
        }
        const repYear = parseInt(match[1]);
        const repMonth = parseInt(match[2]);
        try {
          const coach = await findCoachByLineId(lineUserId);
          if (!coach) {
            await replyTextWithMenu(event.replyToken, '找不到教練資料。');
            return;
          }
          const token = generateReportToken(coach.id, repYear, repMonth);
          const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || 'localhost:3000';
          const protocol = host.startsWith('localhost') ? 'http' : 'https';
          const reportUrl = `${protocol}://${host}/api/report?coach=${coach.id}&year=${repYear}&month=${repMonth}&token=${token}`;
          await replyText(event.replyToken, `✅ ${repYear}年${repMonth}月報表\n\n📄 點此查看（可列印）：\n${reportUrl}`, coachQuickReply());
        } catch (reportError) {
          console.error('Report generation error:', reportError);
          const msg = reportError instanceof Error ? reportError.message : String(reportError);
          await replyTextWithMenu(event.replyToken, `❌ 報表生成失敗：${msg}`);
        }
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
