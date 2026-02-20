import type { Role } from '@/lib/config/constants';

export interface Student {
  id: string;
  name: string;
  lineUserId: string;
  coachId?: string;
  purchasedClasses: number;
  pricePerClass: number;
  completedClasses: number;
  isPaid: boolean;
  status?: string;
}

export interface Coach {
  id: string;
  name: string;
  lineUserId: string;
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
  classDate: string;
  classTimeSlot: string;
  studentName?: string;
  studentChecked: boolean;
  coachChecked: boolean;
  studentCheckinTime?: string;
  coachCheckinTime?: string;
}

export interface UserIdentity {
  lineUserId: string;
  role: Role;
  name: string;
  notionId: string;
}
