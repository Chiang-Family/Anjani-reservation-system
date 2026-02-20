import { findStudentByLineId, getStudentById, updateRemainingClasses } from '@/lib/notion/students';
import { findCoachByLineId } from '@/lib/notion/coaches';
import { ROLE } from '@/lib/config/constants';
import type { UserIdentity } from '@/types';

export async function identifyUser(lineUserId: string): Promise<UserIdentity | null> {
  // Check student first, then coach
  const student = await findStudentByLineId(lineUserId);
  if (student) {
    return {
      lineUserId,
      role: ROLE.STUDENT,
      name: student.name,
      notionId: student.id,
    };
  }

  const coach = await findCoachByLineId(lineUserId);
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

export async function rechargeStudent(
  studentId: string,
  amount: number
): Promise<{ success: boolean; message: string }> {
  const student = await getStudentById(studentId);
  if (!student) {
    return { success: false, message: '找不到該學員資料。' };
  }

  const oldCount = student.remainingClasses;
  const newCount = oldCount + amount;
  await updateRemainingClasses(studentId, newCount);

  return {
    success: true,
    message: `${student.name} 堂數已更新：${oldCount} → ${newCount} 堂`,
  };
}
