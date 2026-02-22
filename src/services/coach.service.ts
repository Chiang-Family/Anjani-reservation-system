import { findCoachByLineId } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getCheckinsByDate } from '@/lib/notion/checkins';
import { getPaymentsByDate } from '@/lib/notion/payments';
import { getTodayEvents, getEventsForDate } from '@/lib/google/calendar';
import { todayDateString } from '@/lib/utils/date';
import type { CalendarEvent } from '@/types';

export interface ScheduleItem {
  event: CalendarEvent;
  studentName: string;
  studentNotionId?: string;
  isCheckedIn: boolean;
  isExactMatch: boolean;
  isPerSession: boolean;
  perSessionFee?: number;
  isPaidForSession: boolean;
}

export async function getCoachScheduleForDate(
  lineUserId: string,
  dateStr?: string
): Promise<{ items: ScheduleItem[]; coachName: string; date: string } | null> {
  const coach = await findCoachByLineId(lineUserId);
  if (!coach) return null;

  const targetDate = dateStr || todayDateString();

  // 並行取得：學員名單、行事曆事件、當日打卡紀錄、當日繳費紀錄（4 個 API 呼叫）
  const [students, calendarEvents, checkins, payments] = await Promise.all([
    getStudentsByCoachId(coach.id),
    dateStr ? getEventsForDate(dateStr) : getTodayEvents(),
    getCheckinsByDate(targetDate),
    getPaymentsByDate(targetDate),
  ]);

  // 建立學員名稱→學員物件的查找表
  const studentByName = new Map(students.map(s => [s.name, s]));

  // 建立當日已打卡的學員 ID 集合
  const checkedInStudentIds = new Set(checkins.map(c => c.studentId));

  // 建立當日「單堂繳費」的學員 ID 集合（只認標題有 [單堂] 標記的紀錄）
  const sessionPaidStudentIds = new Set(
    payments.filter(p => p.isSessionPayment).map(p => p.studentId)
  );

  // 篩選該教練學員的事件，並在記憶體中比對打卡狀態
  const items: ScheduleItem[] = [];
  for (const event of calendarEvents) {
    const summary = event.summary.trim();

    // 精確比對 → 模糊比對
    let matched = studentByName.get(summary);
    let isExactMatch = !!matched;
    if (!matched) {
      for (const [name, student] of studentByName) {
        if (summary.includes(name) || name.includes(summary)) {
          matched = student;
          break;
        }
      }
    }
    if (!matched) continue;

    const isPerSession = matched.paymentType === '單堂';

    items.push({
      event,
      studentName: summary,
      studentNotionId: matched.id,
      isCheckedIn: checkedInStudentIds.has(matched.id),
      isExactMatch,
      isPerSession,
      perSessionFee: isPerSession ? matched.perSessionFee : undefined,
      isPaidForSession: isPerSession && sessionPaidStudentIds.has(matched.id),
    });
  }

  return { items, coachName: coach.name, date: targetDate };
}
