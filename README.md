# Anjani Reservation System

LINE Bot 健身教練管理系統。教練透過 LINE 管理學員、打卡、收款；學員透過 LINE 查詢剩餘時數與上課紀錄。

## 系統架構

```
LINE Platform
    │
    ▼
POST /api/webhook (Next.js Route Handler)
    │
    ├─ validateSignature()          ← LINE SDK 驗證
    │
    ▼
handleEvent() 事件分發
    ├─ message  → handleMessage()   ← 文字指令 + 多步驟流程
    ├─ postback → handlePostback()  ← Flex 按鈕回調
    └─ follow   → handleFollow()    ← 新好友加入
            │
            ▼
    ┌──────────────────┐
    │   Service Layer   │
    ├──────────────────┤
    │ checkin.service   │ ← 打卡（含 Calendar 時長計算 + 繳費提醒）
    │ coach.service     │ ← 教練課表（批次查詢 + 記憶體比對）
    │ calendar.service  │ ← Google Calendar 事件查詢
    │ stats.service     │ ← 月度統計 + 續約預測
    │ student-mgmt      │ ← 新增學員/收款/補繳/綁定
    │ student.service   │ ← 身份識別
    └──────────────────┘
            │
            ▼
    ┌──────────────────┐
    │   Data Layer      │
    ├──────────────────┤
    │ Notion API        │ ← 學員/教練/打卡/繳費 CRUD
    │ Google Calendar   │ ← 課表讀取（唯讀）
    │ LINE Messaging    │ ← 推播通知
    └──────────────────┘
```

## 技術棧

| 技術 | 版本 | 用途 |
|------|------|------|
| Next.js | 16 | App Router, Webhook 端點 |
| TypeScript | 5 | 全專案型別安全 |
| @line/bot-sdk | 10 | LINE Messaging API |
| @notionhq/client | 2 | Notion 資料庫 CRUD |
| googleapis | 171 | Google Calendar 讀取 |
| date-fns + date-fns-tz | 4 / 3 | 台灣時區日期處理 |
| zod | 4 | 環境變數驗證 |

部署於 **Vercel**（hnd1 東京區域）。

---

## Notion 資料庫結構

### 學員 (Students)

| 欄位 | 類型 | 說明 |
|------|------|------|
| 姓名 | title | 學員姓名（用於 Calendar 比對） |
| LINE User ID | rich_text | 綁定的 LINE ID |
| 所屬教練 | relation → 教練 DB | |
| 狀態 | select | 學員狀態 |

> 購買時數和已上時數**不存在於學員 DB**，而是從繳費紀錄和打卡紀錄透過 FIFO 模型即時計算。

### 教練 (Coaches)

| 欄位 | 類型 | 說明 |
|------|------|------|
| 姓名 | title | 教練姓名 |
| LINE User ID | rich_text | 綁定的 LINE ID |
| 日曆顏色ID | number | Google Calendar 的 colorId，用來對應教練 |
| 狀態 | select | 教練狀態 |

### 繳費紀錄 (Payments) — 課程包

每筆繳費紀錄代表一個「課程包」，記錄購買資訊與繳費進度。

| 欄位 | 類型 | 說明 |
|------|------|------|
| 標題 | title | 自動產生：`學員名 - yyyy-MM-dd`（日期為期別日期） |
| 學員 | relation → 學員 DB | |
| 教練 | relation → 教練 DB | |
| 購買時數 | number | 此課程包的購買小時數（如 10） |
| 每小時單價 | number | 單價（如 1500） |
| 總金額 | **formula** | `購買時數 × 每小時單價`，自動計算 |
| 已付金額 | number | 累計已收到的金額 |
| 繳費狀態 | select | `未繳費` / `部分繳費` / `已繳費` |
| 建立日期 | date | 紀錄實際建立時間 |

> 標題中的日期決定 FIFO 分期。補繳到現有期時，標題日期會設為該期日期（而非當天），讓 FIFO 自動歸入同一 bucket。

### 打卡紀錄 (Checkins)

每次上課打卡產生一筆紀錄。

| 欄位 | 類型 | 說明 |
|------|------|------|
| 標題 | title | 自動產生：`學員名 - yyyy-MM-dd` |
| 學員 | relation → 學員 DB | |
| 教練 | relation → 教練 DB | |
| 打卡時間 | date | 打卡動作時間戳，ISO 格式（含 +08:00 時區） |
| 課程時段 | date (range) | 課程開始/結束時間，時長從 end-start 計算 |

