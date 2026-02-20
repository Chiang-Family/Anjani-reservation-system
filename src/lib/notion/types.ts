// Notion 資料庫屬性名稱映射

export const STUDENT_PROPS = {
  NAME: '姓名',
  LINE_USER_ID: 'LINE User ID',
  COACH: '所屬教練',
  PURCHASED_CLASSES: '購買堂數',
  PRICE_PER_CLASS: '每堂單價',
  COMPLETED_CLASSES: '已上堂數',
  IS_PAID: '是否已繳費',
  STATUS: '狀態',
} as const;

export const COACH_PROPS = {
  NAME: '姓名',
  LINE_USER_ID: 'LINE User ID',
  CALENDAR_COLOR_ID: '日曆顏色ID',
  STATUS: '狀態',
} as const;

export const CHECKIN_PROPS = {
  TITLE: '標題',
  STUDENT: '學員',
  COACH: '教練',
  CLASS_TIME_SLOT: '課程時段',
  CHECKIN_TIME: '打卡時間',
} as const;
