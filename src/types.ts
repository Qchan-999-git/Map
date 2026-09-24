export type TravelMode = 'driving' | 'walking' | 'cycling';

export type DriverProfile = 'standard' | 'beginner' | 'elderly' | 'yutori' | 'expert';

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

export type WeatherCategory =
  | 'clear'
  | 'partly'
  | 'rain'
  | 'snow'
  | 'fog'
  | 'thunder'
  | 'other';

/** 地点ごとの天気（Open-Meteo の現在値 + 今後数時間の降水確率） */
export interface WeatherCondition {
  label: string; // 出発地 / 途中 / 目的地
  lat: number;
  lng: number;
  ok: boolean; // この地点の取得成功フラグ
  temperature: number | null; // ℃
  weatherCode: number | null; // WMO weather code
  precipitation: number | null; // mm/h（現在）
  windSpeed: number | null; // km/h（現在）
  precipitationProbability: number | null; // %（今後数時間の最大）
  category: WeatherCategory;
  isPrecipitating: boolean; // 現在 雨・雪などの降水あり
  isFreezingRisk: boolean; // 気温1℃以下 かつ 降水あり（凍結の恐れ）
  isWindy: boolean; // 風速30km/h以上
}

/** ルート全体の気象情報 */
export interface RouteWeather {
  start: WeatherCondition;
  midpoint: WeatherCondition;
  end: WeatherCondition;
  cautions: string[]; // 天候由来の注意文
  durationFactor: number; // 所要時間補正係数（定数から算出）
  fetchedAt: number;
  error?: boolean; // 全地点の取得に失敗した（表示のみ）
}

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
  estimatedDuration?: number; // 混雑・天候を反映した推定所要時間（seconds）
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
  weather?: RouteWeather | null; // null = 取得失敗（表示のみ）
  congestion?: CongestionAnalysis | null; // null = 混雑情報なし（表示のみ）
  accidents?: AccidentAnalysis | null; // null = 事故情報なし（表示のみ）
}

/** 区間ごとの混雑度 */
export type CongestionLevel = 'smooth' | 'moderate' | 'heavy';

/** 事故警告の深刻度 */
export type AccidentSeverity = 'warning' | 'critical';

/** 事故・危険区間の概要 */
export interface AccidentSegment {
  stepIndex: number;
  name: string;
  distance: number; // meters
  severity: AccidentSeverity;
  reason: string; // UI に出す根拠文（例: 合流部・シミュレーション・ユーザー報告）
}

/** ルート全体の事故警告解析結果 */
export interface AccidentAnalysis {
  segments: AccidentSegment[];
  hasAccident: boolean; // critical が1件以上あるか
  checkedAt: number;
  simulated: boolean; // テスト用シミュレーション由来を含むか
  provider: string; // 使用したプロバイダ名
}

/** 混雑区間の概要 */
export interface CongestionSegment {
  stepIndex: number;
  name: string;
  distance: number; // meters
  level: CongestionLevel;
}

/** ルート全体の混雑解析結果 */
export interface CongestionAnalysis {
  segments: CongestionSegment[];
  congestionFactor: number; // 混雑補正係数（>=1.0）
  adjustedDuration: number; // 混雑補正後の所要時間（seconds）
  estimated: boolean; // 推定値（時間帯からの推定）かどうか
  provider: string; // 使用したプロバイダ名
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
