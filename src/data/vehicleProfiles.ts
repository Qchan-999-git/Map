import { Car, CarFront, Truck, Bus, Bike } from 'lucide-react';
import type { VehicleProfile, VehicleType } from '../types';

/**
 * 車種情報（運転特性ベースの分類）
 * 見た目のボディタイプではなく「運転の難易度・注意点の違い」で分類する。
 */
export const VEHICLE_PROFILES: Record<VehicleType, VehicleProfile> = {
  kei: {
    type: 'kei',
    name: '軽自動車',
    group: '小型・軽量',
    description: '車体が小さく取り回しやすいが、高速合流や坂道ではパワー不足になりやすい',
    difficulty: 'easy',
    cautions: [
      '高速合流時の加速不足・車線併入に注意',
      '急な上り坂での速度低下に注意',
      '大型車などとの速度差に注意',
    ],
    speedFactor: 0.9,
  },
  standard: {
    type: 'standard',
    name: '普通車',
    group: '標準クラス',
    description: 'セダン・コンパクトなど、標準的な運転感覚の基準となるクラス',
    difficulty: 'standard',
    cautions: [
      '標準的な運転操作を心がける（特段の注意点はなし）',
    ],
    speedFactor: 1.0,
  },
  large: {
    type: 'large',
    name: 'ミニバン・SUV',
    group: '大型ボディ',
    description: '車幅・全長が大きく、車庫入れや狭い道での難易度が上がる',
    difficulty: 'challenging',
    cautions: [
      '車庫入れ・駐車で車幅感覚に注意',
      '狭い路地での離合・バックに注意',
      '内輪差による巻き込み・縁石への後輪乗り上げに注意',
    ],
    speedFactor: 0.95,
  },
  truck: {
    type: 'truck',
    name: 'トラック',
    group: '商用・大型車',
    description: '死角が大きく初心者には心理的負荷が高い。制動距離も長くなる',
    difficulty: 'hard',
    cautions: [
      '右左折時の死角（歩行者・二輪車）に特に注意',
      '制動距離が伸びるため車間距離を十分に確保',
      '高さ制限・重量規制のある道路は事前に確認',
    ],
    speedFactor: 0.85,
  },
  motorcycle: {
    type: 'motorcycle',
    name: 'バイク・原付',
    group: '二輪',
    description: '車とは全く別の挙動。すり抜けや巻き込み事故のリスクに注意',
    difficulty: 'standard',
    cautions: [
      '大型車の死角に入らない（巻き込み事故防止）',
      'すり抜け・車線変更時の接触に注意',
      '路面のオイル・砂・マンホール蓋でのスリップに注意',
    ],
    speedFactor: 1.0,
  },
};

export const VEHICLE_PROFILE_LIST: VehicleProfile[] = [
  VEHICLE_PROFILES.kei,
  VEHICLE_PROFILES.standard,
  VEHICLE_PROFILES.large,
  VEHICLE_PROFILES.truck,
  VEHICLE_PROFILES.motorcycle,
];

export const VEHICLE_ICONS: Record<VehicleType, typeof Car> = {
  kei: CarFront,
  standard: Car,
  large: Bus,
  truck: Truck,
  motorcycle: Bike,
};