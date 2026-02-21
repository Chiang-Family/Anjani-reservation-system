import { findStudentByLineId } from '@/lib/notion/students';
import { findCoachByLineId } from '@/lib/notion/coaches';
import { ROLE } from '@/lib/config/constants';
import type { UserIdentity } from '@/types';

export async function identifyUser(lineUserId: string): Promise<UserIdentity | null> {
  // Query student and coach in parallel for faster identification
  const [student, coach] = await Promise.all([
    findStudentByLineId(lineUserId),
    findCoachByLineId(lineUserId),
  ]);

  if (student) {
    return {
      lineUserId,
      role: ROLE.STUDENT,
      name: student.name,
      notionId: student.id,
    };
  }

  if (coach) {
    return {
      lineUserId,
      role: ROLE.COACH,
      name: coach.name,
      notionId: coach.id,
    };
  }

  return null;
}

export async function getStudentInfo(lineUserId: string) {
  return findStudentByLineId(lineUserId);
}
