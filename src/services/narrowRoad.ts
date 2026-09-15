import { NarrowLevel, NarrowRoadAnalysis, NarrowSegment, RouteStep, VehicleType } from '../types';
import { isTrunkLike } from './mapService';

/**
 * 狭路回避機能
 *
 * ルート上の区間が OSM タグに基づいて「狭い道」かを判定する。
 * - 第1段：道路名ベースのヒューリスティック（同期・即時、失敗しないフォールバック層）
 * - 第2段：Overpass API によるタグ検証（非同期・精度向上、失敗時は入力をそのまま返す）
 */

/**
 * 車種別の狭路回避幅員閾値（m）。motorcycle は null（機能無効）。
 */
export const NARROW_THRESHOLD_BY_VEHICLE: Record<VehicleType, number | null> = {
  kei: 3.5,
  standard: 4.0,
  large: 4.5,
  truck: 5.5,
  motorcycle: null,
};

export function getNarrowThresholdForVehicle(type: VehicleType): number | null {
  return NARROW_THRESHOLD_BY_VEHICLE[type];
}

/**
 * 第1段：OSM の道路名から狭路候補を同期判定する。
 * Overpass が失敗しても必ず動くフォールバック層。
 *
 * - 名前のない道路（OSM 上の生活道路・路地）→ 狭路候補
 * - 国道・県道・バイパス等の幹線 → 狭路ではない
 */
export function analyzeNarrowRoads(
  steps: RouteStep[],
  threshold: number
): NarrowRoadAnalysis {
  const segments: NarrowSegment[] = [];
  let totalNarrowDistance = 0;
  const totalDistance = steps.reduce((acc, s) => acc + (s.distance || 0), 0);

  steps.forEach((s, idx) => {
    const dist = s.distance || 0;
    if (dist <= 0) return;
    if (isTrunkLike(s.name)) return;

    const nameEmpty = !s.name || s.name.trim() === '';
    if (nameEmpty) {
      segments.push({
        stepIndex: idx,
        name: '名称のない道路',
        distance: dist,
        level: 'narrow' as NarrowLevel,
        reason: '名称のない道路（生活道路の可能性）',
      });
      totalNarrowDistance += dist;
    }
  });

  return {
    segments,
    totalNarrowDistance: Math.round(totalNarrowDistance * 10) / 10,
    narrowRatio:
      totalDistance > 0
        ? Math.round((totalNarrowDistance / totalDistance) * 1000) / 1000
        : 0,
    verified: false,
  };
}

/**
 * 第2段：Overpass API によるタグ検証（非同期）。
 * 失敗・タイムアウト時は入力をそのまま返す（フォールバック）。
 * ※ bbox は 0.05 度程度・[timeout:6]・AbortSignal 対応（elevated.ts と同様）
 */
export async function verifyNarrowRoads(
  analysis: NarrowRoadAnalysis,
  coordinates: [number, number][],
  threshold: number,
  signal?: AbortSignal
): Promise<NarrowRoadAnalysis> {
  // 第2段実装（Overpass 検証）は第8ステップで追加
  return analysis;
}