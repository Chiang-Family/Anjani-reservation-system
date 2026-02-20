import { messagingApi } from '@line/bot-sdk';
import { getEnv } from '@/lib/config/env';

let _client: messagingApi.MessagingApiClient | null = null;

export function getLineClient(): messagingApi.MessagingApiClient {
  if (_client) return _client;
  _client = new messagingApi.MessagingApiClient({
    channelAccessToken: getEnv().LINE_CHANNEL_ACCESS_TOKEN,
  });
  return _client;
}
