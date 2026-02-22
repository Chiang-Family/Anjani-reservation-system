import type { Role } from '@/lib/config/constants';

export interface Student {
  id: string;
  name: string;
  lineUserId: string;
  coachId?: string;
  status?: string;
  paymentType?: '單堂' | '套時數';
  perSessionFee?: number;
}

export interface PaymentRecord {
  id: string;
  studentId: string;
  coachId: string;
  studentName: string;
  purchasedHours: number;
  pricePerHour: number;
  totalAmount: number;
  paidAmount: number;
  status: '已繳費' | '部分繳費' | '未繳費';
  createdAt: string;
  actualDate: string;
}

export interface Coach {
  id: string;
  name: string;
  lineUserId: string;
  lineUrl?: string;
  calendarColorId?: number;
  status?: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  colorId?: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface CheckinRecord {
  id: string;
  studentId: string;
  coachId: string;
  checkinTime: string;
  classDate: string;
  classTimeSlot: string;
  durationMinutes: number;
  studentName?: string;
}

export interface StudentHoursSummary {
  purchasedHours: number;
  completedHours: number;
  remainingHours: number;
}

export interface OverflowInfo {
  hasOverflow: boolean;
  overflowBoundaryDate: string | null;
  paidCheckins: CheckinRecord[];
  unpaidCheckins: CheckinRecord[];
}

export interface UserIdentity {
  lineUserId: string;
  role: Role;
  name: string;
  notionId: string;
}
