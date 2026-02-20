import { Client } from '@notionhq/client';
import { getEnv } from '@/lib/config/env';

let _client: Client | null = null;

export function getNotionClient(): Client {
  if (_client) return _client;
  _client = new Client({ auth: getEnv().NOTION_API_KEY });
  return _client;
}
