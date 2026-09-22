import { fetchWeatherPoint } from './weather';

/**
 * 雨雲レーダー。3段階でデータを供給する。
 *   1. RainViewer 公開API（タイル、実データ）… 個人・教育利用は無料。出典明記必須。
 *      ドキュメント: https://www.rainviewer.com/api.html
 *      個人利用の制限: 過去2時間のみ / Universal Blue配色 / 最大ズームL7(512px) / PNG
 *   2. Open-Meteo の6×6格子（降水強度）を canvas で補間描画（半実データ）
 *   3. 乱数によるシミュレーション（一方向へ流れる）
 *   1・2が失敗した場合は3へ自動フォールバックする。
 */

export type RainSource = 'rainviewer' | 'openmeteo' | 'simulation';
export type RainStatus = 'loading' | 'ready' | 'error';

/** 現在表示している雨雲データの一枚（フレーム） */
export interface RainFrame {
  time: number; // エポック秒（ラベル表示に使う）
  /** RainViewer: タイルURLテンプレート（{z}/{x}/{y} は Leaflet が置換） */
  tileUrl?: string;
  /** Open-Meteo / シミュレーション: 格子セルの降水強度（mm/h） */
  cells?: { lat: number; lng: number; precip: number }[];
}

export interface RainRadarState {
  source: RainSource;
  frames: RainFrame[];
  status: RainStatus;
  error?: string;
}

/** RainViewer 出典表記（利用規約でリンク提示が求められる） */
export const RAINVIEWER_CREDIT = '© RainViewer';
export const RAINVIEWER_CREDIT_URL = 'https://www.rainviewer.com/';

const RAINVIEWER_JSON_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** タイルの不透明度（下の地図・ルート線が見えるよう半透明） */
export const RAIN_TILE_OPACITY = 0.55;
/** 個人利用（無料）の最大タイルズーム。これを超えると Leaflet が拡大描画する */
export const RAINVIEWER_MAX_NATIVE_ZOOM = 7;
/** 再生間隔（ms） */
export const RAIN_PLAYBACK_INTERVAL_MS = 400;

export function rainSourceLabel(source: RainSource): string {
  switch (source) {
    case 'rainviewer':
      return '雨雲レーダー（RainViewer）';
    case 'openmeteo':
      return '推定（Open-Meteo）';
    case 'simulation':
      return 'シミュレーション表示';
  }
}

// ---------------------------------------------------------------------------
// 降水強度 → 色（気象庁の降水強度配色イメージ）
// ---------------------------------------------------------------------------

interface PrecipStop {
  threshold: number; // この mm/h 以上でこの色
  color: string;
}

const PRECIP_STOPS: PrecipStop[] = [
  { threshold: 80, color: '#4a0d67' }, // 80mm/h以上：濃紫
  { threshold: 50, color: '#8a1f9c' }, // 50〜：紫
  { threshold: 30, color: '#d41159' }, // 30〜：赤紫
  { threshold: 20, color: '#ef292f' }, // 20〜：赤
  { threshold: 10, color: '#ff8700' }, // 10〜：オレンジ
  { threshold: 5, color: '#ffd500' }, // 5〜：黄
  { threshold: 3, color: '#3db9ff' }, // 3〜：青
  { threshold: 1, color: '#a5dcff' }, // 1〜：水色
];

/** 凡例用の色ストップ（昇順） */
export function precipStops(): { threshold: number; color: string }[] {
  return [...PRECIP_STOPS].reverse();
}

/** mm/h → 色（雨なしは透明） */
export function precipColor(mmh: number): string {
  if (mmh < 1) return 'rgba(0,0,0,0)';
  for (const s of PRECIP_STOPS) {
    if (mmh >= s.threshold) return s.color;
  }
  return 'rgba(0,0,0,0)';
}

// ---------------------------------------------------------------------------
// 1) RainViewer
// ---------------------------------------------------------------------------

interface RainViewerResponse {
  host?: string;
  radar?: {
    past?: { time?: number; path?: string }[];
  };
}

let rainviewerCache: { data: RainFrame[]; fetchedAt: number } | null = null;
const RAINVIEWER_CACHE_TTL_MS = 5 * 60 * 1000;

