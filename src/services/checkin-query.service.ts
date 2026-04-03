import { findCoachByLineId } from '@/lib/notion/coaches';
import { getStudentsByCoachId } from '@/lib/notion/students';
import { getEventsForDateRange } from '@/lib/google/calendar';
import { getCheckinsByCoach } from '@/lib/notion/checkins';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TZ = 'Asia/Taipei';

export interface MissingCheckinEntry {
  date: string;
  name: string;
  time: string;
  studentId: string;
}

export async function getMissingCheckinsForMonth(
  lineUserId: string,
  year: number,
  month: number
): Promise<{ missing: MissingCheckinEntry[]; coachName: string; monthLabel: string } | null> {
  const coach = await findCoachByLineId(lineUserId);
  if (!coach) return null;

  // 1-indexed month
  const targetDate = new Date(year, month - 1, 1);
  const start = format(toZonedTime(startOfMonth(targetDate), TZ), 'yyyy-MM-dd');
  const end = format(toZonedTime(endOfMonth(targetDate), TZ), 'yyyy-MM-dd');

  const [students, allCheckins, allEvents] = await Promise.all([
    getStudentsByCoachId(coach.id),
    getCheckinsByCoach(coach.id),
    getEventsForDateRange(start, end),
  ]);

  if (students.length === 0) {
    return { missing: [], coachName: coach.name, monthLabel: `${year}年${month}月` };
  }

  // 只保留該教練學員名稱的課程，且確保日期在 requested month 內（避免 Google API 傳回過多或跨月事件）
  const studentNames = new Set(students.map(s => s.name));
  const monthEvents = allEvents.filter(e => 
    studentNames.has(e.summary.trim()) && 
    e.date >= start && 
    e.date <= end
  );

  // 該月打卡紀錄集合：`studentId:classDate`
  const checkinKey = new Set(
    allCheckins
      .filter(c => c.classDate >= start && c.classDate <= end)
      .map(c => `${c.studentId}:${c.classDate}`)
  );

  const studentByName = new Map(students.map(s => [s.name, s]));
  const missing: MissingCheckinEntry[] = [];
  const seen = new Set<string>();

  for (const evt of monthEvents) {
    const name = evt.summary.trim();
    const key = `${name}:${evt.date}:${evt.startTime}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const student = studentByName.get(name);
    if (!student) continue;

    if (!checkinKey.has(`${student.id}:${evt.date}`)) {
      missing.push({
        date: evt.date,
        name,
        time: `${evt.startTime}-${evt.endTime}`,
        studentId: student.id,
      });
    }
  }

  // 排序
  missing.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  return {
    missing,
    coachName: coach.name,
    monthLabel: `${year}年${month}月`,
  };
}
