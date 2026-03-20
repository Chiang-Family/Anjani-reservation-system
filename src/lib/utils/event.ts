const MASSAGE_PREFIX = '按摩-';

/**
 * 解析行事曆事件標題，識別白名單前綴（如「按摩-」）並剝離後回傳學員姓名。
 * 非白名單前綴（如「請假-」）不會被解析，整個字串視為名稱（不會匹配任何學員）。
 */
export function parseEventSummary(summary: string): { studentName: string; isMassage: boolean } {
  const s = summary.trim();
  if (s.startsWith(MASSAGE_PREFIX)) {
    return { studentName: s.slice(MASSAGE_PREFIX.length), isMassage: true };
  }
  return { studentName: s, isMassage: false };
}
