# Anjani Reservation System - Skills & Knowledge Base

## Project Overview
LINE Bot 課程預約管理系統（安傑力），部署於 Vercel (Next.js)，使用 Notion 作為資料庫、Google Calendar 作為行事曆。

## Architecture
- **Runtime**: Next.js API Routes on Vercel (Serverless)
- **Database**: Notion API
- **Calendar**: Google Calendar API
- **Messaging**: LINE Bot SDK (Flex Messages, Postback, Quick Reply)
- **Language**: TypeScript with path aliases (`@/`)

## Key Files
- `src/handlers/message.handler.ts` — LINE 文字訊息路由
- `src/handlers/postback.handler.ts` — Postback 動作路由
- `src/services/checkin.service.ts` — 打卡邏輯 + 通知
- `src/services/coach.service.ts` — 教練課表
- `src/services/stats.service.ts` — 月度統計
- `src/services/student-management.service.ts` — 新增學員/收款
- `src/lib/notion/hours.ts` — 時數計算核心 (FIFO 分桶)
- `src/lib/google/calendar.ts` — Google Calendar 封裝
- `src/lib/config/constants.ts` — 關鍵字/ACTION 常數
- `src/templates/flex/` — LINE Flex Message 模板

## Detailed Skills
- [problems-and-solutions.md](problems-and-solutions.md) — 遇到的問題與解決方案
- [fifo-hours-model.md](fifo-hours-model.md) — FIFO 時數消耗模型
- [notion-api-patterns.md](notion-api-patterns.md) — Notion API 注意事項
- [google-calendar-patterns.md](google-calendar-patterns.md) — Google Calendar API 注意事項
