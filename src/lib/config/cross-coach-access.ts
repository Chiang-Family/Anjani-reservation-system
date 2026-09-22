// 跨教練查看權限：Winnie 教練負責統整家庭收入，需要能查看 Andy 教練的統計資料
export const CROSS_COACH_ACCESS: Record<string, string[]> = {
  Winnie: ['Andy'],
};

export function getViewableCoachNames(viewerName: string): string[] {
  return CROSS_COACH_ACCESS[viewerName] ?? [];
}

export function canViewCoachStats(viewerName: string, targetName: string): boolean {
  return getViewableCoachNames(viewerName).includes(targetName);
}
