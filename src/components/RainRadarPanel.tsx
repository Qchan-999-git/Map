import React from 'react';
import { Play, Pause, SkipBack, SkipForward, CloudRain } from 'lucide-react';
import {
  RAINVIEWER_CREDIT,
  RAINVIEWER_CREDIT_URL,
  RainFrame,
  RainSource,
  rainSourceLabel,
} from '../services/rainRadar';

interface RainRadarPanelProps {
  source: RainSource | null;
  frames: RainFrame[];
  frameIndex: number;
  playing: boolean;
  onTogglePlay: () => void;
  onSeek: (index: number) => void;
}

const LEGEND_STOPS: { threshold: number; color: string }[] = [
  { threshold: 80, color: '#a5dcff' },
  { threshold: 50, color: '#3db9ff' },
  { threshold: 30, color: '#ffd500' },
  { threshold: 20, color: '#ff8700' },
  { threshold: 10, color: '#ef292f' },
  { threshold: 5, color: '#d41159' },
  { threshold: 3, color: '#8a1f9c' },
  { threshold: 1, color: '#4a0d67' },
];

function formatFrameTime(time: number): string {
  const d = new Date(time * 1000);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 地図右下の雨雲レーダーUI（出典・凡例・再生コントロール） */
export const RainRadarPanel: React.FC<RainRadarPanelProps> = ({
  source,
  frames,
  frameIndex,
  playing,
  onTogglePlay,
  onSeek,
}) => {
  if (!source || frames.length === 0) return null;
  const current = frames[frameIndex];
  const gradient = `linear-gradient(to right, ${LEGEND_STOPS.map(
    (s) => s.color
  ).join(', ')})`;

  return (
    <div
      className="pointer-events-auto flex flex-col items-stretch gap-2"
      style={{ width: 176 }}
    >
      {/* 出典 / データ種別 */}
      <div className="bg-white/90 backdrop-blur-md border border-neutral-200/90 shadow-xl rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
        <CloudRain size={13} className="text-sky-600" />
        <span className="text-[10px] font-bold text-neutral-800">{rainSourceLabel(source)}</span>
        {source === 'rainviewer' && (
          <a
            href={RAINVIEWER_CREDIT_URL}
            target="_blank"
            rel="noreferrer"
            className="text-[9px] text-sky-600 underline"
          >
            {RAINVIEWER_CREDIT}
          </a>
        )}
      </div>

      {/* 凡例 */}
      <div className="bg-white/90 backdrop-blur-md border border-neutral-200/90 shadow-xl rounded-xl px-2.5 py-2">
        <div className="flex items-center justify-between text-[9px] text-neutral-500 font-semibold mb-1">
          <span>弱</span>
          <span>雨の強さ（mm/h）</span>
          <span>強</span>
        </div>
        <div
          className="h-2 rounded-full"
          style={{ background: gradient, opacity: 0.85 }}
        />
        <div className="flex justify-between text-[8px] text-neutral-400 mt-0.5 tabular-nums">
          <span>1</span>
          <span>3</span>
          <span>5</span>
          <span>10</span>
          <span>20</span>
          <span>30</span>
          <span>50</span>
          <span>80+</span>
        </div>
      </div>

      {/* 再生コントロール */}
      <div className="bg-white/90 backdrop-blur-md border border-neutral-200/90 shadow-xl rounded-xl px-2 py-1.5">
        <div className="flex items-center justify-between gap-1">
          <button
            id="rain-play-pause-btn"
            onClick={onTogglePlay}
            className="p-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors"
            title={playing ? '一時停止' : '再生'}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            id="rain-prev-btn"
            onClick={() => onSeek(Math.max(0, frameIndex - 1))}
            disabled={frameIndex <= 0}
            className="p-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 transition-colors"
            title="前のフレーム"
          >
            <SkipBack size={14} />
          </button>
          <span className="text-[10px] font-bold text-neutral-700 tabular-nums">
            {current ? formatFrameTime(current.time) : '--:--'}
          </span>
          <button
            id="rain-next-btn"
            onClick={() => onSeek(Math.min(frames.length - 1, frameIndex + 1))}
            disabled={frameIndex >= frames.length - 1}
            className="p-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 transition-colors"
            title="次のフレーム"
          >
            <SkipForward size={14} />
          </button>
        </div>

        {/* フレームスクラバー */}
        <div className="flex gap-1 mt-1.5 px-0.5">
          {frames.map((_, i) => (
            <button
              key={i}
              onClick={() => onSeek(i)}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i === frameIndex ? 'bg-sky-600' : 'bg-neutral-200 hover:bg-neutral-300'
              }`}
              title={`${formatFrameTime(frames[i].time)}`}
            />
          ))}
        </div>
        {source === 'simulation' && (
          <div className="mt-1 text-[8px] text-neutral-400 text-center">
            実際の天気を示すものではありません
          </div>
        )}
      </div>
    </div>
  );
};