/** weather-maps.json を取得し、過去2時間のフレーム（タイルURL付き）を返す */
export async function fetchRainViewerFrames(): Promise<RainFrame[]> {
  const cached = rainviewerCache;
  if (cached && Date.now() - cached.fetchedAt < RAINVIEWER_CACHE_TTL_MS) {
    return cached.data;
  }
  const res = await fetch(RAINVIEWER_JSON_URL);
  if (!res.ok) throw new Error(`RainViewer ${res.status}`);
  const data = (await res.json()) as RainViewerResponse;
  const past = data.radar?.past ?? [];
  const frames: RainFrame[] = past
    .filter((f) => typeof f.time === 'number' && typeof f.path === 'string')
    .sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
    .map((f) => ({
      time: f.time as number,
      // 個人利用=過去データ・Universal Blue(2)・最大ズームL7
      tileUrl: `${data.host}${f.path}/512/{z}/{x}/{y}/2/1_1.png`,
    }));
  if (frames.length === 0) throw new Error('RainViewer: no radar frames');
  rainviewerCache = { data: frames, fetchedAt: Date.now() };
  return frames;
}

// ---------------------------------------------------------------------------
// 2) Open-Meteo 6×6 格子
// ---------------------------------------------------------------------------

export interface GeoBounds {
  north: number;
  south: number;
  west: number;
  east: number;
}

let openMeteoGridCache: { key: string; data: RainFrame[]; fetchedAt: number } | null = null;
const OPEN_METEO_GRID_TTL_MS = 10 * 60 * 1000;

/**
 * 表示範囲を cols×rows の格子に区切り、各格子点の時間別降水強度を取得する。
 * past_hours と forecast_hours で「過去〜これから」の複数フレームを作る。
 */
export async function fetchOpenMeteoGrid(
  bounds: GeoBounds,
  cols = 6,
  rows = 6
): Promise<RainFrame[]> {
  const key = `${bounds.north.toFixed(2)},${bounds.south.toFixed(2)},${bounds.west.toFixed(
    2
  )},${bounds.east.toFixed(2)}:${cols}x${rows}`;
  const cached = openMeteoGridCache;
  if (cached && cached.key === key && Date.now() - cached.fetchedAt < OPEN_METEO_GRID_TTL_MS) {
    return cached.data;
  }

  const latStep = Math.max((bounds.north - bounds.south) / rows, 0.0001);
  const lngStep = Math.max((bounds.east - bounds.west) / cols, 0.0001);
  const lats = Array.from({ length: rows }, (_, i) => bounds.south + latStep * (i + 0.5));
  const lngs = Array.from({ length: cols }, (_, i) => bounds.west + lngStep * (i + 0.5));

  const urls = lats
    .flatMap((lat) =>
      lngs.map((lng) => {
        const u = new URL(OPEN_METEO_URL);
        u.searchParams.set('latitude', lat.toFixed(4));
        u.searchParams.set('longitude', lng.toFixed(4));
        u.searchParams.set('current', 'precipitation');
        u.searchParams.set('hourly', 'precipitation');
        u.searchParams.set('forecast_days', '1');
        u.searchParams.set('past_hours', '3');
        u.searchParams.set('forecast_hours', '6');
        u.searchParams.set('timezone', 'auto');
        return { lat, lng, url: u.toString() };
      })
    )
    // タイル同様にばらつかないよう座標順にソート
    .sort((a, b) => (a.lat === b.lat ? a.lng - b.lng : a.lat - b.lat));

  const responses = await Promise.all(
    urls.map(async (cell) => {
      try {
        const res = await fetch(cell.url);
        if (!res.ok) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json();
        const times: number[] = (data.hourly?.time ?? []).map((t: string) =>
          Math.floor(new Date(t).getTime() / 1000)
        );
        const preps: number[] = data.hourly?.precipitation ?? [];
        if (times.length === 0) return null;
        // 現在時刻の hourly 値を current.precipitation が上回っていれば差し替え
        const nowIdx = times.findIndex((t) => Math.abs(t - Date.now() / 1000) < 3600);
        if (nowIdx >= 0 && typeof data.current?.precipitation === 'number') {
          preps[nowIdx] = Math.max(preps[nowIdx] ?? 0, data.current.precipitation);
        }
        return { lat: cell.lat, lng: cell.lng, times, preps };
      } catch {
        return null;
      }
    })
  );

  const valid = responses.filter((r): r is NonNullable<typeof r> => r !== null);
  if (valid.length === 0) throw new Error('Open-Meteo grid all failed');

  // 時刻ごとにフレームを組む（各セルの times は同一のはず）
  const frameCount = Math.min(...valid.map((r) => r.times.length));
  const frames: RainFrame[] = [];
  for (let i = 0; i < frameCount; i++) {
    const cells = valid.map((r) => ({
      lat: r.lat,
      lng: r.lng,
      precip: r.preps[i] ?? 0,
    }));
    frames.push({ time: valid[0].times[i], cells });
  }

  openMeteoGridCache = { key, data: frames, fetchedAt: Date.now() };
  return frames;
}

