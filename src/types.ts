export type TravelMode = 'driving' | 'walking' | 'cycling';

export type DriverProfile = 'standard' | 'beginner' | 'elderly' | 'yutori';

export type VehicleType = 'kei' | 'standard' | 'large' | 'truck' | 'motorcycle';

export type VehicleDifficulty = 'easy' | 'standard' | 'challenging' | 'hard';

export interface VehicleProfile {
  type: VehicleType;
  name: string;
  group: string;
  description: string;
  difficulty: VehicleDifficulty;
  cautions: string[];
  speedFactor: number;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

export interface MapLayerConfig {
  id: string;
  name: string;
  category: 'standard' | 'japan' | 'satellite' | 'dark' | 'terrain';
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string[];
  thumbnailColor?: string;
}

export type SpotCategory = 
  | 'favorite'
  | 'food'
  | 'cafe'
  | 'sightseeing'
  | 'station'
  | 'hotel'
  | 'shopping'
  | 'work'
  | 'other';

export interface SavedSpot {
  id: string;
  title: string;
  description?: string;
  lat: number;
  lng: number;
  address?: string;
  category: SpotCategory;
  color: string;
  elevation?: number;
  createdAt: number;
}

export interface SearchResultItem {
  place_id: number | string;
  osm_id?: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
  icon?: string;
}

export type NarrowLevel = 'unknown' | 'wide' | 'narrow' | 'very_narrow';

export interface NarrowSegment {
  stepIndex: number;
  name: string;          // 名前なしの場合は '名称のない道路'
  distance: number;      // meters
  level: NarrowLevel;
  estimatedWidth?: number; // width タグがあった場合のみ
  oneway?: boolean;        // oneway=yes の場合はペナルティ減衰
  reason: string;        // 'width タグ 3.2m' 等、UI に出す根拠文
}

export interface NarrowRoadAnalysis {
  segments: NarrowSegment[];
  totalNarrowDistance: number;  // meters
  narrowRatio: number;          // 0.0 - 1.0（総距離に対する比率）
  verified: boolean;            // Overpass 検証済みなら true
}

export interface RouteStep {
  instruction: string;
  distance: number; // meters
  duration: number; // seconds
  name: string;
  turnType?: 'right' | 'left' | 'straight' | 'merge' | 'ramp' | 'other';
  roadClass?: string;
  location?: [number, number]; // [lat, lng] maneuver point
  narrowLevel?: NarrowLevel;
  estimatedWidth?: number;
}

export interface RouteResult {
  coordinates: [number, number][]; // [lat, lng]
  totalDistance: number; // meters
  totalDuration: number; // seconds
  steps: RouteStep[];
  mode: TravelMode;
  vehicleType?: VehicleType;
  cautions?: string[]; // 車種・走行モード別の運転注意ポイント
  profile?: DriverProfile;
  stressScore?: number;
  rightTurnCount?: number;
  leftTurnCount?: number;
  alternatives?: RouteResult[];
  narrowRoadAnalysis?: NarrowRoadAnalysis;
}

export interface ClickedLocationInfo {
  lat: number;
  lng: number;
  address?: string;
  elevation?: number | null;
  loading?: boolean;
}

export interface ParkingSpot {
  id: string;
  lat: number;
  lng: number;
  name: string;
  capacity?: number;
  fee?: string;
  parkingType?: string;
  distance: number;
}
