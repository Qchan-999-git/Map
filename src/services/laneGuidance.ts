import { DriverProfile, RouteStep } from '../types';
import { getDriverProfileConfig } from '../data/driverProfiles';

export type LaneDirection = 'left' | 'right' | 'straight' | 'merge';

export interface LaneAdvice {
  stepIndex: number;
  direction: LaneDirection;
  message: string;
  earlyMessage: string;
  distanceToManeuver: number; // meters from route start to this maneuver
  roadName: string;
}

/**
 * Builds early lane advices from OSRM steps.
 * For each turn/merge/ramp step, generates one advice with:
 * - early notice at profile.earlyGuidanceMeters (1500-2000m for yutori)
 * - just-before notice at 300m
 * MVP is static (route-start based); live GPS countdown is next step.
 */
export function buildLaneAdvices(
  steps: RouteStep[],
  profile: DriverProfile
): LaneAdvice[] {
  const cfg = getDriverProfileConfig(profile);
  const advices: LaneAdvice[] = [];
  let cumulative = 0;

  steps.forEach((step, idx) => {
    const dist = step.distance || 0;
    // maneuver point is at end of this step segment
    const maneuverAt = cumulative + dist;
    cumulative = maneuverAt;

    const dir = toLaneDirection(step.turnType);
    if (dir === null) return;
    // skip depart/arrive
    if (idx === 0 || /到着/.test(step.instruction)) return;

    advices.push({
      stepIndex: idx,
      direction: dir,
      message: laneMessage(dir, step),
      earlyMessage: earlyLaneMessage(dir, step, cfg.earlyGuidanceMeters),
      distanceToManeuver: Math.round(maneuverAt),
      roadName: step.name || '',
    });
  });

  return advices;
}

function toLaneDirection(
  turnType?: RouteStep['turnType']
): LaneDirection | null {
  if (turnType === 'right') return 'right';
  if (turnType === 'left') return 'left';
  if (turnType === 'merge' || turnType === 'ramp') return 'merge';
  if (turnType === 'straight') return 'straight';
  return null;
}

function laneMessage(dir: LaneDirection, step: RouteStep): string {
  const road = step.name ? `「${step.name}」` : '';
  switch (dir) {
    case 'right':
      return `次は右折です${road}。早めに右寄り車線へ`;
    case 'left':
      return `次は左折です${road}。早めに左寄り車線へ`;
    case 'merge':
      return `この先 合流します${road}。速度と車間を意識して`;
    case 'straight':
      return `この先 直進です${road}。車線キープでOK`;
  }
}

function earlyLaneMessage(
  dir: LaneDirection,
  step: RouteStep,
  earlyMeters: number
): string {
  const km = earlyMeters >= 1000 ? `${earlyMeters / 1000}km` : `${earlyMeters}m`;
  const road = step.name ? `「${step.name}」` : '';
  switch (dir) {
    case 'right':
      return `${km}手前：右折${road}に備え右2車線キープ`;
    case 'left':
      return `${km}手前：左折${road}に備え左2車線キープ`;
    case 'merge':
      return `${km}手前：合流${road}あり。心の準備を`;
    case 'straight':
      return `${km}先まで直進${road}。慌てずキープ`;
  }
}

/**
 * Speaks text via Web Speech API (ja-JP). No-op if unsupported.
 */
export function speakAdvice(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Finds traveled distance along route coordinates by nearest-point snap.
 * Returns meters from route start to closest point.
 */
export function findTraveledMeters(
  current: { lat: number; lng: number },
  coordinates: [number, number][]
): number {
  if (coordinates.length < 2) return 0;
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < coordinates.length; i++) {
    const d = haversineMeters(current.lat, current.lng, coordinates[i][0], coordinates[i][1]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  // If far off-route (>200m), treat as 0 to avoid false triggers
  if (bestDist > 200) return 0;
  let traveled = 0;
  for (let i = 1; i <= bestIdx; i++) {
    traveled += haversineMeters(
      coordinates[i - 1][0],
      coordinates[i - 1][1],
      coordinates[i][0],
      coordinates[i][1]
    );
  }
  return traveled;
}

/**
 * Remaining meters to maneuver (negative = passed).
 */
export function remainingToManeuver(advice: LaneAdvice, traveledMeters: number): number {
  return Math.round(advice.distanceToManeuver - traveledMeters);
}
