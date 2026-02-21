# Google Calendar API Patterns

## 認證
- 使用 Service Account JWT
- Scope: `calendar.readonly`
- Private key 中的 `\\n` 需替換為實際換行

## 時區
- 所有時間使用 `+08:00` (Asia/Taipei)
- 使用 `date-fns-tz` 的 `toZonedTime` 轉換

## 分頁 (重要!)
- `events.list` 預設只回傳約 250 筆
- 月度查詢必須處理 `nextPageToken` 分頁
- 設定 `maxResults: 2500` 減少分頁次數
- 已修復的函式：`getMonthEvents`, `getEventsForDateRange`
- 單日查詢（`getTodayEvents`, `getEventsForDate`）通常不超過 250 筆，暫未加分頁

## 查詢參數
```typescript
{
  calendarId: env.GOOGLE_CALENDAR_ID,
  timeMin: `${dateStr}T00:00:00+08:00`,
  timeMax: `${dateStr}T23:59:59+08:00`,
  singleEvents: true,     // 展開重複事件
  orderBy: 'startTime',
  maxResults: 2500,
  pageToken,              // 分頁用
}
```

## CalendarEvent 型別
```typescript
{
  id: string;
  summary: string;      // 事件名稱（通常 = 學員姓名）
  start: string;
  end: string;
  colorId?: string;
  date: string;          // 'YYYY-MM-DD'
  startTime: string;     // 'HH:mm'
  endTime: string;       // 'HH:mm'
}
```

## 教練課表篩選
- 先取教練所有學員名單（Notion 查詢）
- 再用學員名稱過濾行事曆事件
- 比對方式：精確 → 模糊（includes）
- 模糊比對的學員不顯示打卡按鈕（`isExactMatch` flag）

## 台灣 ROC 日期
- 顯示用：`parseInt(year) - 1911`
- 如 2026 → 115
