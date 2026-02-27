import { createHmac } from 'crypto';
import { getEnv } from '@/lib/config/env';

function getSecret(): string {
  return getEnv().LINE_CHANNEL_SECRET;
}

export function generateReportToken(coachId: string, year: number, month: number): string {
  const payload = `report:${coachId}:${year}:${month}`;
  return createHmac('sha256', getSecret()).update(payload).digest('hex').slice(0, 32);
}

export function verifyReportToken(coachId: string, year: number, month: number, token: string): boolean {
  const expected = generateReportToken(coachId, year, month);
  return token === expected;
}
