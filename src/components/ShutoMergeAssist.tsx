import React from 'react';
import { GitMerge, HeartHandshake } from 'lucide-react';
import { ShutoMergeInfo } from '../services/shutoAssist';
import { formatDistance } from '../services/mapService';

interface ShutoMergeAssistProps {
  merges: ShutoMergeInfo[];
  totalDistance: number;
  remaining?: Map<number, number>;
  tracking?: boolean;
  compact?: boolean;
}

/**
 * Shuto/merge assist card.
 * Shows next merges with remaining distance, progress bar, and mental-prep message.
 * No tap needed while driving (display + voice comes from LaneGuidance auto-speech).
 */
export const ShutoMergeAssist: React.FC<ShutoMergeAssistProps> = ({
  merges,
  totalDistance,
  remaining,
  tracking,
  compact = false,
}) => {
  if (merges.length === 0) return null;
  const visible = merges.slice(0, compact ? 1 : 2);
  const hasShuto = merges.some((m) => m.isShuto);

  return (
    <div className="bg-gradient-to-br from-orange-50 to-amber-50/60 p-3.5 rounded-2xl border border-orange-100 shadow-sm">
      <div className="text-[11px] font-bold text-orange-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <GitMerge size={14} />
        <span>{hasShuto ? '首都高アシスト' : '合流アシスト'}</span>
      </div>
      <div className="space-y-2">
        {visible.map((m) => {
          const progress =
            totalDistance > 0
              ? Math.min(100, Math.max(0, (m.distanceToManeuver / totalDistance) * 100))
              : 0;
          const liveRemaining = tracking ? remaining?.get(m.stepIndex) : undefined;
          return (
            <div
              key={m.stepIndex}
              className="p-2.5 rounded-xl bg-white/80 border border-orange-100"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    m.isShuto
                      ? 'bg-orange-600 text-white'
                      : 'bg-orange-100 text-orange-700'
                  }`}
                >
                  {m.isShuto ? '首都高' : '合流'}
                </span>
                <span className="text-xs font-semibold text-neutral-800 truncate">
                  {m.roadName || m.instruction}
                </span>
                <span className="ml-auto text-[11px] text-neutral-500 whitespace-nowrap">
                  {liveRemaining !== undefined ? (
                    <>あと{formatDistance(Math.max(liveRemaining, 0))}・手順{m.stepIndex + 1}</>
                  ) : (
                    <>{formatDistance(m.distanceToManeuver)}先・手順{m.stepIndex + 1}</>
                  )}
                </span>
              </div>

              {/* Merge visual: main flow + joining lane */}
              <div className="mt-2 flex items-center gap-2" aria-hidden="true">
                <div className="flex-1 h-2 rounded-full bg-neutral-200 relative overflow-hidden">
                  <div
                    className="absolute left-0 top-0 bottom-0 rounded-full bg-orange-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <GitMerge size={14} className="text-orange-600 flex-shrink-0" />
              </div>

              {!compact && (
                <div className="mt-1.5 text-[11px] text-neutral-600 flex items-start gap-1.5">
                  <HeartHandshake size={13} className="text-orange-500 flex-shrink-0 mt-0.5" />
                  <span>
                    合流まで余裕を持って速度・車間を調整。本線の流れを確認して心の準備を。
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!compact && merges.length > 2 && (
        <div className="mt-1.5 text-[11px] text-neutral-500 text-center">
          他 {merges.length - 2} 件の合流あり
        </div>
      )}
    </div>
  );
};