---

## FIFO 時數消耗模型

學員的剩餘時數由 `getStudentHoursSummary()` 即時計算，採用 **FIFO（先進先出）** 分桶模型：

### 演算法

```
1. 將繳費按標題日期升序排列，同日期的多筆繳費合併為一個桶 (bucket)
2. 將上課紀錄按日期升序排列
3. 逐筆分配上課紀錄到桶：
   - 若當前桶尚未耗盡 → 分配到此桶
   - 若當前桶已耗盡 → 移到下一桶
   - 若所有桶都耗盡 → 歸入 overflow（未繳費）
4. 計算 summary：
   - purchasedHours = 當前桶 + 未來桶的購買時數
   - completedHours = 當前桶已消耗 + overflow 時數
   - remainingHours = purchasedHours - completedHours
```

### 範例

| 場景 | 購買 | 已上 | 剩餘 |
|------|------|------|------|
| 繳費 10hr → 上 7hr | 10 | 7 | 3 |
| 繳費 10hr → 上 7hr → 再繳 10hr | 20 | 7 | 13 |
| 上完桶1（10hr）→ 自動切桶2 | 10 | 0 | 10 |
| 繳費 10hr → 上 12hr（超出） | 0 | 2 | -2 |
| 再繳 10hr → overflow 抵扣 | 10 | 0 | 8 |

### 快取

- `getStudentHoursSummary` 有 1 分鐘 in-memory cache
- 打卡和收款時會呼叫 `clearStudentHoursCache` 清除

---

## 使用者角色與功能

### 學員功能

| 指令 | 功能 |
|------|------|
| `當期上課紀錄` | 查看當期最近 10 筆上課紀錄（有 overflow 時顯示未繳費期） |
| `繳費紀錄` | 依期數查看繳費與上課紀錄 |
| `下週課程` | 查看下週排課時間 |
| `選單` | 顯示功能選單 |

### 教練功能

| 指令 | 功能 |
|------|------|
| `每日課表` | 從 Google Calendar 讀取課表，支援日期選擇 |
| `學員管理` | 查看所有學員的時數/狀態，提供收款/查看按鈕 |
| `新增學員` | 多步驟流程：`姓名 時數 單價` → 確認 → 建立 |
| `本月統計` | 本月排課數、已打卡數、營收、續約預測 |
| `選單` | 顯示功能選單 |

---

## Postback Actions

所有 Postback 資料格式：`ACTION:{param1}:{param2}:...`

| Action | 參數 | 功能 |
|--------|------|------|
| `coach_checkin` | `{studentId}:{date?}` | 教練為學員打卡 |
| `view_schedule` | `{date?}` | 查看指定日期課表 |
| `checkin_schedule` | `{date?}` | 查看未打卡學員清單 |
| `add_student_confirm` | `{name}:{hours}:{price}` | 確認新增學員 |
| `collect_add` | `{studentId}` | 開始收款流程 |
| `confirm_pay` | `{studentId}:{amount}:{price}:{date\|new}` | 確認收款（新期/補繳） |
| `view_student_history` | `{studentId}` | 查看學員當期上課紀錄 |
| `view_pay_hist` | `{studentId}` | 查看繳費期數選單 |
| `view_class_pay` | `{studentId}:{bucketDate}` | 查看指定期的上課紀錄 |
| `view_pay_dtl` | `{studentId}:{bucketDate}` | 查看指定期的繳費明細 |
| `view_unpaid` | `{studentId}` | 查看未繳費期上課紀錄 |

---

## 核心流程

### 1. 打卡流程

```
教練點擊課表中的「打卡」按鈕
    │
    ▼
coachCheckinForStudent()
    ├─ 驗證教練/學員身份
    ├─ 檢查是否已打卡（同學員同日期不可重複）
    ├─ 從 Google Calendar 找到對應事件
    ├─ 計算課程時長 = endTime - startTime（分鐘）
    ├─ 取得 FIFO 分桶資訊（打卡前）
    ├─ 建立打卡紀錄
    ├─ 手動計算新剩餘時數（避免 Notion eventual consistency）
    ├─ 推播通知學員：時段、時長、剩餘時數
    │   └─ 剩餘 ≤ 1 小時：附加提醒文字
    ├─ 檢查當前桶是否剛好用完且無下一桶
    │   └─ 是 → 額外推播繳費提醒
    └─ 回覆教練：打卡成功 + 剩餘時數
```

