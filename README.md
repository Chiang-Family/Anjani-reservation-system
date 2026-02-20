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
    │ checkin.service   │ ← 打卡（含 Calendar 時長計算）
    │ coach.service     │ ← 教練課表
    │ calendar.service  │ ← Google Calendar 事件查詢
    │ stats.service     │ ← 月度統計 + 續約預測
    │ student-mgmt      │ ← 新增學員/編輯/收款/綁定
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

> 購買時數和已上時數**不存在於學員 DB**，而是從繳費紀錄和打卡紀錄即時計算。

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
| 標題 | title | 自動產生：`學員名 - yyyy-MM-dd` |
| 學員 | relation → 學員 DB | |
| 教練 | relation → 教練 DB | |
| 購買時數 | number | 此課程包的購買小時數（如 10） |
| 每小時單價 | number | 單價（如 1500） |
| 總金額 | **formula** | `購買時數 × 每小時單價`，自動計算 |
| 已付金額 | number | 累計已收到的金額（預設 0） |
| 繳費狀態 | select | `未繳費` / `部分繳費` / `已繳費` |
| 建立日期 | date | 紀錄建立時間 |

### 打卡紀錄 (Checkins)

每次上課打卡產生一筆紀錄。

| 欄位 | 類型 | 說明 |
|------|------|------|
| 標題 | title | 自動產生：`學員名 - yyyy-MM-dd` |
| 學員 | relation → 學員 DB | |
| 教練 | relation → 教練 DB | |
| 打卡時間 | date | ISO 格式（含 +08:00 時區） |
| 課程時段 | rich_text | 如 `10:00-11:00` |
| 課程時長 | number | 分鐘數（從 Google Calendar 事件計算） |

---

## 剩餘時數計算邏輯

學員的剩餘時數由 `getStudentHoursSummary()` 即時計算：

```
購買時數 = sum(所有繳費紀錄.購買時數)
已上時數 = sum(所有打卡紀錄.課程時長) ÷ 60
剩餘時數 = 購買時數 - 已上時數
```

此函式會平行查詢繳費紀錄和打卡紀錄（`Promise.all`），用於：
- 學員查看個人資訊
- 教練打卡後顯示剩餘
- 學員管理列表
- 月度統計的續約預測

---

## 使用者角色與功能

### 學員功能

| 指令 | 功能 |
|------|------|
| `上課紀錄` | 查看最近 10 筆上課日期、時段、時長 |
| `剩餘時數` | 查看購買/已上/剩餘時數 |
| `選單` | 顯示功能選單 |

學員首次加入 LINE 好友時，系統會要求輸入姓名進行綁定。

### 教練功能

| 指令 | 功能 |
|------|------|
| `今日課表` | 從 Google Calendar 讀取今日排課，支援前後 7 天切換 |
| `幫學員打卡` | 顯示今日未打卡的學員，點擊即可打卡 |
| `學員管理` | 查看所有學員（時數/收款），提供加值、修改、收款按鈕 |
| `新增學員` | 多步驟流程：姓名 → 購買時數 → 每小時單價 → 確認 |
| `本月統計` | 本月排課數、總時數、已收/待收金額、續約預測 |
| `選單` | 顯示功能選單 |

---

## 核心流程

### 1. 打卡流程

```
教練點擊「打卡」按鈕
    │
    ▼
postback: coach_checkin:{studentId}:{date?}
    │
    ▼
coachCheckinForStudent()
    ├─ 驗證教練/學員身份
    ├─ 檢查是否已打卡（同學員同日期不可重複）
    ├─ 從 Google Calendar 找到對應事件
    ├─ 計算課程時長 = endTime - startTime（分鐘）
    ├─ 建立打卡紀錄（含時長）
    ├─ 計算剩餘時數
    ├─ 推播通知學員：時段、時長、剩餘時數
    │   └─ 剩餘 ≤ 2 小時：附加續約提醒
    └─ 回覆教練：打卡成功 + 剩餘時數
```

### 2. 收款流程（支援分次付款）

