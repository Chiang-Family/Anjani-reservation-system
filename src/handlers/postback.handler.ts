import type { PostbackEvent } from '@line/bot-sdk';
import { coachCheckinForStudent } from '@/services/checkin.service';
import { replyMessages } from '@/lib/line/reply';
import { ACTION } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { menuQuickReply } from '@/templates/quick-reply';

function replyTextWithMenu(replyToken: string, text: string) {
  return replyMessages(replyToken, [
    { type: 'text', text, quickReply: { items: menuQuickReply() } },
  ]);
}

export async function handlePostback(event: PostbackEvent): Promise<void> {
  const lineUserId = event.source.userId;
  if (!lineUserId || !event.replyToken) return;

  const data = event.postback.data;
  const parts = data.split(':');
  const action = parts[0];
  const id = parts[1];

  try {
    switch (action) {
      case ACTION.COACH_CHECKIN: {
        const result = await coachCheckinForStudent(lineUserId, id);
        await replyTextWithMenu(event.replyToken, result.message);
        return;
      }

      default:
        await replyTextWithMenu(event.replyToken, TEXT.UNKNOWN_COMMAND);
    }
  } catch (error) {
    console.error('Postback handler error:', error);
    await replyTextWithMenu(event.replyToken, TEXT.ERROR);
  }
}
