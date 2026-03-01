import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TZ = 'Asia/Taipei';

export function nowTaipei(): Date {
  return toZonedTime(new Date(), TZ);
}

function toTaipei(date: Date | string): Date {
  return toZonedTime(new Date(date), TZ);
}

export function formatDateTime(date: Date | string): string {
  return format(toTaipei(date), 'yyyy/MM/dd HH:mm');
}

export function todayDateString(): string {
  return format(nowTaipei(), 'yyyy-MM-dd');
}

/** 輸出台灣時區 ISO 格式（帶 +08:00），用於存入 Notion */
export function nowTaipeiISO(): string {
  return format(nowTaipei(), "yyyy-MM-dd'T'HH:mm:ss") + '+08:00';
}


/** yyyy-MM-dd 加減天數 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  d.setDate(d.getDate() + days);
  return format(toZonedTime(d, TZ), 'yyyy-MM-dd');
}

/** 格式化日期為中文顯示 (M/d（週X）) */
export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  const zoned = toZonedTime(d, TZ);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${zoned.getMonth() + 1}/${zoned.getDate()}（${weekdays[zoned.getDay()]}）`;
}

/** 計算課程時長（分鐘），從 HH:mm 格式的開始/結束時間 */
export function computeDurationMinutes(startTime: string, endTime: string): number {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  return (endH * 60 + endM) - (startH * 60 + startM);
}

/** 格式化小時數為中文顯示（如 7 小時 30 分） */
export function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} 分`;
  if (m === 0) return `${h} 小時`;
  return `${h} 小時 ${m} 分`;
}
