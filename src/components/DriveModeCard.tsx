import React, { useMemo, useState } from 'react';
import { Volume2, VolumeX, ChevronDown, ChevronUp, Square } from 'lucide-react';
import { LaneAdvice } from '../services/laneGuidance';
import { ShutoMergeInfo } from '../services/shutoAssist';
import { JunctionDetail } from '../services/elevated';
import { formatDistance } from '../services/mapService';

interface DriveModeCardProps {
  advices: LaneAdvice[];
  remaining: Map<number, number>;
  tracking: boolean;
  earlyMeters: number;
  liveLevel?: 'highway' | 'surface' | null;
  merges: ShutoMergeInfo[];
  junctions: JunctionDetail[];
  voiceOn: boolean;
  onToggleVoice: () => void;
  onExitDrive: () => void;
  trackError: string | null;
}

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

export const DriveModeCard: React.FC<DriveModeCardProps> = ({
  advices,
  remaining,
  tracking,
  earlyMeters,
  liveLevel,
  merges,
  junctions,
  voiceOn,
  onToggleVoice,
  onExitDrive,
  trackError,
}) => {
  const [showDetail, setShowDetail] = useState(false);

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

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-white w-full sm:w-96 z-40">
      <div
        className={`px-4 py-2 text-center text-sm font-bold tracking-wide ${
          isHighway ? 'bg-sky-600' : 'bg-emerald-600'
        }`}
      >
        {tracking && liveLevel
          ? isHighway
            ? '現在：高速（上層）'
            : '現在：一般道（下層）'
          : '走行モード'}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {primary ? (
          <section aria-label="次の案内" className="space-y-2">
            <div className="text-neutral-400 text-xs font-semibold">次の案内</div>
            <div
              className={`rounded-2xl p-5 border ${
                urgent
                  ? 'bg-red-950/60 border-red-500/50'
                  : 'bg-neutral-900 border-neutral-700'
              }`}
            >
              <div className="text-4xl font-extrabold tabular-nums">
                {primaryRem !== undefined ? (
                  <>あと{formatDistance(Math.max(primaryRem, 0))}</>
                ) : (
                  <>—</>
                )}
              </div>
              <div className="mt-2 text-xl font-bold leading-snug">
                {primary.advice.message}
              </div>
              {primary.advice.roadName && (
                <div className="mt-1 text-sm text-neutral-300">
                  {primary.advice.roadName}
                </div>
              )}
              {progress !== null && (
                <div
                  className="mt-3 h-2.5 rounded-full bg-neutral-800 overflow-hidden"
                  aria-hidden="true"
                >
                  <div
                    className={`h-full rounded-full ${urgent ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              )}
              {!tracking && (
                <div className="mt-2 text-xs text-neutral-400">
                  GPS追跡開始後に残距離がライブ表示されます
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl p-5 bg-neutral-900 border border-neutral-700 text-center text-sm text-neutral-300">
            案内ポイントがありません。そのまま直進でOKです。
          </section>
        )}

        {trackError && (
          <div className="text-xs text-red-400 bg-red-950/50 border border-red-500/30 rounded-xl px-3 py-2">
            {trackError}
          </div>
        )}

        {nextMerge && (
          <section className="rounded-xl px-3 py-2.5 bg-neutral-900 border border-orange-500/30 text-sm flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-600 text-white flex-shrink-0">
              {nextMerge.m.isShuto ? '首都高' : '合流'}
            </span>
            <span className="truncate">
              {nextMerge.m.roadName || nextMerge.m.instruction}
            </span>
            <span className="ml-auto text-neutral-300 whitespace-nowrap text-xs">
              あと
              {formatDistance(
                Math.max(nextMerge.rem ?? nextMerge.m.distanceToManeuver, 0)
              )}
            </span>
          </section>
        )}
        {nextJunction && (
          <section className="rounded-xl px-3 py-2.5 bg-neutral-900 border border-sky-500/30 text-sm flex items-center gap-2">
            <span className="text-xs font-bold text-sky-400 flex-shrink-0">JCT</span>
            <span className="truncate">{nextJunction.j.name}</span>
            <span className="ml-auto text-neutral-300 whitespace-nowrap text-xs">
              あと
              {formatDistance(
                Math.max(nextJunction.rem ?? nextJunction.j.distanceToManeuver, 0)
              )}
            </span>
          </section>
        )}

        <button
          onClick={() => setShowDetail((v) => !v)}
          className="w-full py-3 rounded-xl border border-neutral-700 bg-neutral-900 text-sm font-semibold flex items-center justify-center gap-1.5 min-h-[44px]"
          aria-expanded={showDetail}
        >
          {showDetail ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <span>{showDetail ? '詳細を閉じる' : '詳細（この先の案内）を開く'}</span>
        </button>
        {showDetail && (
          <div className="space-y-2">
            {advices.slice(0, 5).map((a) => {
              const rem = tracking ? remaining.get(a.stepIndex) : undefined;
              return (
                <div
                  key={a.stepIndex}
                  className="rounded-xl px-3 py-2 bg-neutral-900 border border-neutral-800 text-xs"
                >
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
              );
            })}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-neutral-800 grid grid-cols-3 gap-2">
        <button
          onClick={onToggleVoice}
          className={`py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 min-h-[44px] border ${
            voiceOn
              ? 'bg-emerald-600 border-emerald-600 text-white'
              : 'bg-neutral-900 border-neutral-700 text-neutral-300'
          }`}
          title="自動音声 ON/OFF"
        >
          {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          <span>{voiceOn ? '音声ON' : '音声OFF'}</span>
        </button>
        <button
          onClick={() => setShowDetail((v) => !v)}
          className="py-3 rounded-xl text-sm font-bold bg-neutral-900 border border-neutral-700 text-neutral-200 min-h-[44px]"
        >
          {showDetail ? '閉じる' : '詳細'}
        </button>
        <button
          id="exit-drive-mode-btn"
          onClick={onExitDrive}
          className="py-3 rounded-xl text-sm font-bold bg-white text-neutral-900 flex items-center justify-center gap-1.5 min-h-[44px]"
        >
          <Square size={14} />
          <span>終了</span>
        </button>
      </div>
    </div>
  );
};
