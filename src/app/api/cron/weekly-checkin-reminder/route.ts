/**
 * 每週打卡確認提醒 Cron Job
 *
 * 排程：每週一 09:00 台北時間（UTC 01:00）
 * 功能：檢查上週（一～日）是否有行事曆課程未打卡，若有則 Push 提醒教練
 */
import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron/auth';
import { getAllCoaches } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getEventsForDateRange } from '@/lib/google/calendar';
import { getCheckinsByCoach } from '@/lib/notion/checkins';
import { pushText } from '@/lib/line/push';
import { nowTaipei } from '@/lib/utils/date';
import { format, subDays } from 'date-fns';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = nowTaipei();
  // Cron 在週一執行：上週 = 上上週一(7天前) 到 上週日(昨天)
  const weekEnd = format(subDays(now, 1), 'yyyy-MM-dd');   // 上週日
  const weekStart = format(subDays(now, 7), 'yyyy-MM-dd'); // 上週一

  const coaches = await getAllCoaches();
  // 只推送給有 LINE 帳號的教練
  const activeCoaches = coaches.filter(c => c.lineUserId);

  const results: { coach: string; missing: number }[] = [];

  // 所有教練共用同一份行事曆查詢（依上課名稱分配）
  const allWeekEvents = await getEventsForDateRange(weekStart, weekEnd);

  for (const coach of activeCoaches) {
    const [students, allCheckins] = await Promise.all([
      getStudentsByCoachId(coach.id),
      getCheckinsByCoach(coach.id),
    ]);

    if (students.length === 0) continue;

    // 只保留本教練學員名稱的課程
    const studentNames = new Set(students.map(s => s.name));
    const weekEvents = allWeekEvents.filter(e => studentNames.has(e.summary.trim()));

    if (weekEvents.length === 0) continue;

    // 上週打卡紀錄（依 classDate 過濾）
    const weekCheckins = allCheckins.filter(
      c => c.classDate >= weekStart && c.classDate <= weekEnd
    );

    // 建立 checkin 查詢集合：`studentId:classDate`
    const checkinKey = new Set(weekCheckins.map(c => `${c.studentId}:${c.classDate}`));

    // 學員名稱 → 學員物件（含 relatedStudentIds）
    const studentByName = new Map(students.map(s => [s.name, s]));

    // 找出沒有打卡的課程
    interface MissingEntry { date: string; name: string; time: string }
    const missing: MissingEntry[] = [];
    const seen = new Set<string>(); // 避免同一 (name, date, time) 重複

    for (const evt of weekEvents) {
      const name = evt.summary.trim();
      const key = `${name}:${evt.date}:${evt.startTime}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const student = studentByName.get(name);
      if (!student) continue;

      // 主學員或任一關聯學員有打卡即視為已打卡
      const allIds = [student.id, ...(student.relatedStudentIds ?? [])];
      const hasCheckin = allIds.some(id => checkinKey.has(`${id}:${evt.date}`));
      if (!hasCheckin) {
        missing.push({ date: evt.date, name, time: `${evt.startTime}-${evt.endTime}` });
      }
    }

    if (missing.length === 0) {
      results.push({ coach: coach.name, missing: 0 });
      continue;
    }

    // 排序（依日期、時間）
    missing.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    const weekStartFmt = `${weekStart.slice(5, 7)}/${weekStart.slice(8, 10)}`;
    const weekEndFmt = `${weekEnd.slice(5, 7)}/${weekEnd.slice(8, 10)}`;
    const lines = missing.map(
      m => `• ${m.date.slice(5, 7)}/${m.date.slice(8, 10)} ${m.name} ${m.time}`
    );
    const msg = [
      `📋 本週打卡確認提醒`,
      ``,
      `以下課程尚未打卡（${weekStartFmt} - ${weekEndFmt}）：`,
      ...lines,
      ``,
      `請確認是否需要補打卡。`,
    ].join('\n');

    await pushText(coach.lineUserId, msg);
    results.push({ coach: coach.name, missing: missing.length });
  }

  return NextResponse.json({ ok: true, weekStart, weekEnd, results });
}
