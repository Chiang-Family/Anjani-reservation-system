// Notion 資料庫屬性名稱映射

export const STUDENT_PROPS = {
  NAME: '姓名',
  LINE_USER_ID: 'LINE User ID',
  COACH: '所屬教練',
  STATUS: '狀態',
  PAYMENT_TYPE: '收費方式',
  PER_SESSION_FEE: '單堂費用',
  RELATED_STUDENTS: '關聯學員',
} as const;

export const COACH_PROPS = {
  NAME: '姓名',
  LINE_USER_ID: 'LINE User ID',
  LINE_URL: '個人LINE連結',
  CALENDAR_COLOR_ID: '日曆顏色ID',
  STATUS: '狀態',
} as const;

export const PAYMENT_PROPS = {
  TITLE: '標題',
  STUDENT: '學員',
  COACH: '教練',
  PURCHASED_HOURS: '購買時數',
  PRICE_PER_HOUR: '每小時單價',
  TOTAL_AMOUNT: '總金額',
  PAID_AMOUNT: '已付金額',
  STATUS: '繳費狀態',
  CREATED_AT: '建立日期',
} as const;

export const CHECKIN_PROPS = {
  TITLE: '標題',
  STUDENT: '學員',
  COACH: '教練',
  CLASS_TIME_SLOT: '課程時段',
  CHECKIN_TIME: '打卡時間',
} as const;
