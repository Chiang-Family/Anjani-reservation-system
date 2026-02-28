/**
 * 每月報表提醒 Cron Job
 *
 * 排程：每月 1 號 08:00 台北時間（UTC 00:00）
 * 功能：推送上月報表連結給所有教練，提醒列印留存
 */
import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron/auth';
import { getAllCoaches } from '@/lib/notion/coaches';
import { pushText } from '@/lib/line/push';
import { generateReportToken } from '@/lib/utils/report-token';
import { nowTaipei } from '@/lib/utils/date';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = nowTaipei();
  // 上個月：1 月 → 上一年 12 月
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();

  const coaches = await getAllCoaches();
  const activeCoaches = coaches.filter(c => c.lineUserId);

  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';

  const results: { coach: string; ok: boolean; error?: string }[] = [];

  for (const coach of activeCoaches) {
    try {
      const token = generateReportToken(coach.id, year, month);
      const reportUrl = `${protocol}://${host}/api/report?coach=${coach.id}&year=${year}&month=${month}&token=${token}`;

      await pushText(
        coach.lineUserId,
        `📋 上月報表提醒\n\n${coach.name} 教練，${year}年${month}月的上課明細報表已完成。\n⚠️ 強烈建議列印留存備份 ⚠️\n若有錯誤請聯繫Winnie。\n\n📄 點此查看報表：\n${reportUrl}`,
      );

      results.push({ coach: coach.name, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Monthly report reminder failed for ${coach.name}:`, msg);
      results.push({ coach: coach.name, ok: false, error: msg });
    }
  }

  return NextResponse.json({ ok: true, year, month, results });
}
