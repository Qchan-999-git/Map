import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, ArrowRight, ArrowLeft, ArrowUp, GitMerge, Navigation, Square } from 'lucide-react';
import { LaneAdvice, speakAdvice } from '../services/laneGuidance';
import { useAutoLaneSpeech } from '../hooks/useAutoLaneSpeech';
import { formatDistance } from '../services/mapService';

interface LaneGuidanceCardProps {
  advices: LaneAdvice[];
  earlyMeters: number;
  routeCoordinates: [number, number][];
}

function DirectionIcon({ dir }: { dir: LaneAdvice['direction'] }) {
  const cls = 'text-white';
  switch (dir) {
    case 'right':
      return <ArrowRight size={18} className={cls} />;
    case 'left':
      return <ArrowLeft size={18} className={cls} />;
    case 'merge':
      return <GitMerge size={18} className={cls} />;
    default:
      return <ArrowUp size={18} className={cls} />;
  }
}

function directionColor(dir: LaneAdvice['direction']): string {
  switch (dir) {
    case 'right':
      return 'bg-amber-500';
    case 'left':
      return 'bg-emerald-500';
    case 'merge':
      return 'bg-orange-600';
    default:
      return 'bg-blue-500';
  }
}

export const LaneGuidanceCard: React.FC<LaneGuidanceCardProps> = ({
  advices,
  earlyMeters,
  routeCoordinates,
}) => {
  const [voiceOn, setVoiceOn] = useState(true);
  const { tracking, error, remaining, start, stop } = useAutoLaneSpeech(
    advices,
    routeCoordinates,
    voiceOn,
    earlyMeters
  );

  // Hands-free: announce first guidance once right after search (no tap)
  useEffect(() => {
    if (!voiceOn || advices.length === 0) return;
    const t = setTimeout(() => {
      speakAdvice(`ゆとり案内を開始します。${advices[0].earlyMessage}`);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advices]);

  if (advices.length === 0) return null;
  const visible = advices.slice(0, 3);

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-teal-50/60 p-3.5 rounded-2xl border border-emerald-100 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
          ゆとり車線案内・自動（タップ不要）
        </div>
        <button
          id="lane-voice-toggle-btn"
          onClick={() => setVoiceOn((v) => !v)}
          className={`p-1.5 rounded-lg border transition-colors ${
            voiceOn
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-neutral-500 border-neutral-200'
          }`}
          title="自動音声 ON/OFF"
        >
          {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
      </div>

      <div className="flex gap-2 mb-2.5">
        {!tracking ? (
          <button
            id="lane-tracking-start-btn"
            onClick={start}
            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Navigation size={14} />
            <span>走行中の自動案内を開始</span>
          </button>
        ) : (
          <button
            id="lane-tracking-stop-btn"
            onClick={stop}
            className="flex-1 py-2 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Square size={14} />
            <span>自動案内を停止</span>
          </button>
        )}
      </div>
      {error && <div className="text-[11px] text-rose-600 mb-2">{error}</div>}
      {tracking && (
        <div className="text-[11px] text-emerald-700 mb-2 font-semibold">
          GPS追跡中…残距離で自動読み上げします（操作不要）
        </div>
      )}

      <div className="space-y-2">
        {visible.map((a, i) => {
          const rem = remaining.get(a.stepIndex);
          return (
            <div
              key={`${a.stepIndex}-${i}`}
              className="w-full text-left p-2.5 rounded-xl bg-white/80 border border-emerald-100 flex items-start gap-2.5"
            >
              <div
                className={`w-8 h-8 rounded-lg ${directionColor(a.direction)} flex items-center justify-center flex-shrink-0 shadow-sm`}
              >
                <DirectionIcon dir={a.direction} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-neutral-800">
                  {a.earlyMessage}
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  {rem !== undefined && tracking ? (
                    <>
                      あと{formatDistance(Math.max(rem, 0))}・手順{a.stepIndex + 1}
                    </>
                  ) : (
                    <>
                      {formatDistance(a.distanceToManeuver)}先・手順{a.stepIndex + 1}
                    </>
                  )}
                  {a.roadName ? `・${a.roadName}` : ''}
                </div>
                <div className="text-[11px] text-emerald-700 mt-0.5">{a.message}</div>
              </div>
            </div>
          );
        })}
      </div>

      {advices.length > 3 && (
        <div className="mt-1.5 text-[11px] text-neutral-500 text-center">
          他 {advices.length - 3} 件の案内あり（手順リスト参照）
        </div>
      )}
    </div>
  );
};
