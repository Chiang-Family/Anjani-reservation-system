export const TEXT = {
  WELCOME_STUDENT: (name: string) =>
    `歡迎回來，${name}！\n\n可用指令：\n📋 預約課程\n📖 我的預約\n✅ 報到\n🔢 剩餘堂數`,

  WELCOME_COACH: (name: string) =>
    `歡迎回來，${name} 教練！\n\n可用指令：\n📋 今日課程\n📅 近期課程`,

  WELCOME_NEW: '歡迎加入 Anjani！\n請聯繫工作人員完成註冊。',

  UNKNOWN_USER: '找不到您的帳號資料，請聯繫工作人員。',

  NO_AVAILABLE_SLOTS: '目前沒有可預約的課程。',

  NO_RESERVATIONS: '您目前沒有已預約的課程。',

  NO_TODAY_CLASSES: '今日沒有排定的課程。',

  NO_UPCOMING_CLASSES: '近期沒有排定的課程。',

  UNKNOWN_COMMAND: '無法辨識的指令。\n請輸入關鍵字或使用下方選單。',

  ERROR: '系統發生錯誤，請稍後再試。',
} as const;
