/**
 * 測試：傳送月報表提醒給 Winnie 教練
 * npx tsx --env-file=.env.local scripts/test-report-reminder.ts
 */
import { findCoachByName } from '../src/lib/notion/coaches';
import { pushText } from '../src/lib/line/push';
import { generateReportToken } from '../src/lib/utils/report-token';

async function main() {
  const coach = await findCoachByName('Winnie');
  if (!coach || !coach.lineUserId) {
    console.error('找不到 Winnie 或無 LINE ID');
    process.exit(1);
  }

  const year = 2026;
  const month = 2;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || 'anjani-reservation-system.vercel.app';
  const protocol = 'https';
  const token = generateReportToken(coach.id, year, month);
  const reportUrl = `${protocol}://${host}/api/report?coach=${coach.id}&year=${year}&month=${month}&token=${token}`;

  await pushText(
    coach.lineUserId,
    `📋 上月報表提醒\n\n${coach.name} 教練，${year}年${month}月的上課明細報表已完成。\n\n⚠️ 強烈建議列印留存備份 ⚠️\n\n若有錯誤請聯繫Winnie。\n\n📄 點此查看報表：\n${reportUrl}`,
  );

  console.log('已傳送測試訊息給 Winnie');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
