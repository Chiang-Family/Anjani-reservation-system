import type { FollowEvent } from '@line/bot-sdk';
import { identifyUser } from '@/services/student.service';
import { replyText } from '@/lib/line/reply';
import { ROLE } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';

export async function handleFollow(event: FollowEvent): Promise<void> {
  const lineUserId = event.source.userId;
  if (!lineUserId || !event.replyToken) return;

  const user = await identifyUser(lineUserId);

  if (!user) {
    await replyText(event.replyToken, TEXT.WELCOME_NEW);
    return;
  }

  if (user.role === ROLE.STUDENT) {
    await replyText(event.replyToken, TEXT.WELCOME_STUDENT(user.name));
  } else {
    await replyText(event.replyToken, TEXT.WELCOME_COACH(user.name));
  }
}
