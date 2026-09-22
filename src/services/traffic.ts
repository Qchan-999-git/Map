import { CongestionAnalysis, CongestionLevel, CongestionSegment, RouteResult } from '../types';
import { isTrunkLike } from './mapService';

/**
 * 交通混雑の解析。
 * 無料・APIキー不要で使えるリアルタイム渋滞APIは現状ほぼ無いため、
 * プロバイダを差し替えられる TrafficProvider インターフェースを用意し、
 * デフォルトは「曜日・時間帯と道路種別から推定する」EstimatedTrafficProvider を使う。
 */

// ---- 混雑度ごとの所要時間補正係数（調整しやすいよう定数としてまとめる） ----
export const TRAFFIC_SMOOTH_FACTOR = 1.0;
export const TRAFFIC_MODERATE_FACTOR = 1.2;
export const TRAFFIC_HEAVY_FACTOR = 1.5;
// ---- ストレススコア加点（初心者・高齢者・ゆとりのみ） ----
export const TRAFFIC_STRESS_SCORE_ADD = 2;

export function levelFactor(level: CongestionLevel): number {
  switch (level) {
    case 'moderate':
      return TRAFFIC_MODERATE_FACTOR;
    case 'heavy':
      return TRAFFIC_HEAVY_FACTOR;
    default:
      return TRAFFIC_SMOOTH_FACTOR;
  }
}

/** 交通情報プロバイダ。APIキー不要の推定版と、外部API版を同じ形で扱う。 */
export interface TrafficProvider {
  readonly id: string;
  readonly description: string;
  /** このプロバイダが利用可能か（外部APIはキー・プロキシ設定がある場合のみ true） */
  isAvailable(): boolean;
  /** ルートの混雑解析を返す。失敗時は呼び出し側で推定プロバイダにフォールバックする。 */
  analyze(route: RouteResult, at?: Date): Promise<CongestionAnalysis>;
}

// 首都高・高速道路の判定パターン
const EXPRESSWAY_PATTERN =
  /首都高|高速|C1|C2|湾岸|自動車道|有料道路|上野線|渋谷線|新宿線|池袋線|八重洲線|都心環状|中央環状/i;

type Period = 'weekday-morning' | 'weekday-evening' | 'weekend-day' | 'normal';

/** 現在の曜日・時間帯から推定基準となる期間を返す */
export function classifyPeriod(at: Date): Period {
  const day = at.getDay(); // 0=日
  const minutes = at.getHours() * 60 + at.getMinutes();
  const isWeekend = day === 0 || day === 6;
  if (!isWeekend) {
    if (minutes >= 7 * 60 && minutes < 9 * 60) return 'weekday-morning';
    if (minutes >= 17 * 60 && minutes < 19 * 60) return 'weekday-evening';
  }
  if (isWeekend && minutes >= 10 * 60 && minutes < 17 * 60) return 'weekend-day';
  return 'normal';
}

/** 区間の混雑度を推定する（時間帯 × 道路種別） */
export function estimateLevel(period: Period, name: string): CongestionLevel {
  const isExpress = EXPRESSWAY_PATTERN.test(name);
  const isTrunk = isTrunkLike(name);
  const important = isExpress || isTrunk;

  switch (period) {
    case 'weekday-morning':
    case 'weekday-evening':
      // 朝夕の通勤ピークは主要路・首都高で混雑。一般路もやや混雑。
      return important ? 'heavy' : 'moderate';
    case 'weekend-day':
      // 週末昼の行楽渋滞。首都高・高速で混雑、幹線でやや混雑、生活道路は順調。
      return isExpress ? 'heavy' : isTrunk ? 'moderate' : 'smooth';
    default:
      return 'smooth';
  }
}

/**
 * 曜日・時間帯と道路種別から混雑度を推定するデフォルトプロバイダ。
 * 実測ではないため、UI で必ず「時間帯からの推定」と明記する。
 */
export class EstimatedTrafficProvider implements TrafficProvider {
  readonly id = 'estimated';
  readonly description = '曜日・時間帯と道路種別からの推定';

  isAvailable(): boolean {
    return true;
  }

  async analyze(route: RouteResult, at: Date = new Date()): Promise<CongestionAnalysis> {
    const period = classifyPeriod(at);
    const segments: CongestionSegment[] = [];
    let totalDistance = 0;
    let weightedFactor = 0;

    route.steps.forEach((s, idx) => {
      const dist = s.distance || 0;
      totalDistance += dist;
      const level = estimateLevel(period, s.name || '');
      weightedFactor += dist * levelFactor(level);
      if (level !== 'smooth') {
        segments.push({
          stepIndex: idx,
          name: s.name || s.instruction || '名称のない道路',
          distance: Math.round(dist),
          level,
        });
      }
    });

    const congestionFactor = totalDistance > 0 ? weightedFactor / totalDistance : 1;
    return {
      segments,
      congestionFactor: Math.round(congestionFactor * 100) / 100,
      adjustedDuration: Math.round(route.totalDuration * congestionFactor),
      estimated: true,
      provider: this.id,
    };
  }
}

/**
 * 外部交通API用のプロバイダ枠。
 *
 * 方針: APIキー（例 TOMTOM_API_KEY）をフロントに露出しない。
 * このViteアプリはクライアントのみで動作するため、キー参照は
 * サーバー側（既存の express 依存を利用した /api/traffic プロキシ）でのみ行う。
 *
 * TODO(未実装):
 *   1. server.js（express）に /api/traffic エンドポイントを追加し、
 *      サーバー側の process.env.TOMTOM_API_KEY から TomTom Traffic API を呼び出す。
 *   2. ここでは fetch('/api/traffic?bbox=...') を呼んで、取得結果を
 *      CongestionAnalysis に変換する。
 *   ※ import.meta.env.VITE_API_TRAFFIC が 'true' のときのみ有効化される想定。
 */
export class ApiTrafficProvider implements TrafficProvider {
  readonly id = 'api';
  readonly description = '外部交通API（未実装・要サーバープロキシ）';

  isAvailable(): boolean {
    try {
      return import.meta.env.VITE_API_TRAFFIC === 'true';
    } catch {
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async analyze(_route: RouteResult, _at?: Date): Promise<CongestionAnalysis> {
    // TODO: fetch('/api/traffic') を実装したらここを置き換える
    throw new Error('ApiTrafficProvider is not implemented yet');
  }
}

const estimatedProvider = new EstimatedTrafficProvider();
const apiProvider = new ApiTrafficProvider();

/** 利用可能なプロバイダを返す（APIが使えなければ推定版） */
export function getTrafficProvider(): TrafficProvider {
  return apiProvider.isAvailable() ? apiProvider : estimatedProvider;
}

/**
 * ルートの混雑解析を実行する。外部APIが失敗した場合は推定版にフォールバックし、
 * いかなる場合もルート検索自体を失敗させない。
 */
export async function analyzeTraffic(
  route: RouteResult,
  at: Date = new Date()
): Promise<CongestionAnalysis | null> {
  if (route.mode !== 'driving' || route.steps.length === 0) return null;
  const provider = getTrafficProvider();
  try {
    return await provider.analyze(route, at);
  } catch (err) {
    console.warn('Traffic provider failed, falling back to estimation:', err);
    return estimatedProvider.analyze(route, at);
  }
}