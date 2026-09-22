import React from 'react';
import { CarFront, Clock, Info, Route } from 'lucide-react';
import { CongestionAnalysis, CongestionLevel } from '../types';

interface CongestionCardProps {
  congestion: CongestionAnalysis | null | undefined;
}

const LEVEL_LABEL: Record<CongestionLevel, string> = {
  smooth: '順調',
  moderate: 'やや混雑',
  heavy: '混雑',
};

const LEVEL_CLASS: Record<CongestionLevel, string> = {
  smooth: 'bg-emerald-100 text-emerald-700',
  moderate: 'bg-amber-100 text-amber-700',
  heavy: 'bg-red-100 text-red-700',
};

/** 混雑する区間の一覧と混雑補正後の所要時間を表示する。 */
export const CongestionCard: React.FC<CongestionCardProps> = ({ congestion }) => {
  if (congestion === undefined) return null;

  if (congestion === null) {
    return (
      <div className="p-3 rounded-2xl border border-neutral-200 bg-white/70 text-[11px] text-neutral-500 flex items-center gap-2">
        <CarFront size={15} className="text-neutral-400" />
        <span>交通情報を取得できませんでした</span>
      </div>
    );
  }

  const hasSegments = congestion.segments.length > 0;

  return (
    <div className="p-3.5 rounded-2xl border border-amber-100 bg-amber-50/60 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
          <CarFront size={14} className="text-amber-600" />
          <span>交通混雑</span>
        </div>
        <span className="text-[9px] text-neutral-500 flex items-center gap-1">
          <Info size={11} />
          時間帯からの推定
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-neutral-600">
        <Clock size={13} className="text-amber-600" />
        <span>
          混雑を考慮した所要時間
          <span className="ml-1 font-bold text-neutral-800 tabular-nums">
            {Math.round(congestion.adjustedDuration / 60)}分
          </span>
        </span>
        {congestion.congestionFactor > 1 && (
          <span className="text-[10px] text-neutral-400">
            ×{congestion.congestionFactor.toFixed(2)}
          </span>
        )}
      </div>

      {hasSegments ? (
        <div className="mt-2 space-y-1">
          {congestion.segments.map((seg, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-2 text-[11px] bg-white/70 border border-amber-100 rounded-lg px-2 py-1.5"
            >
              <span className="flex items-center gap-1.5 min-w-0 text-neutral-700">
                <Route size={12} className="text-neutral-400 flex-shrink-0" />
                <span className="truncate">{seg.name}</span>
              </span>
              <span className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${LEVEL_CLASS[seg.level]}`}>
                  {LEVEL_LABEL[seg.level]}
                </span>
                <span className="text-[10px] text-neutral-400 tabular-nums">
                  {(seg.distance / 1000).toFixed(1)}km
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-emerald-700 flex items-center gap-1.5">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            順調
          </span>
          <span>現在のところ混雑が予測される区間はありません</span>
        </div>
      )}
    </div>
  );
};