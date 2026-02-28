/**
 * 測試 PDF 報表生成（本地）
 * npx tsx --env-file=.env.local scripts/test-pdf-report.ts
 */
import { generateReportToken } from '../src/lib/utils/report-token';
import { getAllCoaches } from '../src/lib/notion/coaches';

async function main() {
  const coaches = await getAllCoaches();

  const year = 2026;
  const month = 2;

  for (const coach of coaches) {
    const token = generateReportToken(coach.id, year, month);
    const url = `http://localhost:3000/api/report?coach=${coach.id}&year=${year}&month=${month}&token=${token}`;
    console.log(`【${coach.name}】${url}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
