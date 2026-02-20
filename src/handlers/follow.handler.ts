import type { FollowEvent } from '@line/bot-sdk';
import { identifyUser } from '@/services/student.service';
import { replyText, replyFlex } from '@/lib/line/reply';
import { ROLE } from '@/lib/config/constants';
import { TEXT } from '@/templates/text-messages';
import { studentMenu, coachMenu } from '@/templates/flex/main-menu';

export async function handleFollow(event: FollowEvent): Promise<void> {
  const lineUserId = event.source.userId;
  if (!lineUserId || !event.replyToken) return;

  const user = await identifyUser(lineUserId);

  if (!user) {
    await replyText(event.replyToken, TEXT.WELCOME_NEW);
    return;
  }

  if (user.role === ROLE.STUDENT) {
    await replyFlex(event.replyToken, 'Anjani 預約系統', studentMenu(user.name));
  } else {
    await replyFlex(event.replyToken, 'Anjani 教練管理', coachMenu(user.name));
  }
}
