import React from 'react';
import { Ruler, RotateCcw, Trash2, X } from 'lucide-react';
import { formatDistance } from '../services/mapService';

interface MeasurementHUDProps {
  totalDistance: number;
  pointsCount: number;
  onUndo: () => void;
  onClear: () => void;
  onClose: () => void;
}

export const MeasurementHUD: React.FC<MeasurementHUDProps> = ({
  totalDistance,
  pointsCount,
  onUndo,
  onClear,
  onClose,
}) => {
  return (
    <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-neutral-200/90 p-3 max-w-sm w-full text-neutral-800 animate-in fade-in slide-in-from-top-3 duration-200">
      <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
        <div className="flex items-center gap-2 font-bold text-xs text-orange-600">
          <Ruler size={16} />
          <span>距離計測モード</span>
        </div>
        <button
          id="close-measurement-btn"
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-700 p-1 rounded-full hover:bg-neutral-100 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="py-2.5 flex items-center justify-between">
        <div>
          <div className="text-[10px] text-neutral-400 font-semibold uppercase">合計距離</div>
          <div className="text-xl font-extrabold text-neutral-900 mt-0.5">
            {formatDistance(totalDistance)}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] text-neutral-400 font-semibold uppercase">地点数</div>
          <div className="text-sm font-bold text-neutral-700 mt-0.5">
            {pointsCount} 地点
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          id="undo-measurement-point-btn"
          disabled={pointsCount === 0}
          onClick={onUndo}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-40 text-neutral-700 text-xs font-medium transition-colors"
          title="直前の地点を取り消し"
        >
          <RotateCcw size={13} />
          <span>戻す</span>
        </button>

        <button
          id="clear-measurement-btn"
          disabled={pointsCount === 0}
          onClick={onClear}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-40 text-rose-600 text-xs font-medium transition-colors"
          title="計測リセット"
        >
          <Trash2 size={13} />
          <span>クリア</span>
        </button>
      </div>

      <div className="text-[10px] text-neutral-400 text-center mt-2">
        地図上をクリックしてポイントを追加できます
      </div>
    </div>
  );
};
