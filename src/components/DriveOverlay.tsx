import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  ListOrdered,
  Merge,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { LaneAdvice, LaneDirection } from '../services/laneGuidance';
import { ShutoMergeInfo } from '../services/shutoAssist';
import { JunctionDetail } from '../services/elevated';
import { formatDistance } from '../services/mapService';

interface DriveOverlayProps {
  advices: LaneAdvice[];
  remaining: Map<number, number>;
  tracking: boolean;
  traveledMeters: number;
  totalDistance: number;
  /** 全行程の所要時間（秒）。天候・混雑補正があればそれを渡す */
  totalDuration: number;
  earlyMeters: number;
  liveLevel?: 'highway' | 'surface' | null;
  merges: ShutoMergeInfo[];
  junctions: JunctionDetail[];
  voiceOn: boolean;
  onToggleVoice: () => void;
  onExitDrive: () => void;
  trackError: string | null;
}

const DIRECTION_ICONS: Record<LaneDirection, React.FC<{ size?: number; strokeWidth?: number }>> = {
  left: CornerUpLeft,
  right: CornerUpRight,
  straight: ArrowUp,
  merge: Merge,
};

function pickPrimary(
  advices: LaneAdvice[],
  remaining: Map<number, number>,
  tracking: boolean
): { advice: LaneAdvice; rem: number | undefined } | null {
  if (advices.length === 0) return null;
  const withRem = advices.map((a) => ({
    advice: a,
    rem: tracking ? remaining.get(a.stepIndex) : undefined,
  }));
  const active = withRem.filter((x) => x.rem === undefined || x.rem > -50);
  const pool = active.length > 0 ? active : withRem;
  pool.sort((a, b) => {
    const ra = a.rem ?? a.advice.distanceToManeuver;
    const rb = b.rem ?? b.advice.distanceToManeuver;
    return ra - rb;
  });
  return pool[0] ?? null;
}

/** バー表示用の短い所要時間（例: 1時間20分 / 12分） */
function formatShortDuration(seconds: number): string {
  const mins = Math.max(0, Math.round(seconds / 60));
  if (mins < 60) return `${mins}分`;
  return `${Math.floor(mins / 60)}時間${mins % 60}分`;
}

/**
 * 走行中の地図オーバーレイ。
 * 上部に次の案内バナー、下部に残り時間・到着予定・案内終了のバーを重ねる。
 * サイドパネルは非表示になるため、document.body へポータルで描画する。
 */
