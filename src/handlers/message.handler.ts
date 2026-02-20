import type { MessageEvent, TextEventMessage } from '@line/bot-sdk';
import { identifyUser, getStudentInfo } from '@/services/student.service';
import { studentCheckin } from '@/services/checkin.service';
import { getCoachTodaySchedule } from '@/services/coach.service';
import { getCoachMonthlyStats } from '@/services/stats.service';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { findCoachByLineId } from '@/lib/notion/coaches';
import {
  startAddStudent,
  handleAddStudentStep,
  getAddStudentState,
  getEditStudentState,
  handleEditStudentStep,
  handleBinding,
  getBindingState,
  startBinding,
} from '@/services/student-management.service';
import { replyText, replyFlex, replyFlexCarousel, replyMessages } from '@/lib/line/reply';
import { KEYWORD, ROLE } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { studentInfoCard } from '@/templates/flex/student-info';
import { studentMenu, coachMenu } from '@/templates/flex/main-menu';
import { todayScheduleList } from '@/templates/flex/today-schedule';
import { monthlyStatsCard } from '@/templates/flex/monthly-stats';
import { studentMgmtList } from '@/templates/flex/student-mgmt-list';
import { emptyStateBubble } from '@/templates/flex/empty-state';
import { studentQuickReply, coachQuickReply } from '@/templates/quick-reply';

export async function handleMessage(event: MessageEvent): Promise<void> {
  if (event.message.type !== 'text') return;

  const lineUserId = event.source.userId;
  if (!lineUserId || !event.replyToken) return;

  const text = (event.message as TextEventMessage).text.trim();
  const user = await identifyUser(lineUserId);

  // Check if coach is in a multi-step flow (add student or edit student)
  if (user?.role === ROLE.COACH) {
    const editState = getEditStudentState(lineUserId);
    if (editState) {
      try {
        const result = await handleEditStudentStep(lineUserId, text);
        const qr = coachQuickReply();
        await replyMessages(event.replyToken, [
          { type: 'text', text: result.message, quickReply: result.done ? { items: qr } : undefined },
        ]);
      } catch (error) {
        console.error('Edit student step error:', error);
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
  const qr = studentQuickReply();

  switch (text) {
    case KEYWORD.CHECKIN: {
      const result = await studentCheckin(lineUserId);
      await replyMessages(replyToken, [
        { type: 'text', text: result.message, quickReply: { items: qr } },
      ]);
      return;
    }

    case KEYWORD.REMAINING: {
      const student = await getStudentInfo(lineUserId);
      if (!student) {
        await replyMessages(replyToken, [
          { type: 'text', text: TEXT.UNKNOWN_USER, quickReply: { items: qr } },
        ]);
        return;
      }
      await replyFlex(replyToken, `${student.name} 學員資訊`, studentInfoCard(student));
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
      const schedule = await getCoachTodaySchedule(lineUserId);
      if (!schedule || schedule.items.length === 0) {
        await replyFlex(replyToken, '今日沒有排定的課程', emptyStateBubble(
          '今日沒有排定的課程',
          '今天沒有安排課程。',
          { label: '回到選單', text: KEYWORD.MENU }
        ));
        return;
      }
      await replyFlex(replyToken, `今日課表（共 ${schedule.items.length} 堂）`, todayScheduleList(schedule.items));
      return;
    }

    case KEYWORD.COACH_CHECKIN: {
      const schedule = await getCoachTodaySchedule(lineUserId);
      if (!schedule || schedule.items.length === 0) {
        await replyMessages(replyToken, [
          { type: 'text', text: '今天沒有安排課程，無法幫學員打卡。', quickReply: { items: qr } },
        ]);
        return;
      }
      const unchecked = schedule.items.filter((item) => !item.coachChecked && item.studentNotionId);
      if (unchecked.length === 0) {
        await replyMessages(replyToken, [
          { type: 'text', text: '今天所有學員都已打卡完成！', quickReply: { items: qr } },
        ]);
        return;
      }
      await replyFlex(replyToken, '幫學員打卡', todayScheduleList(unchecked));
      return;
    }

    case KEYWORD.ADD_STUDENT: {
      const msg = await startAddStudent(lineUserId);
      await replyText(replyToken, msg);
      return;
    }

    case KEYWORD.STUDENT_MGMT: {
      const coach = await findCoachByLineId(lineUserId);
      if (!coach) {
        await replyMessages(replyToken, [
          { type: 'text', text: '找不到教練資料。', quickReply: { items: qr } },
        ]);
        return;
      }
      const students = await getStudentsByCoachId(coach.id);
      if (students.length === 0) {
        await replyFlex(replyToken, '沒有學員', emptyStateBubble(
          '目前沒有學員',
          '輸入「新增學員」可建立學員資料。',
          { label: '新增學員', text: KEYWORD.ADD_STUDENT }
        ));
        return;
      }
      const bubbles = studentMgmtList(students);
      await replyFlexCarousel(replyToken, `學員管理（共 ${students.length} 人）`, bubbles);
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
      await replyFlex(replyToken, 'Anjani 教練管理', coachMenu(name));
    }
  }
}
