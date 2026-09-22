import { DriverProfile } from '../types';

export interface DriverProfileConfig {
  id: DriverProfile;
  label: string;
  description: string;
  // 将来のルート採点用パラメータ（現段階では表示・保存のみに使用）
  rightTurnPenalty: number;
  narrowRoadPenalty: number;
  complexIntersectionPenalty: number;
  trunkRoadBonus: number;
  earlyGuidanceMeters: number;
}

export const DRIVER_PROFILES: DriverProfileConfig[] = [
  {
    id: 'standard',
    label: '標準',
    description: '通常の最短時間ルート',
    rightTurnPenalty: 0,
    narrowRoadPenalty: 0,
    complexIntersectionPenalty: 0,
    trunkRoadBonus: 0,
    earlyGuidanceMeters: 300,
  },
  {
    id: 'beginner',
    label: '初心者',
    description: '右折・合流を避け広い道優先',
    rightTurnPenalty: 10,
    narrowRoadPenalty: 8,
    complexIntersectionPenalty: 8,
    trunkRoadBonus: 5,
    earlyGuidanceMeters: 1500,
  },
  {
    id: 'elderly',
    label: '高齢者',
    description: '判断の猶予を大きく確保',
    rightTurnPenalty: 8,
    narrowRoadPenalty: 6,
    complexIntersectionPenalty: 6,
    trunkRoadBonus: 6,
    earlyGuidanceMeters: 2000,
  },
  {
    id: 'yutori',
    label: 'ゆとり優先',
    description: '左折中心・ゆとり車線変更',
    rightTurnPenalty: 12,
    narrowRoadPenalty: 10,
    complexIntersectionPenalty: 10,
    trunkRoadBonus: 8,
    earlyGuidanceMeters: 1500,
  },
  {
    id: 'expert',
    label: '上級者',
    description: '最速ルート優先・案内は簡潔に',
    rightTurnPenalty: 0,
    narrowRoadPenalty: 0,
    complexIntersectionPenalty: 0,
    trunkRoadBonus: 0,
    earlyGuidanceMeters: 300,
  },
];

export const DEFAULT_DRIVER_PROFILE: DriverProfile = 'standard';

export function getDriverProfileConfig(id: DriverProfile): DriverProfileConfig {
  return DRIVER_PROFILES.find((p) => p.id === id) ?? DRIVER_PROFILES[0];
}
