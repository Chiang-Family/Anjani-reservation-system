# Problems & Solutions

## 1. Vercel Serverless 狀態遺失
**問題**: 使用 `Map` 儲存多步驟流程狀態（如新增學員），在 Vercel serverless 環境中，不同請求可能分配到不同實例，導致 Map 狀態遺失。
**解法**: 改為 Stateless 架構：
- 用正則偵測輸入格式（如 `parseAddStudentInput("姓名 時數 金額")`）
- 用 Flex Message 確認卡片 + Postback 傳遞參數（`add_student_confirm:{name}:{hours}:{price}`）
- 避免依賴 in-memory state

**相關檔案**: `src/services/student-management.service.ts`, `src/templates/flex/add-student-confirm.ts`

---

## 2. Notion API 新建紀錄後立即查詢找不到
**問題**: `createPaymentRecord` 後馬上呼叫 `getStudentHoursSummary`，新紀錄可能尚未被 Notion 索引，導致查詢結果不包含新資料。
**解法**: 在建立紀錄**之前**先取得舊的 summary，建立後直接用已知數值計算新的結果，不重新查詢 Notion。
```typescript
const oldSummary = await getStudentHoursSummary(studentId);
await createPaymentRecord({...});
const newRemaining = hours + oldSummary.remainingHours;
```
**適用場景**: 收款通知、打卡通知中的剩餘時數顯示。

**相關檔案**: `src/services/student-management.service.ts`, `src/services/checkin.service.ts`

---

## 3. Notion API Rate Limit (3 req/sec)
**問題**: 批次查詢多位學員時，逐筆呼叫 Notion API 會觸發 rate limit。
**解法**:
- 使用 `pMap` 工具控制並發數（預設 concurrency=1 + 350ms delay）
- 更好的做法：**批次查詢 + 記憶體比對**，減少 API 呼叫次數（見 #4）

**相關檔案**: `src/lib/utils/concurrency.ts`

---

## 4. 每日課表 N+1 查詢效能問題
**問題**: 原本每個行事曆事件都個別查 Notion 找學員 + 打卡狀態，10 堂課 = 20+ 次 Notion API + 350ms delay ≈ 9 秒。
**解法**: 改為 3 個並行 API 呼叫 + 記憶體比對：
1. `getStudentsByCoachId` → 一次取得所有學員
2. `getTodayEvents` → 一次取得行事曆
3. `getCheckinsByDate` → 一次取得當日所有打卡

然後在記憶體中用 `Map` 和 `Set` 比對，從 ~9 秒降到 ~1-2 秒。

**相關檔案**: `src/services/coach.service.ts`, `src/lib/notion/checkins.ts`

---

## 5. Google Calendar API 分頁截斷
**問題**: `events.list` 預設只回傳最多 250 筆事件，月度統計的「已預約堂數」被截斷（如實際 300+ 堂只顯示 72 堂）。
**解法**: 加上分頁處理：
```typescript
do {
  const res = await calendar.events.list({
    ...params,
    maxResults: 2500,
    pageToken,
  });
  // process res.data.items
  pageToken = res.data.nextPageToken ?? undefined;
} while (pageToken);
```

**相關檔案**: `src/lib/google/calendar.ts`（`getMonthEvents`, `getEventsForDateRange`）

---

## 6. 時數期別混合顯示
**問題**: 學員時數用完後繼續上課（未繳費），已繳費和未繳費的上課紀錄混在一起顯示。
**解法**: 實作 FIFO 分桶模型（見 [fifo-hours-model.md](fifo-hours-model.md)），動態計算 overflow 分界，分離為「已繳費」和「未繳費」兩個顯示區塊。

**相關檔案**: `src/lib/notion/hours.ts`

---

## 7. Overflow 分界點計算錯誤
**問題**: 原本在累加時數**之後**才檢查是否超過購買時數，導致邊界判斷錯誤（最後一堂課被錯誤歸類）。
**解法**: 改為在每堂課**之前**檢查：
```typescript
// ✅ 正確：先檢查再累加
if (cumulativeMinutes >= purchasedMinutes) {
  firstUnpaidIndex = i;
  break;
}
cumulativeMinutes += sorted[i].durationMinutes;
```

---

## 8. 模糊比對學員誤觸打卡
**問題**: 行事曆事件名稱與 Notion 學員名稱模糊比對成功時，也會顯示打卡按鈕，可能導致誤打卡。
**解法**: 在 `ScheduleItem` 加 `isExactMatch` 欄位，只有精確比對才顯示打卡按鈕：
```typescript
if (!item.isCheckedIn && item.studentNotionId && item.isExactMatch) {
  // 顯示打卡按鈕
}
```

**相關檔案**: `src/services/coach.service.ts`, `src/templates/flex/today-schedule.ts`

---

## 9. 當期時數用完未發送繳費提醒
**問題**: 學員當期最後一堂課打卡後，沒有主動通知繳費。
**解法**: 打卡前取得 FIFO 分桶資訊，打卡後判斷：
- 當前桶的剩餘分鐘 ≤ 本次課程分鐘
- 且沒有下一期預繳（最後一個桶）
→ 在打卡通知後額外發送繳費提醒訊息。

**相關檔案**: `src/services/checkin.service.ts`

---

## 10. Edit 工具 old_string 重複匹配
**經驗**: 使用 Edit 工具時，如果 `old_string` 在檔案中出現多次，編輯會失敗。需要包含更多上下文來確保唯一匹配。
