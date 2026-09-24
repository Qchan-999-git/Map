import { AccidentAnalysis, AccidentSegment, AccidentSeverity, RouteResult } from '../types';
import { calculateHaversineDistance } from './mapService';

/**
 * 事故発生時の経路警告。
 *
 * 無料・APIキー不要で使えるリアルタイム事故APIは現状ほぼ無いため、
 * プロバイダを差し替えられる AccidentProvider インターフェースを用意し、
 * デフォルトは下記の3層で判定する EstimatedAccidentProvider を使う。
 *
 * 1. ユーザー報告（localStorage `navi_accident_reports` に保存された地点が
 *    ルートから ACCIDENT_REPORT_RADIUS_METERS 以内なら critical）
 * 2. シミュレーション（`?accident=sim` または UI のテストボタン。デモ・動作確認用）
 * 3. 危険区間のヒューリスティック（合流・ランプ・幹線・高速を warning として注意喚起）
 *
 * 将来的に外部API（例: 警察・道路交通情報のプロキシ）を追加する場合は
 * ApiAccidentProvider を実装し getAccidentProvider() を切り替える。
 */

export const ACCIDENT_REPORTS_STORAGE_KEY = 'navi_accident_reports_v1';
export const ACCIDENT_REPORT_RADIUS_METERS = 300;
export const ACCIDENT_REPORT_TTL_MS = 6 * 60 * 60 * 1000; // 報告は6時間で失効

export interface AccidentReport {
  id: string;
  lat: number;
  lng: number;
  note?: string;
  createdAt: number;
}

/** 交通情報プロバイダと同形の事故情報プロバイダ */
export interface AccidentProvider {
  readonly id: string;
  readonly description: string;
  isAvailable(): boolean;
  analyze(route: RouteResult, opts?: { simulate?: boolean; at?: Date }): Promise<AccidentAnalysis>;
}

const EXPRESSWAY_PATTERN =
  /首都高|高速|C1|C2|湾岸|自動車道|有料道路|上野線|渋谷線|新宿線|池袋線|八重洲線|都心環状|中央環状/i;

function isRiskyStep(name: string, instruction: string, turnType?: string): { risky: boolean; reason: string } {
  const text = `${name} ${instruction}`;
  if (turnType === 'merge' || turnType === 'ramp') {
    const isExpress = EXPRESSWAY_PATTERN.test(text);
    return {
      risky: true,
      reason: isExpress ? '高速・首都高の合流部（事故多発注意）' : '合流・ランプ区間（事故注意）',
    };
  }
  if (EXPRESSWAY_PATTERN.test(text)) {
    return { risky: true, reason: '高速・幹線区間（速度注意・追突注意）' };
  }
  if (/国道|県道|バイパス|環状/i.test(name)) {
    return { risky: true, reason: '幹線道路（交差点・右折時の事故注意）' };
  }
  return { risky: false, reason: '' };
}

/** localStorage から有効期限内の事故報告だけを読む */
export function getAccidentReports(now: number = Date.now()): AccidentReport[] {
  try {
    const stored = localStorage.getItem(ACCIDENT_REPORTS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as AccidentReport[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r) =>
        typeof r.lat === 'number' &&
        typeof r.lng === 'number' &&
        now - r.createdAt < ACCIDENT_REPORT_TTL_MS
    );
  } catch {
    return [];
  }
}

export function saveAccidentReport(lat: number, lng: number, note?: string): AccidentReport {
  const report: AccidentReport = {
    id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    lat,
    lng,
    note,
    createdAt: Date.now(),
  };
  try {
    const current = getAccidentReports();
    localStorage.setItem(ACCIDENT_REPORTS_STORAGE_KEY, JSON.stringify([report, ...current].slice(0, 50)));
  } catch {
    // ignore
  }
  return report;
}