> 模糊比對的學員（名稱含包含關係但非完全匹配）不會顯示打卡按鈕，避免誤打卡。

### 2. 收款流程（支援分期補繳）

```
教練點擊「收款/加值」按鈕
    │
    ▼
startCollectAndAdd()
    ├─ 有繳費歷史 → 顯示單價 + 剩餘時數，請輸入金額
    └─ 無繳費歷史 → 請輸入單價 → 再輸入金額
    │
    ▼
教練輸入金額
    │
    ▼
handleCollectAndAddStep()
    ├─ 學員無繳費紀錄 → 直接建立 payment（今天日期）
    └─ 學員有繳費紀錄 → 顯示 Flex 期數選擇卡片：
        ├─ 「新的一期」 → 建立 payment（今天日期）
        └─ 「補繳到 114-12-16（5hr）」 → 建立 payment（用該期日期）
            │                              ↑ 已用罄的期數不顯示
            ▼
    confirm_pay postback → executeConfirmPayment()
        ├─ 建立繳費紀錄（補繳時標題日期 = 期別日期）
        ├─ 手動計算新剩餘時數
        ├─ 推播繳費通知給學員
        └─ 回覆教練收款成功
```

### 3. 繳費紀錄查詢

```
學員/教練輸入「繳費紀錄」
    │
    ▼
paymentPeriodSelector()
    ├─ 按日期分組（同日期多筆合併為一期）
    ├─ 每期一個按鈕：ROC日期 ｜ 合計時數 ｜ 合計金額
    ├─ 有 overflow → 顯示紅色「未繳費（超出時數）」按鈕
    │
    ▼
點擊某一期
    ├─ 該期只有 1 筆繳費 → 直接顯示上課紀錄
    └─ 該期有多筆繳費 → 顯示繳費明細卡片
        ├─ 列出每筆繳費的時數與金額
        ├─ 合計行
        └─ 「查看上課紀錄」按鈕 → 顯示該期的上課紀錄
```

### 4. 新增學員流程

```
教練輸入「新增學員」→ 輸入「姓名 時數 單價」→ 確認卡片 → 建立學員 + 繳費紀錄
```

### 5. 學員綁定流程

```
新使用者加入 LINE 好友 / 傳送任意訊息
    ├─ 無法識別身份 → 啟動綁定流程
    ├─ 輸入「教練 姓名」或「教練+姓名」→ 綁定為教練
    └─ 輸入學員姓名 → 綁定為學員
```

---

## Google Calendar 整合

系統以**唯讀**方式讀取 Google Calendar，不會建立或修改事件。

- **認證**：Service Account JWT，scope `calendar.readonly`
- **時區**：所有時間使用 `+08:00`（Asia/Taipei）
- **教練對應**：透過 Notion 的 `日曆顏色ID` 對應 Calendar 的 `colorId`
- **學員對應**：Calendar 事件 `summary` 與 Notion 學員名稱比對（精確 → 模糊）
- **課程時長**：從事件的 `startTime` / `endTime` 自動計算，不需手動輸入
- **分頁處理**：月度查詢使用 `nextPageToken` + `maxResults: 2500` 確保不漏筆

---

## 效能優化

### 每日課表批次查詢

原本每個 Calendar 事件逐一查詢 Notion（N+1 問題），已改為 3 個並行 API 呼叫 + 記憶體比對：

1. `getStudentsByCoachId` → 一次取得所有學員
2. `getTodayEvents` → 一次取得行事曆事件
3. `getCheckinsByDate` → 一次取得當日所有打卡

然後在記憶體中用 `Map` / `Set` 比對，從 ~9 秒降到 ~1-2 秒。

### Notion API Rate Limit

- Notion API 限制約 3 req/s
- `pMap` 工具預設 concurrency=1 + 350ms delay
- 批次查詢 + 記憶體比對，減少 API 呼叫次數
- `getStudentHoursSummary` 有 1 分鐘 cache

### Eventual Consistency 處理

Notion 新建紀錄後立即查詢可能找不到。解法：在建立紀錄**之前**先取得舊資料，建立後直接用已知數值計算新結果，不重新查詢。

---

## 多步驟對話狀態管理

系統使用 **記憶體內的 Map** 管理多步驟對話狀態：

```typescript
const collectAndAddStates = new Map<string, CollectAndAddState>();
const bindingStates = new Map<string, BindingState>();
```

