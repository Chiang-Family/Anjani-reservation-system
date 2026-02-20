import type { MessageEvent, TextEventMessage } from '@line/bot-sdk';
import type { messagingApi } from '@line/bot-sdk';
import { identifyUser } from '@/services/student.service';
import { getStudentInfo } from '@/services/student.service';
import { listAvailableSlots, getMyReservations } from '@/services/reservation.service';
import { studentCheckin, getTodayReservations } from '@/services/checkin.service';
import { getCoachTodayClasses, getCoachUpcomingClasses } from '@/services/coach.service';
import { getAllStudents } from '@/lib/notion/students';
import { replyText, replyFlex, replyFlexCarousel, replyMessages } from '@/lib/line/reply';
import { KEYWORD, ROLE, ACTION } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { classSlotList } from '@/templates/flex/class-slot-list';
import { reservationList } from '@/templates/flex/reservation-list';
import { studentInfoCard } from '@/templates/flex/student-info';
import { coachScheduleList } from '@/templates/flex/coach-schedule';
import { rechargeStudentList } from '@/templates/flex/recharge-student-list';
import { studentMenu, coachMenu } from '@/templates/flex/main-menu';
import { createSlotStart } from '@/templates/flex/create-slot-start';
import { studentQuickReply, coachQuickReply } from '@/templates/quick-reply';

export async function handleMessage(event: MessageEvent): Promise<void> {
  if (event.message.type !== 'text') return;

  const lineUserId = event.source.userId;
  if (!lineUserId || !event.replyToken) return;

  const text = (event.message as TextEventMessage).text.trim();
  const user = await identifyUser(lineUserId);

  if (!user) {
    console.log(`[未識別使用者] LINE User ID: ${lineUserId}`);
    await replyText(event.replyToken, `${TEXT.UNKNOWN_USER}\n\n您的 LINE User ID:\n${lineUserId}`);
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
    case KEYWORD.RESERVE: {
      const slots = await listAvailableSlots();
      if (slots.length === 0) {
        await replyMessages(replyToken, [
          { type: 'text', text: TEXT.NO_AVAILABLE_SLOTS, quickReply: { items: qr } },
        ]);
        return;
      }
      const container = classSlotList(slots);
      await replyFlex(replyToken, '可預約課程', container);
      return;
    }

    case KEYWORD.MY_RESERVATIONS: {
      const reservations = await getMyReservations(lineUserId);
      if (reservations.length === 0) {
        await replyMessages(replyToken, [
          { type: 'text', text: TEXT.NO_RESERVATIONS, quickReply: { items: qr } },
        ]);
        return;
      }
      const container = reservationList(reservations);
      await replyFlex(replyToken, '我的預約', container);
      return;
    }

    case KEYWORD.CHECKIN: {
      const result = await studentCheckin(lineUserId);
      if (result.message === 'MULTIPLE_RESERVATIONS') {
        const todayRes = await getTodayReservations(lineUserId);
        const bubbles: messagingApi.FlexBubble[] = todayRes.map((r) => ({
          type: 'bubble' as const,
          size: 'kilo' as const,
          body: {
            type: 'box' as const,
            layout: 'vertical' as const,
            contents: [
              {
                type: 'text' as const,
                text: r.classSlotTitle || '課程',
                weight: 'bold' as const,
                size: 'md' as const,
              },
              {
                type: 'text' as const,
                text: r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : '',
                size: 'sm' as const,
                color: '#555555',
                margin: 'sm' as const,
              },
            ] as messagingApi.FlexComponent[],
            paddingAll: '16px',
          },
          footer: {
            type: 'box' as const,
            layout: 'vertical' as const,
            contents: [
              {
                type: 'button' as const,
                action: {
                  type: 'postback' as const,
                  label: '報到',
                  data: `${ACTION.CHECKIN}:${r.id}`,
                  displayText: `報到 ${r.classSlotTitle || '課程'}`,
                },
                style: 'primary' as const,
                color: '#27ae60',
              },
            ] as messagingApi.FlexComponent[],
            paddingAll: '16px',
          },
        }));

        await replyFlexCarousel(replyToken, '選擇報到課程', bubbles);
        return;
      }
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
      await replyFlex(replyToken, '學員資訊', studentInfoCard(student));
      return;
    }

    case KEYWORD.MENU: {
      await replyFlex(replyToken, 'Anjani 預約系統', studentMenu(name));
      return;
    }

    default: {
      await replyFlex(replyToken, 'Anjani 預約系統', studentMenu(name));
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
    case KEYWORD.TODAY_CLASSES: {
      const slots = await getCoachTodayClasses(lineUserId);
      if (slots.length === 0) {
        await replyMessages(replyToken, [
          { type: 'text', text: TEXT.NO_TODAY_CLASSES, quickReply: { items: qr } },
        ]);
        return;
      }
      const container = coachScheduleList(slots);
      await replyFlex(replyToken, '今日課程', container);
      return;
    }

    case KEYWORD.UPCOMING_CLASSES: {
      const slots = await getCoachUpcomingClasses(lineUserId);
      if (slots.length === 0) {
        await replyMessages(replyToken, [
          { type: 'text', text: TEXT.NO_UPCOMING_CLASSES, quickReply: { items: qr } },
        ]);
        return;
      }
      const container = coachScheduleList(slots);
      await replyFlex(replyToken, '近期課程', container);
      return;
    }

    case KEYWORD.RECHARGE: {
      const students = await getAllStudents();
      if (students.length === 0) {
        await replyMessages(replyToken, [
          { type: 'text', text: TEXT.NO_STUDENTS, quickReply: { items: qr } },
        ]);
        return;
      }
      const bubbles = rechargeStudentList(students);
      await replyFlexCarousel(replyToken, '選擇充值學員', bubbles);
      return;
    }

    case KEYWORD.CREATE_SLOT: {
      await replyFlex(replyToken, '新增課程', createSlotStart());
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
