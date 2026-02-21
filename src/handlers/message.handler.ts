import type { MessageEvent, TextEventMessage } from '@line/bot-sdk';
import { identifyUser, getStudentInfo } from '@/services/student.service';
import { getCoachScheduleForDate } from '@/services/coach.service';
import { getCoachMonthlyStats } from '@/services/stats.service';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { findCoachByLineId } from '@/lib/notion/coaches';
import { findStudentByLineId } from '@/lib/notion/students';
import { getCheckinsByStudent } from '@/lib/notion/checkins';
import { getStudentHoursSummary } from '@/lib/notion/hours';
import { getPaymentsByStudent } from '@/lib/notion/payments';
import {
  startAddStudent,
  handleAddStudentStep,
  getAddStudentState,
  getCollectAndAddState,
  handleCollectAndAddStep,
  handleBinding,
  getBindingState,
  startBinding,
} from '@/services/student-management.service';
import { replyText, replyFlex, replyMessages } from '@/lib/line/reply';
import { pMap } from '@/lib/utils/concurrency';
import { KEYWORD, ROLE } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { studentInfoCard } from '@/templates/flex/student-info';
import { paymentHistoryCard } from '@/templates/flex/payment-history';
import { studentMenu, coachMenu } from '@/templates/flex/main-menu';
import { scheduleList } from '@/templates/flex/today-schedule';
import { todayDateString } from '@/lib/utils/date';
import { monthlyStatsCard } from '@/templates/flex/monthly-stats';
import { studentMgmtList } from '@/templates/flex/student-mgmt-list';
import { classHistoryCard } from '@/templates/flex/class-history';
import { studentQuickReply, coachQuickReply } from '@/templates/quick-reply';

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
        const qr = coachQuickReply();
        await replyMessages(event.replyToken, [
          { type: 'text', text: result.message, quickReply: result.done ? { items: qr } : undefined },
        ]);
      } catch (error) {
        console.error('Collect and add step error:', error);
        await replyText(event.replyToken, TEXT.ERROR);
      }
      return;
    }

    const addState = getAddStudentState(lineUserId);
    if (addState) {
      try {
        const result = await handleAddStudentStep(lineUserId, text);
        const qr = coachQuickReply();
        await replyMessages(event.replyToken, [
          { type: 'text', text: result.message, quickReply: result.done ? { items: qr } : undefined },
        ]);
      } catch (error) {
        console.error('Add student step error:', error);
        await replyText(event.replyToken, TEXT.ERROR);
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
            await replyFlex(event.replyToken, 'Anjani 健身管理', studentMenu(student.name));
            return;
          }
          const coach = await findCoachByLineId(lineUserId);
          if (coach) {
            await replyFlex(event.replyToken, 'Anjani 教練管理', coachMenu(coach.name));
            return;
          }
        }
        await replyText(event.replyToken, result.message);
      } catch (error) {
        console.error('Binding error:', error);
        await replyText(event.replyToken, TEXT.ERROR);
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
    await replyText(event.replyToken, TEXT.ERROR);
  }
}

async function handleStudentMessage(
  replyToken: string,
  lineUserId: string,
  text: string,
  name: string
): Promise<void> {
  switch (text) {
    case KEYWORD.CLASS_HISTORY: {
      const student = await findStudentByLineId(lineUserId);
      if (!student) {
        const qr = studentQuickReply();
        await replyMessages(replyToken, [
          { type: 'text', text: TEXT.UNKNOWN_USER, quickReply: { items: qr } },
        ]);
        return;
      }
      const [records, summary] = await Promise.all([
        getCheckinsByStudent(student.id),
        getStudentHoursSummary(student.id),
      ]);
      await replyFlex(replyToken, '上課紀錄', classHistoryCard(student.name, records, summary.remainingHours));
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
      const [payments, summary] = await Promise.all([
        getPaymentsByStudent(student.id),
        getStudentHoursSummary(student.id),
      ]);
      await replyFlex(replyToken, '繳費紀錄', paymentHistoryCard(student.name, payments, summary));
      return;
    }

    case KEYWORD.MENU: {
      await replyFlex(replyToken, 'Anjani 健身管理', studentMenu(name));
      return;
    }

    default: {
      await replyFlex(replyToken, 'Anjani 健身管理', studentMenu(name));
    }
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
      const checkinCount = schedule.items.filter(i => i.studentNotionId).length;
      await replyFlex(replyToken, `每日課表（共 ${checkinCount} 堂）`, scheduleList(schedule.items, today));
      return;
    }


    case KEYWORD.ADD_STUDENT: {
      const msg = await startAddStudent(lineUserId);
      await replyText(replyToken, msg);
      return;
    }

    case KEYWORD.STUDENT_MGMT: {
      await replyMessages(replyToken, [
        { type: 'text', text: '請輸入學員姓名搜尋：', quickReply: { items: qr } },
      ]);
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
      await replyFlex(replyToken, `${stats.year}/${stats.month} 月度統計`, monthlyStatsCard(stats));
      return;
    }

    case KEYWORD.MENU: {
      await replyFlex(replyToken, 'Anjani 教練管理', coachMenu(name));
      return;
    }

    default: {
      // Search students by name
      const coach = await findCoachByLineId(lineUserId);
      if (coach) {
        const allStudents = await getStudentsByCoachId(coach.id);
        const matched = allStudents.filter(
          (s) => s.name.includes(text) || text.includes(s.name)
        );
        if (matched.length > 0) {
          const summaries = await pMap(matched, s => getStudentHoursSummary(s.id));
          const withSummary = matched.map((s, i) => ({ ...s, summary: summaries[i] }));
          const bubbles = studentMgmtList(withSummary);
          await replyMessages(replyToken, [
            {
              type: 'flex',
              altText: `搜尋結果（${matched.length} 位）`,
              contents: bubbles.length === 1
                ? bubbles[0]
                : { type: 'carousel', contents: bubbles.slice(0, 12) },
            },
          ]);
          return;
        }
      }
      await replyFlex(replyToken, 'Anjani 教練管理', coachMenu(name));
    }
  }
}