Message handler 在處理訊息時，優先檢查是否有進行中的流程。輸入「取消」可隨時退出。

> Serverless 環境下實例可能被回收而導致狀態遺失。關鍵操作（如收款確認）使用 Postback data 攜帶完整參數，實現無狀態化。

---

## 專案目錄結構

```
src/
├── app/
│   └── api/
│       ├── webhook/route.ts          # LINE Webhook 端點
│       └── setup/rich-menu/route.ts  # Rich Menu 設定 API
├── handlers/
│   ├── index.ts                      # 事件分發器
│   ├── message.handler.ts            # 文字訊息處理
│   ├── postback.handler.ts           # Postback 處理
│   └── follow.handler.ts             # 新好友處理
├── services/
│   ├── calendar.service.ts           # Calendar 事件查詢 + 學員比對
│   ├── checkin.service.ts            # 打卡邏輯 + 繳費提醒
│   ├── coach.service.ts              # 教練課表（批次查詢優化）
│   ├── stats.service.ts              # 月度統計 + 續約預測
│   ├── student-management.service.ts # 新增學員/收款/補繳/綁定
│   └── student.service.ts            # 身份識別
├── lib/
│   ├── config/
│   │   ├── constants.ts              # 關鍵字、Action、角色常數
│   │   └── env.ts                    # 環境變數驗證（Zod）
│   ├── google/
│   │   └── calendar.ts               # Google Calendar API（含分頁）
│   ├── line/
│   │   ├── client.ts                 # LINE Messaging API 客戶端
│   │   ├── reply.ts                  # 回覆工具函式
│   │   ├── push.ts                   # 推播工具函式
│   │   ├── validate.ts               # Webhook 簽名驗證
│   │   └── rich-menu.ts              # Rich Menu 管理
│   ├── notion/
│   │   ├── client.ts                 # Notion API 客戶端
│   │   ├── types.ts                  # Notion 欄位名稱對應
│   │   ├── students.ts               # 學員 CRUD
│   │   ├── coaches.ts                # 教練 CRUD
│   │   ├── checkins.ts               # 打卡紀錄 CRUD（含批次查詢）
│   │   ├── payments.ts               # 繳費紀錄 CRUD
│   │   └── hours.ts                  # FIFO 時數計算 + 快取
│   └── utils/
│       ├── date.ts                   # 日期/時區工具函式
│       └── concurrency.ts            # pMap 並行控制
├── templates/
│   ├── flex/
│   │   ├── main-menu.ts              # 學員/教練主選單
│   │   ├── today-schedule.ts         # 今日課表卡片
│   │   ├── student-info.ts           # 學員資訊卡片
│   │   ├── student-mgmt-list.ts      # 學員管理列表
│   │   ├── class-history.ts          # 上課紀錄 + 繳費期數選單 + 繳費明細
│   │   ├── payment-confirm.ts        # 收款期數選擇（新期/補繳）
│   │   ├── monthly-stats.ts          # 月度統計卡片
│   │   ├── student-schedule.ts       # 學員下週課程
│   │   ├── add-student-confirm.ts    # 新增學員確認卡片
│   │   └── empty-state.ts            # 空狀態提示
│   ├── quick-reply.ts                # Quick Reply 按鈕
│   └── text-messages.ts              # 固定文字訊息
└── types/
    └── index.ts                      # TypeScript 型別定義
```

---

## 環境變數

在 `.env.local` 或 Vercel 環境設定中配置：

```env
# LINE Bot
LINE_CHANNEL_SECRET=your_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token

# Notion
NOTION_API_KEY=your_notion_api_key
NOTION_STUDENTS_DB_ID=your_students_database_id
NOTION_COACHES_DB_ID=your_coaches_database_id
NOTION_CHECKIN_DB_ID=your_checkin_database_id
NOTION_PAYMENTS_DB_ID=your_payments_database_id

# Google Calendar
GOOGLE_CALENDAR_ID=your_calendar_id@group.calendar.google.com
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Optional
CRON_SECRET=your_cron_secret
RICH_MENU_STUDENT_ID=richmenu-xxx
RICH_MENU_COACH_ID=richmenu-xxx
```

---

## 開發

```bash
npm install
npm run dev
```

TypeScript 型別檢查：

```bash
npx tsc --noEmit
```

LINE Webhook 設定為 `https://your-domain.vercel.app/api/webhook`。
