import React from 'react';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { TimeRestrictionStatus } from '../services/timeRestriction';

interface TimeRestrictionCardProps {
  statuses: TimeRestrictionStatus[];
  nowLabel: string;
}

/** 時間通行止めの簡易チェック表示（初心者向け：×通れません / ○今は通れます） */
export const TimeRestrictionCard: React.FC<TimeRestrictionCardProps> = ({ statuses, nowLabel }) => {
  const blockedCount = statuses.filter((s) => s.blocked).length;
  return (
    <div className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50/80 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
          <Clock size={15} className="text-amber-600" />
          <span>時間通行止めチェック</span>
        </div>
        <span className="text-[10px] text-amber-700 font-mono">現在 {nowLabel}</span>
      </div>

      {blockedCount > 0 ? (
        <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold flex items-center gap-1.5">
          <AlertTriangle size={14} />
          <span>×通れません {blockedCount}件あり（迂回してください）</span>
        </div>
      ) : (
        <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5">
          <CheckCircle2 size={14} />
          <span>○今は通れます</span>
        </div>
      )}

      <div className="mt-2 space-y-1.5">
        {statuses.map(({ restriction, blocked, message, onRoute }) => (
          <div
            key={restriction.id}
            className={`p-2 rounded-xl border text-[11px] ${
              blocked
                ? 'border-red-300 bg-red-50 text-red-800'
                : 'border-amber-100 bg-white/70 text-neutral-700'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              <span>{blocked ? '×' : '○'}</span>
              <span>{restriction.name}</span>
              {onRoute && (
                <span className="ml-auto px-1.5 py-0.5 rounded-full bg-neutral-900 text-white text-[10px] font-bold">
                  ルート上
                </span>
              )}
            </div>
            <div className="mt-0.5 text-neutral-600">{message}</div>
            <div className="text-[10px] text-neutral-400">{restriction.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
