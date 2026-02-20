import type { WebhookEvent } from '@line/bot-sdk';
import { handleMessage } from './message.handler';
import { handlePostback } from './postback.handler';
import { handleFollow } from './follow.handler';

export async function handleEvent(event: WebhookEvent): Promise<void> {
  try {
    switch (event.type) {
      case 'message':
        await handleMessage(event);
        break;
      case 'postback':
        await handlePostback(event);
        break;
      case 'follow':
        await handleFollow(event);
        break;
      default:
        // Ignore other event types
        break;
    }
  } catch (error) {
    console.error(`Error handling ${event.type} event:`, error);
  }
}
