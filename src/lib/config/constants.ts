// 關鍵字指令
export const KEYWORD = {
  CHECKIN: '打卡',
  REMAINING: '剩餘堂數',
  TODAY_SCHEDULE: '今日課表',
  ADD_STUDENT: '新增學員',
  MONTHLY_STATS: '本月統計',
  COACH_CHECKIN: '幫學員打卡',
  MENU: '選單',
} as const;

// Postback action 前綴
export const ACTION = {
  COACH_CHECKIN: 'coach_checkin',
  ADD_STUDENT_CONFIRM: 'add_student_confirm',
} as const;

// 角色
export const ROLE = {
  STUDENT: 'student',
  COACH: 'coach',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];
