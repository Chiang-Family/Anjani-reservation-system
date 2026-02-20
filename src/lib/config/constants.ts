// 預約狀態
export const RESERVATION_STATUS = {
  RESERVED: '已預約',
  CHECKED_IN: '已報到',
  CANCELLED: '已取消',
  ON_LEAVE: '已請假',
} as const;

export type ReservationStatus =
  (typeof RESERVATION_STATUS)[keyof typeof RESERVATION_STATUS];

// Postback action 前綴
export const ACTION = {
  RESERVE: 'reserve',
  CANCEL: 'cancel',
  LEAVE: 'leave',
  CHECKIN: 'checkin',
  CONFIRM_CANCEL: 'confirm_cancel',
  CONFIRM_LEAVE: 'confirm_leave',
  VIEW_STUDENTS: 'view_students',
  COACH_CHECKIN: 'coach_checkin',
} as const;

// 關鍵字指令
export const KEYWORD = {
  RESERVE: '預約課程',
  MY_RESERVATIONS: '我的預約',
  CHECKIN: '報到',
  REMAINING: '剩餘堂數',
  TODAY_CLASSES: '今日課程',
  UPCOMING_CLASSES: '近期課程',
} as const;

// 角色
export const ROLE = {
  STUDENT: 'student',
  COACH: 'coach',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];
