// Notion 資料庫屬性名稱映射
// 對應使用者現有的 Notion 資料庫欄位

export const STUDENT_PROPS = {
  NAME: '姓名',
  LINE_USER_ID: 'LINE User ID',
  PHONE: '電話',
  COACH: '所屬教練',
  REMAINING_CLASSES: '剩餘堂數',
  FIXED_SLOT: '固定時段',
  STATUS: '狀態',
} as const;

export const COACH_PROPS = {
  NAME: '姓名',
  LINE_USER_ID: 'LINE User ID',
  STATUS: '狀態',
} as const;

export const CLASS_SLOT_PROPS = {
  TITLE: '標題',
  COACH: '教練資料庫',
  DATE: '日期',
  MAX_CAPACITY: '容量上限',
  CURRENT_COUNT: '已預約人數',
  STATUS: '狀態',
} as const;

export const RESERVATION_PROPS = {
  TITLE: '標題',
  STUDENT: '學員',
  CLASS_SLOT: '課程時段',
  STATUS: '狀態',
  CHECKIN_TIME: '簽到時間',
  BOOKING_TIME: '預約時間',
} as const;
