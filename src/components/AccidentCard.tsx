import React from 'react';
import { AlertTriangle, Siren, ShieldCheck, FlaskConical, Trash2 } from 'lucide-react';
import { AccidentAnalysis } from '../types';

interface AccidentCardProps {
  accidents: AccidentAnalysis | null | undefined;
  simulated: boolean;
  onToggleSimulate: () => void;
  reportCount: number;
  onClearReports: () => void;
}

/** 事故発生時の経路警告を表示する。critical があれば赤の強い警告、なければ注意区間または安全表示。 */
export const AccidentCard: React.FC<AccidentCardProps> = ({
  accidents,
  simulated,
  onToggleSimulate,
  reportCount,
  onClearReports,
}) => {
  if (accidents === undefined) return null;

  if (accidents === null) {
    return (
      <div className="p-3 rounded-2xl border border-neutral-200 bg-white/70 text-[11px] text-neutral-500 flex items-center gap-2">
        <Siren size={15} className="text-neutral-400" />
        <span>事故情報を取得できませんでした</span>
      </div>
    );
  }

  const critical = accidents.segments.filter((s) => s.severity === 'critical');
  const warnings = accidents.segments.filter((s) => s.severity === 'warning');
  const hasAccident = critical.length > 0;

  return (
    <div
      className={`p-3.5 rounded-2xl border shadow-sm ${
        hasAccident
          ? 'border-red-300 bg-red-50/90'
          : warnings.length > 0
            ? 'border-orange-200 bg-orange-50/70'
            : 'border-emerald-100 bg-emerald-50/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={`text-[11px] font-bold flex items-center gap-1.5 ${
            hasAccident ? 'text-red-800' : warnings.length > 0 ? 'text-orange-800' : 'text-emerald-800'
          }`}
        >
          {hasAccident ? (
            <Siren size={14} className="text-red-600" />
          ) : warnings.length > 0 ? (
            <AlertTriangle size={14} className="text-orange-500" />
          ) : (
            <ShieldCheck size={14} className="text-emerald-600" />
          )}
          <span>事故・危険区間</span>
        </div>
        {accidents.simulated && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-neutral-900 text-white">
            シミュレーション
          </span>
        )}
      </div>

      {hasAccident ? (
        <div className="mt-2 px-2.5 py-2 rounded-lg bg-red-600 text-white text-xs font-bold flex items-center gap-1.5">
          <Siren size={14} />
          <span>事故発生中 {critical.length}件 — 徐行・迂回してください</span>
        </div>
      ) : warnings.length > 0 ? (
        <div className="mt-2 text-[11px] text-orange-800 font-semibold">
          事故注意区間が{warnings.length}件あります（合流・幹線）
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-emerald-700 flex items-center gap-1.5">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            安全
          </span>
          <span>ルート上の事故報告はありません</span>
        </div>
      )}

      {(critical.length > 0 || warnings.length > 0) && (
        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-0.5">
          {[...critical, ...warnings].slice(0, 10).map((seg, idx) => (
            <div
              key={idx}
              className={`flex items-start justify-between gap-2 text-[11px] border rounded-lg px-2 py-1.5 ${
                seg.severity === 'critical'
                  ? 'bg-white/90 border-red-200 text-red-900'
                  : 'bg-white/70 border-orange-100 text-neutral-700'
              }`}
            >
              <span className="flex items-start gap-1.5 min-w-0">
                {seg.severity === 'critical' ? (
                  <Siren size={12} className="text-red-600 flex-shrink-0 mt-px" />
                ) : (
                  <AlertTriangle size={12} className="text-orange-400 flex-shrink-0 mt-px" />
                )}
                <span className="min-w-0">
                  <span className="font-semibold block truncate">{seg.name}</span>
                  <span className="text-[10px] text-neutral-500 block leading-snug">{seg.reason}</span>
                </span>
              </span>
              <span className="flex-shrink-0 text-[10px] text-neutral-400 tabular-nums">
                {(seg.distance / 1000).toFixed(1)}km
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        <button
          id="toggle-accident-sim-btn"
          onClick={onToggleSimulate}
          title="デモ用の模擬事故をルート中間に1件追加・解除します"
          className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold border flex items-center justify-center gap-1 transition-colors ${
            simulated
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-white text-neutral-600 border-neutral-200 hover:border-red-300 hover:text-red-700'
          }`}
        >
          <FlaskConical size={13} />
          <span>{simulated ? 'シミュレーション解除' : '事故をシミュレート'}</span>
        </button>
        {reportCount > 0 && (
          <button
            id="clear-accident-reports-btn"
            onClick={onClearReports}
            title="保存済みの事故報告をすべて削除します"
            className="py-1.5 px-2 rounded-lg text-[11px] font-semibold border bg-white text-neutral-500 border-neutral-200 hover:text-neutral-800 flex items-center gap-1"
          >
            <Trash2 size={13} />
            <span>報告クリア({reportCount})</span>
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[10px] text-neutral-400 leading-snug">
        報告は地図クリック → 「事故を報告」から登録できます（半径300m以内のルートに警告表示・6時間で失効）。
      </p>
    </div>
  );
};
