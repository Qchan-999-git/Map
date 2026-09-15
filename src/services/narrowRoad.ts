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
 * - 道路名ベースのヒューリスティック区間を OSM タグ（width / highway / lanes / oneway）と照合する
 * - 判定順序: width タグ最優先 → highway + lanes 推定 → 不明（ペナルティ課さない）
 * - 失敗・タイムアウト時は入力をそのまま返す（フォールバック）
 * ※ 1 ルート計算につき 1 回だけ呼び出すこと（候補ごとには呼ばない）
 */
export async function verifyNarrowRoads(
  analysis: NarrowRoadAnalysis,
  coordinates: [number, number][],
  threshold: number,
  signal?: AbortSignal,
  steps?: RouteStep[]
): Promise<NarrowRoadAnalysis> {
  if (!analysis || analysis.segments.length === 0 || coordinates.length < 2) return analysis;
  try {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const [lat, lng] of coordinates) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    // bbox を 0.05 度程度に制限（elevated.ts と同様）
    const cLat = (minLat + maxLat) / 2;
    const cLng = (minLng + maxLng) / 2;
    const d = 0.025;
    const bbox = `${cLat - d},${cLng - d},${cLat + d},${cLng + d}`;
    const q =
      `[out:json][timeout:6];` +
      `(way["width"](${bbox});` +
      `way["highway"~"^(residential|unclassified|service|track|living_street)$"](${bbox}););` +
      `out body geom 500;`;
    const res = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`,
      { signal }
    );
    if (!res.ok) return analysis;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elements = (data?.elements ?? []) as any[];
    if (!Array.isArray(elements) || elements.length === 0) return analysis;

    const ways: MatchedWay[] = elements
      .filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any) => e?.type === 'way' && Array.isArray(e.geometry) && e.geometry.length > 0
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((e: any) => {
        const g = e.geometry;
        const mid = g[Math.floor(g.length / 2)];
        return {
          name: (e.tags?.name || '').trim(),
          point: [mid.lat, mid.lng] as [number, number],
          tags: (e.tags ?? {}) as Record<string, string>,
        };
      });

    if (ways.length === 0) return analysis;

    const segments: NarrowSegment[] = [];
    for (const seg of analysis.segments) {
      const loc = resolveSegmentLocation(seg, steps);
      const match = matchWay(seg, loc, ways);
      if (!match) {
        segments.push(seg);
        continue;
      }
      const resolved = resolveAgainstTags(match.tags, threshold);
      if (resolved.level === 'narrow' || resolved.level === 'very_narrow') {
        segments.push({
          ...seg,
          level: resolved.level,
          estimatedWidth: resolved.width ?? seg.estimatedWidth,
          oneway: resolved.oneway,
          reason: resolved.reason,
        });
      }
      // wide / unknown はペナルティ対象から除外（判定順序3: ペナルティを課さない）
    }

    return {
      segments,
      totalNarrowDistance: Math.round(segments.reduce((a, s) => a + s.distance, 0) * 10) / 10,
      narrowRatio:
        analysis.totalNarrowDistance > 0 && analysis.narrowRatio > 0
          ? Math.round(
              (segments.reduce((a, s) => a + s.distance, 0) /
                (analysis.totalNarrowDistance / analysis.narrowRatio)) *
                1000
            ) / 1000
          : 0,
      verified: true,
    };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return analysis;
    console.warn('Overpass narrow-road verify failed:', err);
    return analysis;
  }
}

interface MatchedWay {
  name: string;
  point: [number, number];
  tags: Record<string, string>;
}

interface ResolvedTags {
  level: NarrowLevel;
  width?: number;
  oneway: boolean;
  reason: string;
}

const NARROW_HIGHWAY_PATTERN = /^(residential|unclassified|service|track|living_street)$/i;

function resolveSegmentLocation(seg: NarrowSegment, steps?: RouteStep[]): [number, number] | null {
  return steps?.[seg.stepIndex]?.location ?? null;
}

function matchWay(seg: NarrowSegment, loc: [number, number] | null, ways: MatchedWay[]): MatchedWay | null {
  const namedWays = seg.name && seg.name !== '名称のない道路'
    ? ways.filter((w) => w.name === seg.name && seg.name.length > 0)
    : [];
  if (namedWays.length > 0) return nearestWay(namedWays, loc);
  if (loc) {
    const nearby = ways.filter((w) => distanceMeters(loc, w.point) <= 60);
    if (nearby.length > 0) return nearestWay(nearby, loc);
  }
  return null;
}

function nearestWay(ways: MatchedWay[], loc: [number, number] | null): MatchedWay {
  if (!loc) return ways[0];
  let best = ways[0];
  let bestDist = Infinity;
  for (const w of ways) {
    const d = distanceMeters(loc, w.point);
    if (d < bestDist) {
      bestDist = d;
      best = w;
    }
  }
  return best;
}

function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371e3;
  const phi1 = (a[0] * Math.PI) / 180;
  const phi2 = (b[0] * Math.PI) / 180;
  const dPhi = ((b[0] - a[0]) * Math.PI) / 180;
  const dLambda = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function parseWidth(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** highway 種別と車線数からの幅員推定値（m）。不明なら null。 */
function estimateWidth(highway: string | undefined, lanes: string | undefined): number | null {
  if (highway && NARROW_HIGHWAY_PATTERN.test(highway)) {
    switch (highway) {
      case 'service':
        return 3.5;
      case 'track':
        return 3.0;
      case 'living_street':
        return 3.5;
      case 'residential':
        return 4.2;
      case 'unclassified':
        return 4.5;
      default:
        break;
    }
  }
  if (lanes === '1') return 3.0;
  return null;
}

/**
 * OSM タグに対する狭路判定。
 * 1. width タグ最優先（閾値と直接比較）
 * 2. highway 種別 + lanes から推定
 * 3. どちらも無ければ unknown（ペナルティを課さない）
 */
function resolveAgainstTags(tags: Record<string, string>, threshold: number): ResolvedTags {
  const highway = tags.highway;
  const lanes = tags.lanes;
  const oneway = tags.oneway === 'yes';

  const width = parseWidth(tags.width);
  if (width !== null) {
    if (width >= threshold) {
      return { level: 'wide', width, oneway, reason: `width タグ ${width}m（閾値以上）` };
    }
    if (width < threshold * 0.7) {
      return { level: 'very_narrow', width, oneway, reason: `width タグ ${width}m` };
    }
    return { level: 'narrow', width, oneway, reason: `width タグ ${width}m` };
  }

  if (NARROW_HIGHWAY_PATTERN.test(highway ?? '')) {
    const est = estimateWidth(highway, lanes);
    if (est !== null) {
      if (est >= threshold && lanes !== '1') {
        return { level: 'wide', oneway, reason: `${highway} 種別（幅員推定 ${est}m・閾値以上）` };
      }
      return {
        level: 'narrow',
        width: est,
        oneway,
        reason: `${highway} 種別${lanes === '1' ? '・片側1車線' : `（幅員推定 ${est}m）`}`,
      };
    }
  }
  return { level: 'unknown', oneway, reason: 'タグ情報なし' };
}