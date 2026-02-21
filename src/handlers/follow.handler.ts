import type { FollowEvent } from '@line/bot-sdk';
import { identifyUser } from '@/services/student.service';
import { replyText, replyFlex } from '@/lib/line/reply';
import { linkRichMenuToUser } from '@/lib/line/rich-menu';
import { ROLE } from '@/lib/config/constants';
import { getEnv } from '@/lib/config/env';
import { TEXT } from '@/templates/text-messages';
import { studentMenu, coachMenu } from '@/templates/flex/main-menu';
import { startBinding } from '@/services/student-management.service';

export async function handleFollow(event: FollowEvent): Promise<void> {
  const lineUserId = event.source.userId;
  if (!lineUserId || !event.replyToken) return;

  const user = await identifyUser(lineUserId);

  if (!user) {
    // Start binding flow for new user
    startBinding(lineUserId);
    await replyText(event.replyToken, TEXT.WELCOME_NEW);
    return;
  }

  const env = getEnv();

  if (user.role === ROLE.STUDENT) {
    if (env.RICH_MENU_STUDENT_ID) {
      try {
        await linkRichMenuToUser(lineUserId, env.RICH_MENU_STUDENT_ID);
      } catch (err) {
        console.error('Failed to link student rich menu:', err);
      }
    }
    await replyFlex(event.replyToken, 'Anjani 健身管理', studentMenu(user.name));
  } else {
    if (env.RICH_MENU_COACH_ID) {
      try {
        await linkRichMenuToUser(lineUserId, env.RICH_MENU_COACH_ID);
      } catch (err) {
        console.error('Failed to link coach rich menu:', err);
      }
    }
    await replyFlex(event.replyToken, '安傑力教練管理系統', coachMenu(user.name));
  }
}
