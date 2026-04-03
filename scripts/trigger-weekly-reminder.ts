/**
 * 手動觸發每週打卡提醒（本地執行）
 * npx tsx --env-file=.env.local scripts/trigger-weekly-reminder.ts
 */
import { getAllCoaches } from '../src/lib/notion/coaches';
import { getStudentsByCoachId } from '../src/lib/notion/students';
import { getEventsForDateRange } from '../src/lib/google/calendar';
import { getCheckinsByCoach } from '../src/lib/notion/checkins';
import { pushFlex } from '../src/lib/line/push';
import { checkinReminderCard } from '../src/templates/flex/checkin-reminder';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

async function main() {
  const now = toZonedTime(new Date(), 'Asia/Taipei');
  const weekEnd = format(now, 'yyyy-MM-dd');
  const weekStart = format(subDays(now, 6), 'yyyy-MM-dd');

  console.log(`週範圍: ${weekStart} ~ ${weekEnd}\n`);

  const coaches = await getAllCoaches();
  const activeCoaches = coaches.filter(c => c.lineUserId);
  const allWeekEvents = await getEventsForDateRange(weekStart, weekEnd);

  console.log(`行事曆事件: ${allWeekEvents.length} 筆\n`);

  for (const coach of activeCoaches) {
    try {
      const [students, allCheckins] = await Promise.all([
        getStudentsByCoachId(coach.id),
        getCheckinsByCoach(coach.id),
      ]);

      const studentNames = new Set(students.map(s => s.name));
      const weekEvents = allWeekEvents.filter(e => studentNames.has(e.summary.trim()));

      if (weekEvents.length === 0) {
        console.log(`【${coach.name}】無課程事件`);
        continue;
      }

      const weekCheckins = allCheckins.filter(
        c => c.classDate >= weekStart && c.classDate <= weekEnd
      );
      const checkinKey = new Set(weekCheckins.map(c => `${c.studentId}:${c.classDate}`));
      const studentByName = new Map(students.map(s => [s.name, s]));

      interface MissingEntry { date: string; name: string; time: string }
      const missing: MissingEntry[] = [];
      const seen = new Set<string>();

      for (const evt of weekEvents) {
        const name = evt.summary.trim();
        const key = `${name}:${evt.date}:${evt.startTime}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const student = studentByName.get(name);
        if (!student) continue;

        const hasCheckin = checkinKey.has(`${student.id}:${evt.date}`);
        if (!hasCheckin) {
          missing.push({ date: evt.date, name, time: `${evt.startTime}-${evt.endTime}` });
        }
      }

      if (missing.length === 0) {
        console.log(`【${coach.name}】全部已打卡 ✅`);
        continue;
      }

      missing.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

      console.log(`【${coach.name}】未打卡 ${missing.length} 筆:`);
      for (const m of missing) {
        console.log(`  ${m.date} ${m.time} ${m.name}`);
      }

      const card = checkinReminderCard(weekStart, weekEnd, missing);
      await pushFlex(coach.lineUserId, '本週打卡確認提醒', card);
      console.log(`  → 已推送提醒\n`);
    } catch (err) {
      console.error(`【${coach.name}】錯誤:`, err instanceof Error ? err.message : err);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
