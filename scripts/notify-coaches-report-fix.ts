/**
 * 一次性腳本：通知教練月報表堂次已更正，附上 2026年2月報表連結
 * npx tsx --env-file=.env.local scripts/notify-coaches-report-fix.ts
 */
import { getAllCoaches } from '../src/lib/notion/coaches';
import { pushText } from '../src/lib/line/push';
import { generateReportToken } from '../src/lib/utils/report-token';

const YEAR = 2026;
const MONTH = 2;

async function main() {
  const coaches = await getAllCoaches();
  const activeCoaches = coaches.filter(c => c.lineUserId);

  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';

  for (const coach of activeCoaches) {
    try {
      const token = generateReportToken(coach.id, YEAR, MONTH);
      const reportUrl = `${protocol}://${host}/api/report?coach=${coach.id}&year=${YEAR}&month=${MONTH}&token=${token}`;

      await pushText(
        coach.lineUserId,
        `📋 月報表更正通知\n\n上課明細中的「堂次」欄位已更正，現在正確顯示每堂課在當期的堂次編號。\n\n📄 ${YEAR}年${MONTH}月報表（更正版）：\n${reportUrl}`,
      );

      console.log(`✅ ${coach.name} — 已發送`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ ${coach.name} — 失敗: ${msg}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
