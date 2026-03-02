import type { MessageEvent, TextEventMessage } from '@line/bot-sdk';
import { identifyUser, getStudentInfo } from '@/services/student.service';
import { getCoachScheduleForDate } from '@/services/coach.service';
import { getCoachMonthlyStats, getCoachWeeklyStats, getCoachAnnualStats } from '@/services/stats.service';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { findCoachByLineId, getCoachById } from '@/lib/notion/coaches';
import { findStudentByLineId, getAllStudentIds, getStudentById } from '@/lib/notion/students';
import { getCheckinsByStudent, getCheckinsByStudents } from '@/lib/notion/checkins';
import { getPaymentsByStudent, getPaymentsByStudents } from '@/lib/notion/payments';
import { getStudentOverflowInfo, resolveOverflowIds } from '@/lib/notion/hours';
import { paymentPeriodSelector } from '@/templates/flex/class-history';
import {
  startAddStudent,
  parseAddStudentInput,
  getCollectAndAddState,
  handleCollectAndAddStep,
  handleBinding,
  getBindingState,
  startBinding,
} from '@/services/student-management.service';
import { replyText, replyFlex, replyMessages } from '@/lib/line/reply';
import { generateReportToken } from '@/lib/utils/report-token';
import { pMap } from '@/lib/utils/concurrency';
import { KEYWORD, ROLE } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { paymentHistoryCard } from '@/templates/flex/payment-history';
import { studentMenu, coachMenu } from '@/templates/flex/main-menu';
import { scheduleList } from '@/templates/flex/today-schedule';
import { getEventsForDateRange } from '@/lib/google/calendar';
import { todayDateString, addDays } from '@/lib/utils/date';
import { studentScheduleCard } from '@/templates/flex/student-schedule';
import { monthlyStatsCard } from '@/templates/flex/monthly-stats';
import { weeklyStatsCard } from '@/templates/flex/weekly-stats';
import { annualStatsCard } from '@/templates/flex/annual-stats';
import { reportSelectorCard } from '@/templates/flex/report-selector';
import { studentMgmtList } from '@/templates/flex/student-mgmt-list';
import { classHistoryCard, sessionMonthlyCard } from '@/templates/flex/class-history';
import { studentQuickReply, coachQuickReply, menuQuickReply } from '@/templates/quick-reply';
import { addStudentConfirmCard } from '@/templates/flex/add-student-confirm';

export async function handleMessage(event: MessageEvent): Promise<void> {
  if (event.message.type !== 'text') return;

  const lineUserId = event.source.userId;
  if (!lineUserId || !event.replyToken) return;

  const text = (event.message as TextEventMessage).text.trim();
  const user = await identifyUser(lineUserId);

  // Check if coach is in a multi-step flow
  if (user?.role === ROLE.COACH) {
    const collectState = getCollectAndAddState(lineUserId);
    if (collectState) {
      try {
        const result = await handleCollectAndAddStep(lineUserId, text);
        if (result.flex) {
          await replyFlex(event.replyToken, result.flex.title, result.flex.content, coachQuickReply());
        } else {
          const qr = coachQuickReply();
          await replyMessages(event.replyToken, [
            { type: 'text', text: result.message, quickReply: result.done ? { items: qr } : undefined },
          ]);
        }
      } catch (error) {
        console.error('Collect and add step error:', error);
        await replyText(event.replyToken, TEXT.ERROR, coachQuickReply());
      }
      return;
    }
  }

  // Check if unidentified user is in binding flow
  if (!user) {
    const bindState = getBindingState(lineUserId);
    if (bindState?.waitingForName) {
      try {
        const result = await handleBinding(lineUserId, text);
        if (result.success) {
          const student = await getStudentInfo(lineUserId);
          if (student) {
            const coach = student.coachId ? await getCoachById(student.coachId) : null;
            await replyFlex(event.replyToken, '安傑力課程管理系統', studentMenu(student.name, coach?.lineUrl, student.paymentType), studentQuickReply(student.paymentType));
            return;
          }
          const coach = await findCoachByLineId(lineUserId);
          if (coach) {
            await replyFlex(event.replyToken, '安傑力教練管理系統', coachMenu(coach.name), coachQuickReply());
            return;
          }
        }
        await replyText(event.replyToken, result.message, menuQuickReply());
      } catch (error) {
        console.error('Binding error:', error);
        await replyText(event.replyToken, TEXT.ERROR, menuQuickReply());
      }
      return;
    }

    console.log(`[未識別使用者] LINE User ID: ${lineUserId}`);
    startBinding(lineUserId);
    await replyText(event.replyToken, TEXT.WELCOME_NEW);
    return;
  }

  try {
    if (user.role === ROLE.STUDENT) {
      await handleStudentMessage(event.replyToken, lineUserId, text, user.name);
    } else {
      await handleCoachMessage(event.replyToken, lineUserId, text, user.name);
    }
  } catch (error) {
    console.error('Message handler error:', error);
    await replyText(event.replyToken, TEXT.ERROR, menuQuickReply());
  }
}

