# FIFO 時數消耗模型

## 核心概念
每筆繳費建立一個「桶」(bucket)，上課紀錄按日期順序從最早的桶開始消耗，用完才消耗下一桶。

## 演算法 (`assignCheckinsToBuckets`)
```
1. 將繳費按日期升序排列，每個日期建立一個桶（同日多筆合併）
2. 將上課紀錄按日期升序排列
3. 逐筆消耗：
   - 跳過已消耗完的桶（consumedMinutes >= purchasedHours * 60）
   - 有可用桶 → 分配到該桶
   - 無可用桶 → 歸入 overflow（未繳費）
```

## Summary 計算 (`computeSummaryFromBuckets`)
- **activeIdx** = 第一個尚未耗盡的桶
- **purchasedHours** = 當前桶 + 未來桶的購買時數總和
- **completedHours** = 當前桶已消耗 + overflow 時數
- **remainingHours** = purchasedHours - completedHours

## 行為範例

### 正常使用
- 繳費 10hr → 上 7hr → 購買:10, 已上:7, 剩餘:3

### 提前繳費
- 繳費 10hr → 上 7hr → 再繳 10hr
- 顯示：購買:20, 已上:7, 剩餘:13
- 繼續上 3hr（桶1用完）→ 自動切到桶2：購買:10, 已上:0, 剩餘:10

### 時數用完繼續上課（Overflow）
- 繳費 10hr → 上 12hr → 購買:0, 已上:2(overflow), 剩餘:-2
- 再繳 10hr → 剩餘: 10 + (-2) = 8

## 影響的功能
- **當期上課紀錄** (`CLASS_HISTORY`): 顯示 active bucket 的上課紀錄
- **繳費紀錄查詢** (`VIEW_CLASS_BY_PAYMENT`): 用 bucket 對應取代日期範圍
- **學員管理** (`studentMgmtList`): summary 數字反映 FIFO 計算
- **收款通知**: `newRemaining = newHours + oldRemaining`
- **打卡通知**: `newRemaining = oldRemaining - durationMinutes/60`
- **繳費提醒**: 當前桶剛好用完且無下一桶 → 發送提醒

## 關鍵檔案
- `src/lib/notion/hours.ts` — `assignCheckinsToBuckets`, `computeSummaryFromBuckets`, `getStudentOverflowInfo`
- `src/types/index.ts` — `OverflowInfo` 介面

## 注意事項
- Notion API 有 eventual consistency，新建紀錄後不要立即查詢，應用已知數值手動計算
- `getStudentOverflowInfo` 回傳 `buckets` 陣列（升序）和 `payments` 陣列（降序），注意方向
- 剩餘時數提醒門檻：≤ 1 小時
