import { getEnv } from '@/lib/config/env';

export function verifyCronSecret(req: Request): boolean {
  const env = getEnv();
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;

  return authHeader === `Bearer ${cronSecret}`;
}
