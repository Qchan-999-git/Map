import { RouteWeather, WeatherCategory, WeatherCondition } from '../types';

/**
 * 気象情報の取得（Open-Meteo API、APIキー不要）
 * 公式ドキュメント: https://open-meteo.com/en/docs
 * - current:  現在の気温・降水量・天気コード・風速
 * - hourly:   今後数時間の降水確率（precipitation_probability）
 */
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** 同一地点のキャッシュ有効期限（ミリ秒）: 10分 */
export const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;

// ---- 所要時間補正係数（調整しやすいよう定数としてまとめる） ----
export const WEATHER_DURATION_RAIN_FACTOR = 1.1;
export const WEATHER_DURATION_SNOW_OR_FREEZE_FACTOR = 1.3;
// ---- 判定閾値 ----
export const WEATHER_STRONG_WIND_KMH = 30;
export const WEATHER_FREEZE_TEMP_THRESHOLD_C = 1;
// ---- ストレススコア加点（初心者・高齢者・ゆとりのみ） ----
export const WEATHER_STRESS_SCORE_ADD = 3;

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  hourly?: {
    time?: string[];
    precipitation_probability?: (number | null)[];
  };
}

/** WMO weather code を代表カテゴリへ分類 */
function weatherCategory(code: number | null): WeatherCategory {
  if (code === null) return 'other';
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'partly';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 56 && code <= 67) return 'rain'; // 着氷性の霧雨・凍雨を含む雨
  if (code >= 71 && code <= 77) return 'snow';
  if (code === 85 || code === 86) return 'snow';
  if (code === 95 || code === 96 || code === 99) return 'thunder';
  if (code >= 51 && code <= 55) return 'rain';
  if (code >= 80 && code <= 82) return 'rain';
  return 'other';
}

/** 取得結果から UI・補正に使う判定フラグ付き WeatherCondition を生成 */
function buildCondition(
  label: string,
  lat: number,
  lng: number,
  data: OpenMeteoResponse
): WeatherCondition {
  const weatherCodeRaw = data.current?.weather_code ?? null;
  const category = weatherCategory(weatherCodeRaw);
  const temperature = data.current?.temperature_2m ?? null;
  const precipitation = data.current?.precipitation ?? null;
  const windSpeed = data.current?.wind_speed_10m ?? null;

  const isRainyCategory = category === 'rain' || category === 'thunder';
  const isSnowyCategory = category === 'snow';
  const isPrecipitating =
    (category === 'fog'
      ? false
      : (temperature !== null && temperature <= WEATHER_FREEZE_TEMP_THRESHOLD_C) ||
        isRainyCategory ||
        isSnowyCategory) && (precipitation ?? 0) > 0;
  const isFreezingRisk =
    temperature !== null &&
    temperature <= WEATHER_FREEZE_TEMP_THRESHOLD_C &&
    (isPrecipitating || (precipitation ?? 0) > 0);
  const isWindy = windSpeed !== null && windSpeed >= WEATHER_STRONG_WIND_KMH;

  // 今後数時間（3時間）の降水確率の最大値
  const probabilities = data.hourly?.precipitation_probability ?? [];
  const precipitationProbability =
    probabilities.length > 0
      ? Math.round(Math.max(...probabilities.slice(0, 3).filter((v): v is number => v !== null)))
      : null;

  return {
    label,
    lat,
    lng,
    ok: true,
    temperature,
    weatherCode: weatherCodeRaw,
    precipitation,
    windSpeed,
    precipitationProbability,
    category,
    isPrecipitating,
    isFreezingRisk,
    isWindy,
  };
}

function failedCondition(label: string, lat: number, lng: number): WeatherCondition {
  return {
    label,
    lat,
    lng,
    ok: false,
    temperature: null,
    weatherCode: null,
    precipitation: null,
    windSpeed: null,
    precipitationProbability: null,
    category: 'other',
    isPrecipitating: false,
    isFreezingRisk: false,
    isWindy: false,
  };
}

/** 取得できなかった地点のプレースホルダー */
// 同一地点（約100m精度）の結果を10分キャッシュ
const weatherCache = new Map<string, { data: WeatherCondition; fetchedAt: number }>();

export async function fetchWeatherPoint(
  lat: number,
  lng: number,
  label: string
): Promise<WeatherCondition> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < WEATHER_CACHE_TTL_MS) {
    return { ...cached.data, label };
  }

  try {
    const url = new URL(OPEN_METEO_URL);
    url.searchParams.set('latitude', lat.toFixed(4));
    url.searchParams.set('longitude', lng.toFixed(4));
    url.searchParams.set('current', 'temperature_2m,precipitation,weather_code,wind_speed_10m');
    url.searchParams.set('hourly', 'precipitation_probability');
    url.searchParams.set('forecast_days', '1');
    url.searchParams.set('forecast_hours', '6');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('wind_speed_unit', 'kmh');

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = (await res.json()) as OpenMeteoResponse;

    const condition = buildCondition(label, lat, lng, data);
    weatherCache.set(key, { data: condition, fetchedAt: Date.now() });
    return condition;
  } catch (err) {
    console.warn('Weather fetch failed:', err);
    return failedCondition(label, lat, lng);
  }
}

/**
 * ルート（座標列）の出発地・中間点・目的地の天気を取得する。
 * 全地点が取得失敗した場合は error フラグ付きで返す（表示のみ）。
 * deals: elevatedSpan が true（橋・高架・湾岸である可能性）の場合に強風注意を追記する。
 */
export async function getRouteWeather(
  coordinates: [number, number][],
  elevatedSpan: boolean
): Promise<RouteWeather | null> {
  if (coordinates.length < 2) return null;

  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  const midpoint = coordinates[Math.min(Math.floor(coordinates.length / 2), coordinates.length - 1)];

  const [s, m, e] = await Promise.all([
    fetchWeatherPoint(start[0], start[1], '出発地'),
    fetchWeatherPoint(midpoint[0], midpoint[1], '途中'),
    fetchWeatherPoint(end[0], end[1], '目的地'),
  ]);

  const points = [s, m, e];
  const okCount = points.filter((p) => p.ok).length;
  if (okCount === 0) {
    return {
      start: s,
      midpoint: m,
      end: e,
      cautions: [],
      durationFactor: 1,
      fetchedAt: Date.now(),
      error: true,
    };
  }

  const cautions: string[] = [];
  const freezingRisk = points.some((p) => p.ok && p.isFreezingRisk);
  const precipitating = points.some((p) => p.ok && p.isPrecipitating);
  const anyWindy = points.some((p) => p.ok && p.isWindy);
  const maxWind = Math.max(
    0,
    ...points.filter((p) => p.ok && p.windSpeed !== null).map((p) => p.windSpeed ?? 0)
  );

  if (freezingRisk) {
    cautions.push(
      '気温1℃以下 かつ 降水のため路面が凍結する恐れがあります（所要時間+30%）'
    );
  } else if (precipitating) {
    cautions.push('雨・雪のため路面が滑りやすくなっています（所要時間+10%）');
  }
  if (anyWindy && elevatedSpan) {
    cautions.push(
      `強風注意：橋・湾岸・高架区間を走行します（風速 ${Math.round(maxWind)} km/h）`
    );
  }

  const durationFactor = freezingRisk
    ? WEATHER_DURATION_SNOW_OR_FREEZE_FACTOR
    : precipitating
      ? WEATHER_DURATION_RAIN_FACTOR
      : 1;

  return {
    start: s,
    midpoint: m,
    end: e,
    cautions,
    durationFactor,
    fetchedAt: Date.now(),
  };
}