export function clearAccidentReports(): void {
  try {
    localStorage.removeItem(ACCIDENT_REPORTS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function nearestDistanceToRoute(lat: number, lng: number, coordinates: [number, number][]): number {
  let best = Infinity;
  // 全点走査だと長いルートで重いので間引き（最大500点）
  const step = Math.max(1, Math.floor(coordinates.length / 500));
  for (let i = 0; i < coordinates.length; i += step) {
    const d = calculateHaversineDistance(lat, lng, coordinates[i][0], coordinates[i][1]);
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best;
}

/**
 * ヒューリスティック + ユーザー報告 + シミュレーションで事故警告を解析する。
 * いかなる場合も例外を投げず、空の解析結果を返す（ルート検索自体を失敗させない）。
 */
export class EstimatedAccidentProvider implements AccidentProvider {
  readonly id = 'estimated';
  readonly description = '合流・幹線ヒューリスティック + ユーザー報告 + シミュレーション';

  isAvailable(): boolean {
    return true;
  }

  async analyze(route: RouteResult, opts?: { simulate?: boolean; at?: Date }): Promise<AccidentAnalysis> {
    const segments: AccidentSegment[] = [];
    const now = opts?.at?.getTime() ?? Date.now();

    // 1. ユーザー報告との突合せ（critical）
    try {
      const reports = typeof localStorage !== 'undefined' ? getAccidentReports(now) : [];
      reports.forEach((report) => {
        const dist = nearestDistanceToRoute(report.lat, report.lng, route.coordinates);
        if (dist <= ACCIDENT_REPORT_RADIUS_METERS) {
          // 最も近いステップを求める
          let bestStep = 0;
          let bestDist = Infinity;
          route.steps.forEach((s, idx) => {
            const loc = s.location;
            if (!loc) return;
            const d =
              (loc[0] - report.lat) ** 2 + (loc[1] - report.lng) ** 2;
            if (d < bestDist) {
              bestDist = d;
              bestStep = idx;
            }
          });
          const step = route.steps[bestStep];
          segments.push({
            stepIndex: bestStep,
            name: step?.name || step?.instruction || '報告地点付近',
            distance: Math.round(step?.distance ?? 0),
            severity: 'critical',
            reason: `ユーザー報告の事故から約${Math.round(dist)}m（${report.note || '詳細不明'}）`,
          });
        }
      });
    } catch {
      // 報告の突合せ失敗は無視（ヒューリスティックのみで継続）
    }

    // 2. シミュレーション（デモ用にルート中間へ critical を1件追加）
    let simulated = false;
    if (opts?.simulate && route.steps.length > 0) {
      simulated = true;
      const mid = Math.floor(route.steps.length / 2);
      const step = route.steps[mid];
      segments.push({
        stepIndex: mid,
        name: step?.name || step?.instruction || 'シミュレーション区間',
        distance: Math.round(step?.distance ?? 0),
        severity: 'critical',
        reason: 'テスト用の模擬事故（シミュレーション）',
      });
    }

    // 3. 危険区間のヒューリスティック（warning。critical と重複する step は除外）
    const criticalSteps = new Set(segments.map((s) => s.stepIndex));
    route.steps.forEach((s, idx) => {
      if (criticalSteps.has(idx)) return;
      const { risky, reason } = isRiskyStep(s.name || '', s.instruction || '', s.turnType);
      if (risky) {
        segments.push({
          stepIndex: idx,
          name: s.name || s.instruction || '名称のない道路',
          distance: Math.round(s.distance || 0),
          severity: 'warning' as AccidentSeverity,
          reason,
        });
      }
    });

    // stepIndex 順にソート
    segments.sort((a, b) => a.stepIndex - b.stepIndex);

    return {
      segments,
      hasAccident: segments.some((s) => s.severity === 'critical'),
      checkedAt: Date.now(),
      simulated,
      provider: this.id,
    };
  }
}

/**
 * 外部事故API用のプロバイダ枠。
 *
 * 方針: APIキーをフロントに露出しない。サーバー側（既存の express 依存を
 * 利用した /api/accidents プロキシ）でのみ外部APIを呼ぶ。
 *
 * TODO(未実装):
 *   1. server.js（express）に /api/accidents エンドポイントを追加する。
 *   2. ここでは fetch('/api/accidents?bbox=...') を呼んで AccidentAnalysis に変換する。
 *   ※ import.meta.env.VITE_API_ACCIDENTS が 'true' のときのみ有効化される想定。
 */
export class ApiAccidentProvider implements AccidentProvider {
  readonly id = 'api';
  readonly description = '外部事故API（未実装・要サーバープロキシ）';

  isAvailable(): boolean {
    try {
      return import.meta.env.VITE_API_ACCIDENTS === 'true';
    } catch {
      return false;
    }
  }

  async analyze(_route: RouteResult, _opts?: { simulate?: boolean; at?: Date }): Promise<AccidentAnalysis> {
    throw new Error('ApiAccidentProvider is not implemented yet');
  }
}

const estimatedProvider = new EstimatedAccidentProvider();
const apiProvider = new ApiAccidentProvider();

export function getAccidentProvider(): AccidentProvider {
  return apiProvider.isAvailable() ? apiProvider : estimatedProvider;
}

/** ルートの事故警告解析を実行する。失敗してもルート検索自体は失敗させない。 */
export async function analyzeAccidents(
  route: RouteResult,
  opts?: { simulate?: boolean; at?: Date }
): Promise<AccidentAnalysis | null> {
  if (route.mode !== 'driving' || route.steps.length === 0) return null;
  const provider = getAccidentProvider();
  try {
    return await provider.analyze(route, opts);
  } catch (err) {
    console.warn('Accident provider failed, falling back to estimation:', err);
    return estimatedProvider.analyze(route, opts);
  }
}
