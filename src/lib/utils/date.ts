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

export function formatSlotDisplay(date: string, startTime: string, endTime: string): string {
  const d = toTaipei(date);
  return `${formatDate(d)}（${formatWeekday(d)}）${startTime}–${endTime}`;
}
