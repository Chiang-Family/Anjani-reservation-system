import crypto from 'crypto';
import { getEnv } from '@/lib/config/env';

export function validateSignature(body: string, signature: string): boolean {
  const channelSecret = getEnv().LINE_CHANNEL_SECRET;
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');
  return hash === signature;
}
