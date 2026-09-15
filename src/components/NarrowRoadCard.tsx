import React from 'react';
import { CheckCircle2, AlertTriangle, MapPin } from 'lucide-react';
import { NarrowRoadAnalysis } from '../types';
import { formatDistance } from '../services/mapService';

interface NarrowRoadCardProps {
  analysis?: NarrowRoadAnalysis;
  selectedStepIndex?: number | null;
  onSelectSegment?: (stepIndex: number | null) => void;
}

/**
 * 狭い道（すれ違い困難な生活道路・路地）の分析結果カード。
 * - 狭路ゼロ: 緑系の成功表示
 * - 狭路あり: 警告色 + 最大3区間のリスト（タップで地図上ハイライト）
 * - 回避しきれなかった場合は説明文を必ず表示
 */
export const NarrowRoadCard: React.FC<NarrowRoadCardProps> = ({
  analysis,
  selectedStepIndex,
  onSelectSegment,
}) => {
  if (!analysis) return null;

  const { segments, totalNarrowDistance, narrowRatio, verified } = analysis;
  const hasNarrow = segments.length > 0;
  const ratioPercent = Math.round(narrowRatio * 100);
  const displaySegments = segments.slice(0, 3);

  // 出発地・目的地そのものが生活道路に面しているケース（回避不能の典型的パターン）
  const hasEndpointNarrow =
    segments.some((s) => s.stepIndex === 0) ||
    segments.some((s) => s.stepIndex === segments[segments.length - 1].stepIndex);

  return (
    <div
      className={`p-3.5 rounded-2xl border shadow-sm ${
        hasNarrow
          ? 'border-orange-200 bg-orange-50/80'
          : 'border-emerald-200 bg-emerald-50/80'
      }`}
    >
      <div className="flex items-center gap-1.5">
        {hasNarrow ? (
          <>
            <AlertTriangle size={15} className="text-orange-600" />
            <span className="text-xs font-bold text-orange-800">狭い道の検出</span>
          </>
        ) : (
          <>
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span className="text-xs font-bold text-emerald-800">狭い道なし</span>
          </>
        )}
        {verified && (
          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-white/70 text-neutral-500 font-semibold border border-neutral-200">
            OSM検証済
          </span>
        )}
      </div>

      {hasNarrow ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold text-orange-700">
              約 {formatDistance(totalNarrowDistance)}
            </span>
            <span className="text-[11px] font-semibold text-orange-600">
              全体の {ratioPercent}%
            </span>
          </div>

          <div className="mt-2 space-y-1.5">
            {displaySegments.map((seg) => {
              const isSelected = selectedStepIndex === seg.stepIndex;
              return (
                <button
                  key={seg.stepIndex}
                  onClick={() => onSelectSegment?.(isSelected ? null : seg.stepIndex)}
                  className={`w-full text-left p-2 rounded-xl border text-[11px] transition-colors ${
                    isSelected
                      ? 'border-orange-500 bg-orange-100/80'
                      : 'border-orange-100 bg-white/70 hover:border-orange-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-neutral-800">
                    <MapPin size={12} className="text-orange-500 flex-shrink-0" />
                    <span className="truncate">{seg.name}</span>
                    <span className="ml-auto text-[10px] text-orange-600 font-bold flex-shrink-0">
                      {formatDistance(seg.distance)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-neutral-500">
                    {seg.level === 'very_narrow' ? (
                      <span className="text-red-600 font-bold">非常に狭い・</span>
                    ) : null}
                    {seg.reason}
                    {seg.oneway ? '（一方通行）' : ''}
                  </div>
                </button>
              );
            })}
          </div>

          {segments.length > 3 && (
            <div className="mt-1.5 text-[10px] text-orange-600 font-semibold">
              ほか {segments.length - 3} 区間
            </div>
          )}

          <div className="mt-2.5 p-2 rounded-xl bg-orange-100/60 border border-orange-200/70 text-[10px] text-orange-800 leading-snug flex items-start gap-1.5">
            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
            <span>
              {hasEndpointNarrow
                ? '出発地・目的地の周辺が生活道路のため、狭い道を完全には回避できませんでした。'
                : '目的地周辺のため、狭い道を完全には回避できませんでした。'}
              区間をタップすると地図上にハイライトされます。
            </span>
          </div>
        </>
      ) : (
        <div className="mt-2 px-2.5 py-2 rounded-xl bg-emerald-100/70 border border-emerald-200/70 text-[11px] font-semibold text-emerald-800">
          このルートに狭い道はありません
        </div>
      )}
    </div>
  );
};