// ---------------------------------------------------------------------------
// 3) シミュレーション
// ---------------------------------------------------------------------------

/** 雨雲の塊（シミュレーション用）。時間とともに一方向へゆっくり流れる */
interface SimBlob {
  lat: number;
  lng: number;
  velLat: number; // deg/min
  velLng: number; // deg/min
  radiusDeg: number;
  peak: number; // mm/h at center
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

let simSeed = Math.floor(Math.random() * 1e9);

/** 乱数で雨雲の塊を生成し、時間経過で流す。視界は見えている範囲に合わせる */
export function makeSimulationFrames(bounds: GeoBounds, count = 14): RainFrame[] {
  const rng = seededRandom(simSeed);
  const blobCount = 6 + Math.floor(rng() * 5); // 6〜10個
  const spanLat = Math.max(bounds.north - bounds.south, 0.05);
  const spanLng = Math.max(bounds.east - bounds.west, 0.05);

  const blobs: SimBlob[] = Array.from({ length: blobCount }, () => ({
    lat: bounds.south + rng() * spanLat,
    lng: bounds.west + rng() * spanLng,
    // 全体が一方向へゆっくり流れる（東→西へ）
    velLat: (rng() - 0.45) * 0.004,
    velLng: -(0.004 + rng() * 0.012),
    radiusDeg: 0.02 + rng() * Math.max(spanLat * 0.22, 0.03),
    peak: 1 + Math.pow(rng(), 2) * 30,
  }));

  // 細かい格子でセル値を計算（canvas の放射グラデーションと合わせて滑らかに見せる）
  const grid = 28;
  const latStep = spanLat / grid;
  const lngStep = spanLng / grid;

  const frames: RainFrame[] = [];
  // 過去60分〜現在 を 約5分刻み
  for (let i = 0; i < count; i++) {
    const minutesAgo = (count - 1 - i) * 5;
    const t = -minutesAgo;
    const cells: { lat: number; lng: number; precip: number }[] = [];
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const lat = bounds.south + latStep * (gy + 0.5);
        const lng = bounds.west + lngStep * (gx + 0.5);
        let acc = 0;
        for (const b of blobs) {
          const cLat = b.lat + b.velLat * t;
          const cLng = b.lng + b.velLng * t;
          const dx = (lng - cLng) / lngStep;
          const dy = (lat - cLat) / latStep;
          const d2 = dx * dx + dy * dy;
          const sigma = Math.max(b.radiusDeg / Math.max(latStep, 1e-6), 1);
          acc += b.peak * Math.exp(-d2 / (2 * sigma * sigma));
        }
        cells.push({ lat, lng, precip: acc });
      }
    }
    const secs = Math.round(Date.now() / 1000) - minutesAgo * 60;
    frames.push({ time: secs, cells });
  }
  return frames;
}

/**
 * シミュレーションフレームを次回生成から変えて欲しい場合にシードを更新する（デモ用）
 */
export function reseedSimulation(): void {
  simSeed = Math.floor(Math.random() * 1e9);
}

// ---------------------------------------------------------------------------
// データを選んで RainRadarState を組み立てる（1→2→3 のフォールバック）
// ---------------------------------------------------------------------------

/**
 * 雨雲データを取得する。
 * @param forceSimulation ?rain=sim 相当。シミュレーションを強制。
 * @param bounds 表示範囲（Open-Meteo / シミュレーション用）
 */
