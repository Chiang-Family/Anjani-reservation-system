import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TZ = 'Asia/Taipei';

export function nowTaipei(): Date {
  return toZonedTime(new Date(), TZ);
}

export function toTaipei(date: Date | string): Date {
  return toZonedTime(new Date(date), TZ);
}

export function formatDate(date: Date | string): string {
  return format(toTaipei(date), 'yyyy/MM/dd');
}

export function formatTime(date: Date | string): string {
  return format(toTaipei(date), 'HH:mm');
}

export function formatDateTime(date: Date | string): string {
  return format(toTaipei(date), 'yyyy/MM/dd HH:mm');
}

export function formatWeekday(date: Date | string): string {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const d = toTaipei(date);
  return weekdays[d.getDay()];
}

export function todayDateString(): string {
  return format(nowTaipei(), 'yyyy-MM-dd');
}

/** 輸出台灣時區 ISO 格式（帶 +08:00），用於存入 Notion */
export function nowTaipeiISO(): string {
  return format(nowTaipei(), "yyyy-MM-dd'T'HH:mm:ss") + '+08:00';
}


/** 組合 yyyy-MM-dd + HH:mm → Taipei Date */
export function parseSlotTime(dateStr: string, timeStr: string): Date {
  const iso = `${dateStr}T${timeStr}:00+08:00`;
  return toZonedTime(new Date(iso), TZ);
}

export function formatSlotDisplay(date: string, startTime: string, endTime: string): string {
  const d = toTaipei(date);
  return `${formatDate(d)}（${formatWeekday(d)}）${startTime}–${endTime}`;
}
