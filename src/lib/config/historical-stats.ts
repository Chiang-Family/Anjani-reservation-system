/**
 * 手動補登的歷史月度資料（用於尚未匯入 Notion 的舊資料）
 * 格式：coachName → year → month → { checkedIn, executedRevenue, collected }
 */
export const HISTORICAL_MONTHLY_STATS: Record<
  string,
  Record<number, Record<number, { checkedIn: number; executedRevenue: number; collected: number }>>
> = {
  Winnie: {
    2026: {
      1: { checkedIn: 41, executedRevenue: 52200, collected: 53800 },
    },
  },
};
