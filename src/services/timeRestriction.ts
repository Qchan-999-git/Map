import { TIME_RESTRICTIONS, TimeRestriction } from '../data/timeRestrictions';
import { RouteResult } from '../types';
import { calculateHaversineDistance } from './mapService';

export interface TimeRestrictionStatus {
  restriction: TimeRestriction;
  /** 今まさに規制時間帯か */
  activeNow: boolean;
  /** ルートが規制区間を通過しそうか（キーワード or 付近座標で判定） */
  onRoute: boolean;
  /** 今通れるか（activeNow && onRoute なら ×通れません） */
  blocked: boolean;
  message: string;
}

function minutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function toMinutes(h: number, m: number): number {
  return h * 60 + m;
}

/** 指定日時が規制時間帯に入っているか */
export function isActiveAt(r: TimeRestriction, at: Date = new Date()): boolean {
  if (!r.days.includes(at.getDay())) return false;
  const now = minutesOf(at);
  return now >= toMinutes(r.startHour, r.startMinute) && now < toMinutes(r.endHour, r.endMinute);
}

/** ルートが規制区間に触れそうか（簡易判定：道路名キーワード or 代表座標の半径内） */
export function isOnRoute(r: TimeRestriction, route: RouteResult | null): boolean {
  if (!route) return false;

  const keywords = r.roadKeywords.map((k) => k.toLowerCase());
  for (const s of route.steps) {
    const hay = `${s.name ?? ''} ${s.instruction ?? ''}`.toLowerCase();
    if (keywords.some((k) => k && hay.includes(k))) return true;
    if (s.location) {
      const d = calculateHaversineDistance(s.location[0], s.location[1], r.center[0], r.center[1]);
      if (d <= r.radiusMeters) return true;
    }
  }

  // ステップに座標が無い場合のフォールバック：ポリライン全体で近傍判定
  for (const [lat, lng] of route.coordinates) {
    const d = calculateHaversineDistance(lat, lng, r.center[0], r.center[1]);
    if (d <= r.radiusMeters) return true;
  }
  return false;
}

function formatTime(h: number, m: number): string {
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatDays(days: number[]): string {
  const names = ['日', '月', '火', '水', '木', '金', '土'];
  if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return '平日';
  if (days.length === 2 && days.includes(0) && days.includes(6)) return '土日';
  return days
    .slice()
    .sort()
    .map((d) => names[d])
    .join('・');
}

/** 全3件の現在ステータスを返す（ルート未指定でも「時間帯のみ」の表示に使える） */
export function checkTimeRestrictions(route: RouteResult | null, at: Date = new Date()): TimeRestrictionStatus[] {
  return TIME_RESTRICTIONS.map((r) => {
    const activeNow = isActiveAt(r, at);
    const onRoute = isOnRoute(r, route);
    const blocked = activeNow && onRoute;
    const when = `${formatDays(r.days)} ${formatTime(r.startHour, r.startMinute)}–${formatTime(r.endHour, r.endMinute)}`;
    let message: string;
    if (blocked) {
      message = `×通れません（今は規制時間帯：${when}）`;
    } else if (onRoute) {
      message = `○今は通れます（規制：${when}）`;
    } else if (activeNow) {
      message = `規制時間帯ですがルート上ではありません（${when}）`;
    } else {
      message = `○今は通れます（規制：${when}）`;
    }
    return { restriction: r, activeNow, onRoute, blocked, message };
  });
}