async function handleStudentMessage(
  replyToken: string,
  lineUserId: string,
  text: string,
  name: string
): Promise<void> {
  switch (text) {
    case KEYWORD.SESSION_CLASS_HISTORY:
    case KEYWORD.CLASS_HISTORY: {
      const student = await findStudentByLineId(lineUserId);
      if (!student) {
        const qr = studentQuickReply();
        await replyMessages(replyToken, [
          { type: 'text', text: TEXT.UNKNOWN_USER, quickReply: { items: qr } },
        ]);
        return;
      }

      // 單堂學員：顯示當月上課 + 繳費狀態合併視圖
      if (student.paymentType === '單堂') {
        const allIds = getAllStudentIds(student);
        const [checkins, payments] = await Promise.all([
          allIds.length > 1 ? getCheckinsByStudents(allIds) : getCheckinsByStudent(student.id),
          allIds.length > 1 ? getPaymentsByStudents(allIds) : getPaymentsByStudent(student.id),
        ]);
        const currentMonth = todayDateString().slice(0, 7);
        const paidKeys = new Set(
          payments.filter(p => p.isSessionPayment).map(p => `${p.studentId}:${p.actualDate}`)
        );
        const monthRecords = checkins
          .filter(c => c.classDate.startsWith(currentMonth))
          .map(c => ({ ...c, isPaid: paidKeys.has(`${c.studentId}:${c.classDate}`) }));
        const historicalUnpaid = checkins
          .filter(c => !c.classDate.startsWith(currentMonth) && !paidKeys.has(`${c.studentId}:${c.classDate}`));
        await replyFlex(replyToken, '當月上課紀錄', sessionMonthlyCard(student.name, monthRecords, historicalUnpaid), studentQuickReply(student.paymentType));
        return;
      }

      const { primaryId: classHistPrimaryId, relatedIds: classHistRelatedIds } = await resolveOverflowIds(student);
      const { summary, overflow } = await getStudentOverflowInfo(classHistPrimaryId, classHistRelatedIds);
      if (overflow.hasOverflow) {
        const unpaidDesc = [...overflow.unpaidCheckins].reverse();
        await replyFlex(replyToken, '當期上課紀錄', classHistoryCard(student.name, unpaidDesc, summary.remainingHours, '未繳費'), studentQuickReply(student.paymentType));
      } else {
        const paidDesc = [...overflow.paidCheckins].reverse();
        await replyFlex(replyToken, '當期上課紀錄', classHistoryCard(student.name, paidDesc, summary.remainingHours), studentQuickReply(student.paymentType));
      }
      return;
    }

    case KEYWORD.PAYMENT_HISTORY: {
      const student = await findStudentByLineId(lineUserId);
      if (!student) {
        const qr = studentQuickReply();
        await replyMessages(replyToken, [
          { type: 'text', text: TEXT.UNKNOWN_USER, quickReply: { items: qr } },
        ]);
        return;
      }

      // 單堂學員：繳費紀錄已合併至上課紀錄，導向合併視圖
      if (student.paymentType === '單堂') {
        const allIds = getAllStudentIds(student);
        const [checkins, payments] = await Promise.all([
          allIds.length > 1 ? getCheckinsByStudents(allIds) : getCheckinsByStudent(student.id),
          allIds.length > 1 ? getPaymentsByStudents(allIds) : getPaymentsByStudent(student.id),
        ]);
        const currentMonth = todayDateString().slice(0, 7);
        const paidKeys = new Set(
          payments.filter(p => p.isSessionPayment).map(p => `${p.studentId}:${p.actualDate}`)
        );
        const monthRecords = checkins
          .filter(c => c.classDate.startsWith(currentMonth))
          .map(c => ({ ...c, isPaid: paidKeys.has(`${c.studentId}:${c.classDate}`) }));
        const historicalUnpaid = checkins
          .filter(c => !c.classDate.startsWith(currentMonth) && !paidKeys.has(`${c.studentId}:${c.classDate}`));
        await replyFlex(replyToken, '當月上課紀錄', sessionMonthlyCard(student.name, monthRecords, historicalUnpaid), studentQuickReply(student.paymentType));
        return;
      }

      const { primaryId: payHistPrimaryId, relatedIds: payHistRelatedIds } = await resolveOverflowIds(student);
      const { summary: paySummary, overflow: payOverflow, payments } = await getStudentOverflowInfo(payHistPrimaryId, payHistRelatedIds);
      if (payments.length > 0) {
        await replyFlex(replyToken, '繳費紀錄', paymentPeriodSelector(student.name, payments, payHistPrimaryId, paySummary.remainingHours, payOverflow.hasOverflow), studentQuickReply(student.paymentType));
      } else {
        await replyFlex(replyToken, '繳費紀錄', paymentHistoryCard(student.name, payments, paySummary), studentQuickReply(student.paymentType));
      }
      return;
    }

    case KEYWORD.UPCOMING_CLASSES: {
      const student = await findStudentByLineId(lineUserId);
      if (!student) {
        const qr = studentQuickReply();
        await replyMessages(replyToken, [
          { type: 'text', text: TEXT.UNKNOWN_USER, quickReply: { items: qr } },
        ]);
        return;
      }
      const allIds = getAllStudentIds(student);
      // 收集本人 + 關聯學員名稱，用於比對行事曆
      const relatedNames: string[] = [];
      if (student.relatedStudentIds?.length) {
        const related = await Promise.all(student.relatedStudentIds.map(id => getStudentById(id)));
        related.forEach(s => { if (s) relatedNames.push(s.name); });
      }
      const allNames = [student.name, ...relatedNames];

      const today = todayDateString();
      const twoMonthsLater = addDays(today, 60);
      const [events, checkins] = await Promise.all([
        getEventsForDateRange(today, twoMonthsLater),
        allIds.length > 1 ? getCheckinsByStudents(allIds) : getCheckinsByStudent(student.id),
      ]);
      const checkedDates = new Set(checkins.map(c => c.classDate));
      const upcoming = events
        .filter(e => allNames.includes(e.summary.trim()))
        .filter(e => !checkedDates.has(e.date))
        .slice(0, 2);
      await replyFlex(replyToken, '近期預約', studentScheduleCard(student.name, upcoming), studentQuickReply(student.paymentType));
      return;
    }

    case KEYWORD.MENU: {
      const student = await findStudentByLineId(lineUserId);
      const coach = student?.coachId ? await getCoachById(student.coachId) : null;
      await replyFlex(replyToken, '安傑力課程管理系統', studentMenu(name, coach?.lineUrl, student?.paymentType), studentQuickReply(student?.paymentType));
      return;
    }

    default:
      await replyText(replyToken, '如有任何課程問題、請假及調課需求，請直接聯繫教練，謝謝！');
  }
}

