import { RouteStep } from '../types';

export interface ShutoMergeInfo {
  stepIndex: number;
  roadName: string;
  isShuto: boolean;
  distanceToManeuver: number; // meters from route start
  instruction: string;
  location?: [number, number]; // [lat, lng]
}

const SHUTO_PATTERN = /首都高|C1|C2|湾岸|上野線|渋谷線|新宿線|池袋線|八重洲線|都心環状|中央環状/i;

/**
 * Finds merge/ramp steps, flagging Shuto Expressway ones.
 * Cumulative distance matches laneGuidance.buildLaneAdvices.
 */
export function findMerges(steps: RouteStep[]): ShutoMergeInfo[] {
  const merges: ShutoMergeInfo[] = [];
  let cumulative = 0;

  steps.forEach((step, idx) => {
    const dist = step.distance || 0;
    const maneuverAt = cumulative + dist;
    cumulative = maneuverAt;

    if (step.turnType !== 'merge' && step.turnType !== 'ramp') return;
    if (idx === 0 || /到着/.test(step.instruction)) return;

    merges.push({
      stepIndex: idx,
      roadName: step.name || '',
      isShuto: SHUTO_PATTERN.test(`${step.name} ${step.instruction}`),
      distanceToManeuver: Math.round(maneuverAt),
      instruction: step.instruction,
      location: step.location,
    });
  });

  return merges;
}

export function isShutoName(name: string): boolean {
  return SHUTO_PATTERN.test(name);
}
