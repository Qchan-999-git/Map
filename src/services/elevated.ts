import { RouteStep } from '../types';

export interface ElevatedInfo {
  usesHighway: boolean;
  highwayNames: string[];
  hasJunction: boolean;
  level: 'highway' | 'surface';
}

export interface HighwayRange {
  startMeters: number;
  endMeters: number;
  name: string;
}

export interface JunctionDetail {
  stepIndex: number;
  name: string;
  distanceToManeuver: number;
  instruction: string;
}

export interface ElevatedVerify {
  state: 'unknown' | 'checking' | 'confirmed' | 'none';
  hasBridge?: boolean;
  hasTunnel?: boolean;
}

export const HIGHWAY_PATTERN = /高速|首都高|自動車道|有料道路|\bC1\b|\bC2\b|湾岸|環状線/i;
const JUNCTION_PATTERN = /JCT|ジャンクション|分岐|合流|ランプ/i;

/**
 * Heuristic elevated/highway detection from OSRM step names.
 * MVP: no Overpass API; uses road-name patterns + merge presence.
 * Full bridge/tunnel tag lookup is deferred.
 */
export function analyzeElevated(steps: RouteStep[]): ElevatedInfo {
  const highwayNames: string[] = [];
  let hasJunction = false;

  for (const s of steps) {
    const text = `${s.name} ${s.instruction}`;
    if (HIGHWAY_PATTERN.test(text) && s.name && !highwayNames.includes(s.name)) {
      highwayNames.push(s.name);
    }
    if (
      JUNCTION_PATTERN.test(text) ||
      s.turnType === 'merge' ||
      s.turnType === 'ramp'
    ) {
      hasJunction = true;
    }
  }

  const usesHighway = highwayNames.length > 0;
  return {
    usesHighway,
    highwayNames: highwayNames.slice(0, 3),
    hasJunction,
    level: usesHighway ? 'highway' : 'surface',
  };
}

/**
 * Computes highway segments as cumulative distance ranges.
 */
export function computeHighwayRanges(steps: RouteStep[]): HighwayRange[] {
  const ranges: HighwayRange[] = [];
  let cumulative = 0;
  for (const s of steps) {
    const dist = s.distance || 0;
    const start = cumulative;
    cumulative += dist;
    if (HIGHWAY_PATTERN.test(`${s.name} ${s.instruction}`)) {
      const last = ranges[ranges.length - 1];
      if (last && last.name === (s.name || '') && Math.abs(last.endMeters - start) < 1) {
        last.endMeters = cumulative;
      } else {
        ranges.push({ startMeters: start, endMeters: cumulative, name: s.name || '高速' });
      }
    }
  }
  return ranges;
}

/**
 * Extracts JCT / junction details with distances.
 */
export function extractJunctions(steps: RouteStep[]): JunctionDetail[] {
  const out: JunctionDetail[] = [];
  let cumulative = 0;
  steps.forEach((s, idx) => {
    const dist = s.distance || 0;
    const maneuverAt = cumulative + dist;
    cumulative = maneuverAt;
    const text = `${s.name} ${s.instruction}`;
    if (
      /JCT|ジャンクション/i.test(text) ||
      (JUNCTION_PATTERN.test(text) && HIGHWAY_PATTERN.test(text))
    ) {
      out.push({
        stepIndex: idx,
        name: s.name || s.instruction,
        distanceToManeuver: Math.round(maneuverAt),
        instruction: s.instruction,
      });
    }
  });
  return out.slice(0, 3);
}

/**
 * Level at traveled distance.
 */
export function levelAt(
  traveledMeters: number,
  ranges: HighwayRange[]
): 'highway' | 'surface' {
  return ranges.some((r) => traveledMeters >= r.startMeters && traveledMeters <= r.endMeters)
    ? 'highway'
    : 'surface';
}

/**
 * Verifies bridge/tunnel tags via Overpass API around route center.
 * Timeout-guarded; falls back to unknown on failure.
 */
export async function verifyElevatedTags(
  coordinates: [number, number][],
  signal?: AbortSignal
): Promise<ElevatedVerify> {
  if (coordinates.length === 0) return { state: 'unknown' };
  try {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const [lat, lng] of coordinates) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    // Clamp bbox size to avoid huge queries (~0.05deg)
    const cLat = (minLat + maxLat) / 2;
    const cLng = (minLng + maxLng) / 2;
    const d = 0.025;
    const bbox = `${cLat - d},${cLng - d},${cLat + d},${cLng + d}`;
    const q = `[out:json][timeout:6];(way["bridge"](${bbox});way["tunnel"](${bbox}););out tags 20;`;
    const res = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`,
      { signal }
    );
    if (!res.ok) return { state: 'unknown' };
    const data = await res.json();
    const elements = (data?.elements ?? []) as { tags?: Record<string, string> }[];
    if (elements.length === 0) return { state: 'none' };
    const hasBridge = elements.some((e) => e.tags?.bridge && e.tags.bridge !== 'no');
    const hasTunnel = elements.some((e) => e.tags?.tunnel && e.tags.tunnel !== 'no');
    return { state: 'confirmed', hasBridge, hasTunnel };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return { state: 'unknown' };
    console.warn('Overpass verify failed:', err);
    return { state: 'unknown' };
  }
}