async function handleCoachMessage(
  replyToken: string,
  lineUserId: string,
  text: string,
  name: string
): Promise<void> {
  const qr = coachQuickReply();

  switch (text) {
    case KEYWORD.TODAY_SCHEDULE: {
      const today = todayDateString();
      const schedule = await getCoachScheduleForDate(lineUserId);
      if (!schedule) {
        await replyMessages(replyToken, [
          { type: 'text', text: '找不到教練資料。', quickReply: { items: qr } },
        ]);
        return;
      }
      const checkinCount = schedule.items.filter(i => i.isExactMatch).length;
      await replyFlex(replyToken, `每日課表（共 ${checkinCount} 堂）`, scheduleList(schedule.items, today), coachQuickReply());
      return;
    }


    case KEYWORD.ADD_STUDENT: {
      const msg = await startAddStudent(lineUserId);
      await replyText(replyToken, msg, coachQuickReply());
      return;
    }

    case KEYWORD.STUDENT_MGMT: {
      await replyMessages(replyToken, [
        { type: 'text', text: '請輸入學員姓名搜尋：', quickReply: { items: qr } },
      ]);
      return;
    }

    case KEYWORD.WEEKLY_STATS: {
      const wStats = await getCoachWeeklyStats(lineUserId);
      if (!wStats) {
        await replyMessages(replyToken, [
          { type: 'text', text: '找不到教練資料。', quickReply: { items: qr } },
        ]);
        return;
      }
      await replyFlex(replyToken, '每週統計', weeklyStatsCard(wStats), coachQuickReply());
      return;
    }

    case KEYWORD.ANNUAL_STATS: {
      const aStats = await getCoachAnnualStats(lineUserId);
      if (!aStats) {
        await replyMessages(replyToken, [
          { type: 'text', text: '找不到教練資料。', quickReply: { items: qr } },
        ]);
        return;
      }
      await replyFlex(replyToken, `${aStats.year} 年度統計`, annualStatsCard(aStats), coachQuickReply());
      return;
    }

    case KEYWORD.MONTHLY_REPORT: {
      await replyFlex(replyToken, '上課明細月報表 — 選擇月份', reportSelectorCard(name), qr);
      return;
    }

    case KEYWORD.MONTHLY_STATS: {
      const stats = await getCoachMonthlyStats(lineUserId);
      if (!stats) {
        await replyMessages(replyToken, [
          { type: 'text', text: '找不到教練資料。', quickReply: { items: qr } },
        ]);
        return;
      }
      await replyFlex(replyToken, `${stats.year}/${stats.month} 月度統計`, monthlyStatsCard(stats), coachQuickReply());
      return;
    }

    case KEYWORD.MENU: {
      await replyFlex(replyToken, '安傑力教練管理系統', coachMenu(name), coachQuickReply());
      return;
    }

    default: {
      // "上課明細月報表 YYYY-MM" — generate report for a specific month
      if (text.startsWith('上課明細月報表 ')) {
        const parts = text.split(' ');
        const match = parts[1]?.match(/^(\d{4})-(\d{2})$/);
        if (match) {
          const repYear = parseInt(match[1]);
          const repMonth = parseInt(match[2]);
          if (repMonth >= 1 && repMonth <= 12) {
            const coach = await findCoachByLineId(lineUserId);
            if (!coach) {
              await replyText(replyToken, '找不到教練資料。', qr);
              return;
            }
            const token = generateReportToken(coach.id, repYear, repMonth);
            const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || 'localhost:3000';
            const protocol = host.startsWith('localhost') ? 'http' : 'https';
            const reportUrl = `${protocol}://${host}/api/report?coach=${coach.id}&year=${repYear}&month=${repMonth}&token=${token}`;
            await replyText(replyToken, `✅ ${repYear}年${repMonth}月報表\n\n📄 點此查看（可列印）：\n${reportUrl}`, qr);
            return;
          }
        }
        await replyText(replyToken, '格式錯誤，請輸入「上課明細月報表 YYYY-MM」，例如：上課明細月報表 2026-01', qr);
        return;
      }

      // Check if input matches "name hours price" pattern for adding student
      const parsed = parseAddStudentInput(text);
      if (parsed) {
        await replyMessages(replyToken, [
          {
            type: 'flex',
            altText: '確認新增學員',
            contents: addStudentConfirmCard(parsed),
          },
        ]);
        return;
      }

      // Search students by name
      const coach = await findCoachByLineId(lineUserId);
      if (coach) {
        const allStudents = await getStudentsByCoachId(coach.id);
        const matched = allStudents.filter(
          (s) => s.name.includes(text) || text.includes(s.name)
        );
        if (matched.length > 0) {
          const currentMonth = todayDateString().slice(0, 7);
          const summaries = await pMap(matched, async (s) => {
            const { primaryId, relatedIds } = await resolveOverflowIds(s);
            const { summary } = await getStudentOverflowInfo(primaryId, relatedIds);
            let monthlyCheckinCount: number | undefined;
            let monthlyUnpaidCount: number | undefined;
            let historicalUnpaidCount: number | undefined;
            if (s.paymentType === '單堂') {
              const [checkins, payments] = await Promise.all([
                getCheckinsByStudent(s.id),
                getPaymentsByStudent(s.id),
              ]);
              const paidDates = new Set(
                payments.filter(p => p.isSessionPayment).map(p => p.actualDate)
              );
              const monthCheckins = checkins.filter(c => c.classDate.startsWith(currentMonth));
              monthlyCheckinCount = monthCheckins.length;
              monthlyUnpaidCount = monthCheckins.filter(c => !paidDates.has(c.classDate)).length;
              historicalUnpaidCount = checkins.filter(c => !c.classDate.startsWith(currentMonth) && !paidDates.has(c.classDate)).length;
            }
            return { summary, monthlyCheckinCount, monthlyUnpaidCount, historicalUnpaidCount };
          });
          const withSummary = matched.map((s, i) => ({
            ...s,
            summary: summaries[i].summary,
            monthlyCheckinCount: summaries[i].monthlyCheckinCount,
            monthlyUnpaidCount: summaries[i].monthlyUnpaidCount,
            historicalUnpaidCount: summaries[i].historicalUnpaidCount,
          }));
          const bubbles = studentMgmtList(withSummary);
          await replyMessages(replyToken, [
            {
              type: 'flex',
              altText: `搜尋結果（${matched.length} 位）`,
              contents: bubbles.length === 1
                ? bubbles[0]
                : { type: 'carousel', contents: bubbles.slice(0, 12) },
              quickReply: { items: coachQuickReply() },
            },
          ]);
          return;
        }
      }
      await replyFlex(replyToken, '安傑力教練管理系統', coachMenu(name), coachQuickReply());
    }
  }
}
