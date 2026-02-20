import type { ReservationStatus, Role } from '@/lib/config/constants';

export interface Student {
  id: string; // Notion page ID
  name: string;
  lineUserId: string;
  remainingClasses: number;
  phone?: string;
  status?: string;
  coachId?: string;
}

export interface Coach {
  id: string; // Notion page ID
  name: string;
  lineUserId: string;
  status?: string;
}

export interface ClassSlot {
  id: string; // Notion page ID
  title: string;
  coachId: string;
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm（從 Notion date start 提取）
  endTime: string; // HH:mm（從 Notion date end 提取）
  maxCapacity: number;
  currentCount: number;
  status?: string;
  coachName?: string;
}

export interface Reservation {
  id: string; // Notion page ID
  studentId: string;
  classSlotId: string;
  status: ReservationStatus;
  checkinTime?: string;
  bookingTime?: string;
  // 以下欄位透過查詢關聯資料填入
  classSlotTitle?: string;
  studentName?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
}

export interface UserIdentity {
  lineUserId: string;
  role: Role;
  name: string;
  notionId: string;
}
