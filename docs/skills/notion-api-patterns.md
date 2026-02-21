# Notion API Patterns

## Rate Limit
- Notion API 限制約 3 requests/second
- `pMap` 工具預設 concurrency=1 + 350ms delay 來避免觸發
- 更好做法：批次查詢 + 記憶體比對，減少呼叫次數

## Eventual Consistency
- 新建 page 後立即 query database 可能找不到
- **解法**: 在建立前先取得舊資料，建立後用已知值計算，不重新查詢

## 常見查詢模式
```typescript
// 按 relation 過濾
filter: { property: 'Student', relation: { contains: studentId } }

// 按 title 搜尋
filter: { property: 'Name', title: { equals: name } }

// 按 title 包含日期
filter: { property: 'Title', title: { contains: '2026-02-21' } }

// 複合過濾
filter: { and: [condition1, condition2] }
```

## Property 讀取 Helpers
- `getTitleValue(prop)` — title 屬性
- `getRelationIds(prop)` — relation 屬性
- `getDateValue(prop)` — date 屬性
- `getDateRange(prop)` — date range 屬性
- `getUrlValue(prop)` — URL 屬性

## Notion 資料庫
- Students DB: `NOTION_STUDENTS_DB_ID`
- Checkins DB: `NOTION_CHECKIN_DB_ID`
- Payments DB: `NOTION_PAYMENTS_DB_ID`
- Coaches DB: `NOTION_COACHES_DB_ID`

## 資料排序
- Payments: `createdAt` 降序（最新在前）
- Checkins: `classTimeSlot` 降序
- 查詢後可能需要在程式端重新排序以確保一致性

## Cache
- `getStudentHoursSummary` 有 1 分鐘 in-memory cache
- `createCheckinRecord` 和 `createPaymentRecord` 會呼叫 `clearStudentHoursCache`
