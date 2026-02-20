import { getPaymentsByStudent } from './payments';
import { getCheckinsByStudent } from './checkins';
import type { StudentHoursSummary } from '@/types';

export async function getStudentHoursSummary(studentId: string): Promise<StudentHoursSummary> {
  const [payments, checkins] = await Promise.all([
    getPaymentsByStudent(studentId),
    getCheckinsByStudent(studentId),
  ]);

  const purchasedHours = payments.reduce((sum, p) => sum + p.purchasedHours, 0);
  const completedMinutes = checkins.reduce((sum, c) => sum + c.durationMinutes, 0);
  const completedHours = Math.round(completedMinutes / 60 * 10) / 10;
  const remainingHours = Math.round((purchasedHours - completedMinutes / 60) * 10) / 10;

  return { purchasedHours, completedHours, remainingHours };
}
