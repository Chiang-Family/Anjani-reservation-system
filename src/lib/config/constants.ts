// 關鍵字指令
export const KEYWORD = {
  CLASS_HISTORY: '上課紀錄',
  REMAINING: '剩餘時數',
  TODAY_SCHEDULE: '今日課表',
  ADD_STUDENT: '新增學員',
  STUDENT_MGMT: '學員管理',
  MONTHLY_STATS: '本月統計',
  COACH_CHECKIN: '幫學員打卡',
  MENU: '選單',
} as const;

// Postback action 前綴
export const ACTION = {
  COACH_CHECKIN: 'coach_checkin',
  VIEW_SCHEDULE: 'view_schedule',
  ADD_STUDENT_CONFIRM: 'add_student_confirm',
  COLLECT_AND_ADD: 'collect_add',
  VIEW_STUDENT_HISTORY: 'view_history',
} as const;

// 角色
export const ROLE = {
  STUDENT: 'student',
  COACH: 'coach',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];