```
教練點擊「收款」按鈕
    │
    ▼
startPaymentCollection()
    ├─ 查詢最新一筆未繳清的繳費紀錄
    ├─ 顯示待收金額（或已付/剩餘）
    └─ 進入多步驟收款狀態

教練輸入金額（或「全額」）
    │
    ▼
handlePaymentStep()
    ├─ 驗證金額不超過剩餘待收
    ├─ 累加已付金額
    ├─ 自動判斷狀態：
    │   ├─ 已付 ≥ 總金額 → 已繳費
    │   └─ 否則 → 部分繳費
    └─ 回覆確認訊息
```

### 3. 新增學員流程

```
教練輸入「新增學員」
    │
    ▼
startAddStudent()
    ├─ Step 1: 請輸入學員姓名
    ├─ Step 2: 請輸入購買時數（支援小數如 7.5）
    ├─ Step 3: 請輸入每小時單價
    ├─ Step 4: 確認資料
    └─ 建立學員 + 第一筆繳費紀錄（未繳費）
```

### 4. 學員綁定流程

```
新使用者加入 LINE 好友 / 傳送任意訊息
    │
    ▼
handleFollow() / handleMessage()
    ├─ 無法識別身份 → 啟動綁定流程
    ├─ 提示輸入姓名
    └─ 姓名比對成功 → 寫入 LINE User ID → 綁定完成
```

---

## Google Calendar 整合

系統以**唯讀**方式讀取 Google Calendar，不會建立或修改事件。

### 教練與 Calendar 的對應

每位教練在 Notion 記錄一個 `日曆顏色ID`，對應 Google Calendar 事件的 `colorId`。系統透過 colorId 篩選出該教練的課表。

### 學員與事件的對應

Calendar 事件的 `summary`（標題）包含學員姓名。系統以模糊比對方式匹配：
- 完全相同：`summary === studentName`
- 包含關係：`summary.includes(studentName)` 或 `studentName.includes(summary)`

### 課程時長計算

打卡時從 Calendar 事件的 `startTime` 和 `endTime` 自動計算時長（分鐘），不需要教練手動輸入。

---

## 多步驟對話狀態管理

教練端有多個需要連續對話的功能（新增學員、加值時數、收款等）。系統使用 **記憶體內的 Map** 管理對話狀態：

```typescript
const addStudentStates = new Map<string, AddStudentState>();   // LINE User ID → 狀態
const editStudentStates = new Map<string, EditStudentState>();
const paymentStates = new Map<string, PaymentState>();
const bindingStates = new Map<string, BindingState>();
```

Message handler 在處理教練訊息時，依序檢查是否有進行中的流程：

```
editState → paymentState → addStudentState → 一般指令
```

輸入「取消」可隨時退出任何進行中的流程。

> 注意：狀態存在記憶體中，Serverless 環境下（如 Vercel）實例可能被回收。適用於短時間內完成的對話流程。

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
│   ├── checkin.service.ts            # 打卡邏輯
│   ├── coach.service.ts              # 教練課表
│   ├── stats.service.ts              # 月度統計
│   ├── student-management.service.ts # 學員管理多步驟流程
│   └── student.service.ts            # 身份識別
├── lib/
│   ├── config/
│   │   ├── constants.ts              # 關鍵字、Action、角色常數
│   │   └── env.ts                    # 環境變數驗證（Zod）
│   ├── google/
│   │   └── calendar.ts               # Google Calendar API 客戶端
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
│   │   ├── checkins.ts               # 打卡紀錄 CRUD
│   │   ├── payments.ts               # 繳費紀錄 CRUD
│   │   └── hours.ts                  # 剩餘時數計算
│   └── utils/
│       └── date.ts                   # 日期/時區工具函式
├── templates/
│   ├── flex/
│   │   ├── main-menu.ts              # 學員/教練主選單
│   │   ├── today-schedule.ts         # 今日課表卡片
│   │   ├── student-info.ts           # 學員資訊卡片
│   │   ├── student-mgmt-list.ts      # 學員管理列表
│   │   ├── class-history.ts          # 上課紀錄卡片
│   │   ├── monthly-stats.ts          # 月度統計卡片
│   │   ├── empty-state.ts            # 空狀態提示
│   │   └── confirm-dialog.ts         # 確認對話框
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