export async function loadRainRadar(
  forceSimulation: boolean,
  bounds: GeoBounds
): Promise<RainRadarState> {
  if (forceSimulation) {
    return { source: 'simulation', frames: makeSimulationFrames(bounds), status: 'ready' };
  }

  // 1) RainViewer（実データ）
  try {
    const frames = await fetchRainViewerFrames();
    return { source: 'rainviewer', frames, status: 'ready' };
  } catch (err) {
    console.warn('RainViewer failed, falling back:', err);
  }

  // 2) Open-Meteo 格子（半実データ）
  try {
    const frames = await fetchOpenMeteoGrid(bounds);
    if (frames.length > 0) {
      return { source: 'openmeteo', frames, status: 'ready' };
    }
  } catch (err) {
    console.warn('Open-Meteo grid failed, falling back to simulation:', err);
  }

  // 3) シミュレーション
  return { source: 'simulation', frames: makeSimulationFrames(bounds), status: 'ready' };
}

// ---------------------------------------------------------------------------
// Canvas による格子セル（Open-Meteo / シミュレーション）の描画
// ---------------------------------------------------------------------------

/**
 * セル群を放射グラデーションでヒートマップ描画する。
 * bounds はフレームの座標系、mapBounds は現在の地図表示範囲。
 * フレームの bounds と現在の表示がずれていても線形マッピングで補正する。
 */
export function drawPrecipField(
  canvas: HTMLCanvasElement,
  cells: { lat: number; lng: number; precip: number }[],
  frameBounds: GeoBounds,
  mapBounds: GeoBounds
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (cells.length < 4) return;

  // セル間隔（ラジアス）をフレーム bounds から推定
  const latSpan = Math.max(frameBounds.north - frameBounds.south, 1e-6);
  const lngSpan = Math.max(frameBounds.east - frameBounds.west, 1e-6);
  const latStep = latSpan / (Math.sqrt(cells.length) - 1 || 1);
  const lngStep = lngSpan / (Math.sqrt(cells.length) - 1 || 1);

  const toX = (lng: number) => ((lng - mapBounds.west) / (mapBounds.east - mapBounds.west || 1)) * w;
  const toY = (lat: number) => ((mapBounds.north - lat) / (mapBounds.north - mapBounds.south || 1)) * h;

  ctx.globalAlpha = 0.75;
  for (const cell of cells) {
    if (cell.precip < 1) continue;
    const x = toX(cell.lng);
    const y = toY(cell.lat);
    if (x < -200 || y < -200 || x > w + 200 || y > h + 200) continue;
    const r = Math.min(
      Math.max(((latStep + lngStep) / 2 / (mapBounds.north - mapBounds.south || 1)) * h, 6),
      Math.max(w, h)
    ) * 1.3;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = precipColor(cell.precip);
    if (c === 'rgba(0,0,0,0)') continue;
    grad.addColorStop(0, c);
    grad.addColorStop(0.8, c);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// ルート上に雨の区間があるかの判定（WeatherCard 用・シミュレーション除く）
// ---------------------------------------------------------------------------

/**
 * ルート上の数点の降水強度を Open-Meteo で取得し、雨の区間があるかを返す。
 * 表示ソースがシミュレーションの場合は無条件で false（誤解を避ける）。
 */
export async function detectRainOnRoute(
  coordinates: [number, number][],
  source: RainSource
): Promise<boolean> {
  if (source === 'simulation' || coordinates.length < 2) return false;
  const maxSamples = Math.min(Math.max(Math.floor(coordinates.length / 8), 3), 7);
  const idxs = new Set<number>(
    Array.from({ length: maxSamples }, (_, i) =>
      Math.round((i / Math.max(maxSamples - 1, 1)) * (coordinates.length - 1))
    )
  );
  const results = await Promise.all([...idxs].map((i) => sampleRoutePrecip(coordinates[i], i)));
  return results.some((r) => r);
}

async function sampleRoutePrecip(c: [number, number], i: number): Promise<boolean> {
  try {
    const cond = await fetchWeatherPoint(c[0], c[1], `route-rain-${i}`);
    return cond.ok && (cond.precipitation ?? 0) >= 0.5;
  } catch {
    return false;
  }
}