export const DriveOverlay: React.FC<DriveOverlayProps> = ({
  advices,
  remaining,
  tracking,
  traveledMeters,
  totalDistance,
  totalDuration,
  earlyMeters,
  liveLevel,
  merges,
  junctions,
  voiceOn,
  onToggleVoice,
  onExitDrive,
  trackError,
}) => {
  const [showUpcoming, setShowUpcoming] = useState(false);

  // 到着予定時刻の更新用（GPS 未取得でも時計に合わせて進める）
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const primary = useMemo(
    () => pickPrimary(advices, remaining, tracking),
    [advices, remaining, tracking]
  );

  const nextMerge = useMemo(() => {
    const act = merges
      .map((m) => ({ m, rem: tracking ? remaining.get(m.stepIndex) : undefined }))
      .filter((x) => x.rem === undefined || x.rem > -50)
      .sort(
        (a, b) =>
          (a.rem ?? a.m.distanceToManeuver) - (b.rem ?? b.m.distanceToManeuver)
      );
    return act[0] ?? null;
  }, [merges, remaining, tracking]);

  const nextJunction = useMemo(() => {
    const act = junctions
      .map((j) => ({ j, rem: tracking ? remaining.get(j.stepIndex) : undefined }))
      .filter((x) => x.rem === undefined || (x.rem > -50 && x.rem <= 2000))
      .sort(
        (a, b) =>
          (a.rem ?? a.j.distanceToManeuver) - (b.rem ?? b.j.distanceToManeuver)
      );
    return act[0] ?? null;
  }, [junctions, remaining, tracking]);

  const primaryRem = primary?.rem ?? primary?.advice.distanceToManeuver;
  const progress =
    primaryRem !== undefined && earlyMeters > 0 && tracking
      ? Math.min(1, Math.max(0, 1 - primaryRem / earlyMeters))
      : null;
  const urgent = primaryRem !== undefined && tracking && primaryRem <= 300;
  const isHighway = liveLevel === 'highway';
  const DirectionIcon = primary ? DIRECTION_ICONS[primary.advice.direction] : ArrowUp;

  // 残り距離・時間は走行距離の割合で按分して推定する
  const remainingDistance = Math.max(0, totalDistance - (tracking ? traveledMeters : 0));
  const remainingSeconds =
    totalDistance > 0 ? totalDuration * (remainingDistance / totalDistance) : totalDuration;
  const eta = new Date(nowTick + remainingSeconds * 1000);
  const etaLabel = `${eta.getHours()}:${String(eta.getMinutes()).padStart(2, '0')}`;

  return createPortal(
    <>
      {/* 上部：次の案内バナー */}
      <div className="fixed top-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[560px] z-40 space-y-2 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
        <section
          aria-label="次の案内"
          className={`pointer-events-auto rounded-2xl shadow-2xl border text-white overflow-hidden ${
            urgent ? 'bg-red-950/95 border-red-500/60' : 'bg-neutral-950/95 border-neutral-700'
          }`}
        >
          {primary ? (
            <div className="flex items-center gap-3 p-3">
              <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  urgent ? 'bg-red-600' : 'bg-emerald-600'
                }`}
                aria-hidden="true"
              >
                <DirectionIcon size={34} strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-2xl sm:text-3xl font-extrabold tabular-nums leading-tight">
                  {primaryRem !== undefined ? (
                    <>あと{formatDistance(Math.max(primaryRem, 0))}</>
                  ) : (
                    <>—</>
                  )}
                </div>
                <div className="text-sm sm:text-base font-bold leading-snug truncate">
                  {primary.advice.message}
                </div>
                {primary.advice.roadName && (
                  <div className="text-xs text-neutral-300 truncate">{primary.advice.roadName}</div>
                )}
              </div>
              {tracking && liveLevel && (
                <span
                  className={`self-start px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0 ${
                    isHighway ? 'bg-sky-600' : 'bg-emerald-700'
                  }`}
                >
                  {isHighway ? '高速（上層）' : '一般道（下層）'}
                </span>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-neutral-300">
              案内ポイントがありません。そのまま直進でOKです。
            </div>
          )}
          {progress !== null && (
            <div className="h-1.5 bg-neutral-800" aria-hidden="true">
              <div
                className={`h-full ${urgent ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}
        </section>

        {(nextMerge || nextJunction || trackError || !tracking) && (
          <div className="pointer-events-auto flex flex-wrap gap-1.5 text-xs">
            {nextMerge && (
              <span className="inline-flex items-center gap-1.5 max-w-full rounded-full px-2.5 py-1 bg-neutral-950/90 text-white border border-orange-500/40 shadow-lg">
                <span className="px-1.5 rounded-full text-[10px] font-bold bg-orange-600 flex-shrink-0">
                  {nextMerge.m.isShuto ? '首都高' : '合流'}
                </span>
                <span className="truncate">{nextMerge.m.roadName || nextMerge.m.instruction}</span>
                <span className="text-neutral-300 whitespace-nowrap">
                  あと{formatDistance(Math.max(nextMerge.rem ?? nextMerge.m.distanceToManeuver, 0))}
                </span>
              </span>
            )}
            {nextJunction && (
              <span className="inline-flex items-center gap-1.5 max-w-full rounded-full px-2.5 py-1 bg-neutral-950/90 text-white border border-sky-500/40 shadow-lg">
                <span className="text-[10px] font-bold text-sky-400 flex-shrink-0">JCT</span>
                <span className="truncate">{nextJunction.j.name}</span>
                <span className="text-neutral-300 whitespace-nowrap">
                  あと{formatDistance(Math.max(nextJunction.rem ?? nextJunction.j.distanceToManeuver, 0))}
                </span>
              </span>
            )}
            {trackError ? (
              <span className="rounded-full px-2.5 py-1 bg-red-950/90 text-red-300 border border-red-500/40 shadow-lg">
                {trackError}
              </span>
            ) : (
              !tracking && (
                <span className="rounded-full px-2.5 py-1 bg-neutral-950/80 text-neutral-300 shadow-lg">
                  GPS追跡開始後に残距離がライブ表示されます
                </span>
              )
            )}
          </div>
        )}
      </div>

      {/* 下部：残り時間・到着予定・案内終了 */}
      <div className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[560px] z-40 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-200">
        {showUpcoming && (
          <div className="pointer-events-auto mb-2 max-h-[40vh] overflow-y-auto rounded-2xl bg-neutral-950/95 border border-neutral-700 shadow-2xl p-2 space-y-1.5">
            <div className="px-1 text-[11px] font-semibold text-neutral-400">この先の案内</div>
            {advices.slice(0, 5).map((a) => {
              const rem = tracking ? remaining.get(a.stepIndex) : undefined;
              const Icon = DIRECTION_ICONS[a.direction];
              return (
                <div
                  key={a.stepIndex}
                  className="flex items-center gap-2 rounded-xl px-2.5 py-2 bg-neutral-900 border border-neutral-800 text-xs text-white"
                >
                  <Icon size={16} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-neutral-100">{a.earlyMessage}</div>
                    <div className="text-neutral-400 mt-0.5">
                      {rem !== undefined ? (
                        <>あと{formatDistance(Math.max(rem, 0))}</>
                      ) : (
                        <>{formatDistance(a.distanceToManeuver)}先</>
                      )}
                      ・手順{a.stepIndex + 1}
                    </div>
                  </div>
                </div>
              );
            })}
            {advices.length === 0 && (
              <div className="px-1 py-2 text-xs text-neutral-400">案内ポイントはありません</div>
            )}
          </div>
        )}

        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-white/95 backdrop-blur-md border border-neutral-200 shadow-2xl p-2 pl-4">
          <div className="flex-1 min-w-0">
            <div className="text-xl font-extrabold text-neutral-900 tabular-nums leading-tight">
              {formatShortDuration(remainingSeconds)}
            </div>
            <div className="text-[11px] text-neutral-500 tabular-nums truncate">
              {etaLabel} 到着予定・{formatDistance(remainingDistance)}
            </div>
          </div>
          <button
            onClick={onToggleVoice}
            className={`w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0 ${
              voiceOn
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white border-neutral-200 text-neutral-500'
            }`}
            title={voiceOn ? '自動音声 ON' : '自動音声 OFF'}
            aria-pressed={voiceOn}
          >
            {voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            onClick={() => setShowUpcoming((v) => !v)}
            className={`w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0 ${
              showUpcoming
                ? 'bg-neutral-900 border-neutral-900 text-white'
                : 'bg-white border-neutral-200 text-neutral-600'
            }`}
            title="この先の案内"
            aria-expanded={showUpcoming}
          >
            <ListOrdered size={18} />
          </button>
          <button
            id="exit-drive-mode-btn"
            onClick={onExitDrive}
            className="h-11 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold flex items-center gap-1.5 flex-shrink-0"
          >
            <Square size={14} />
            <span>案内終了</span>
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};
