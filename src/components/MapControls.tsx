import React from 'react';
import { Plus, Minus, Locate, Navigation, Bookmark, Ruler, Maximize2, Minimize2, Compass } from 'lucide-react';

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocateUser: () => void;
  onResetNorth: () => void;
  isLocating: boolean;
  activePanel: 'none' | 'route' | 'spots';
  onToggleRoute: () => void;
  onToggleSpots: () => void;
  isMeasuring: boolean;
  onToggleMeasure: () => void;
  savedSpotsCount: number;
}

export const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onLocateUser,
  onResetNorth,
  isLocating,
  activePanel,
  onToggleRoute,
  onToggleSpots,
  isMeasuring,
  onToggleMeasure,
  savedSpotsCount,
}) => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-2 pointer-events-auto">
      {/* Function Toggle Buttons */}
      <div className="flex flex-col bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-neutral-200/80 p-1 divide-y divide-neutral-100">
        {/* Route Panel Toggle */}
        <button
          id="toggle-route-panel-btn"
          onClick={onToggleRoute}
          className={`p-2.5 rounded-xl transition-all relative flex items-center justify-center ${
            activePanel === 'route'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-neutral-700 hover:bg-neutral-100'
          }`}
          title="ルート案内・経路検索"
        >
          <Navigation size={18} />
        </button>

        {/* Saved Spots Toggle */}
        <button
          id="toggle-saved-spots-btn"
          onClick={onToggleSpots}
          className={`p-2.5 rounded-xl transition-all relative flex items-center justify-center ${
            activePanel === 'spots'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-neutral-700 hover:bg-neutral-100'
          }`}
          title="登録地点・お気に入り一覧"
        >
          <Bookmark size={18} />
          {savedSpotsCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 border border-white" />
          )}
        </button>

        {/* Measurement Toggle */}
        <button
          id="toggle-measure-tool-btn"
          onClick={onToggleMeasure}
          className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${
            isMeasuring
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-neutral-700 hover:bg-neutral-100'
          }`}
          title="距離計測ツール"
        >
          <Ruler size={18} />
        </button>
      </div>

      {/* Navigation & Zoom Controls */}
      <div className="flex flex-col bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-neutral-200/80 p-1 divide-y divide-neutral-100">
        {/* Current Location (GPS) */}
        <button
          id="locate-user-btn"
          onClick={onLocateUser}
          className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${
            isLocating ? 'text-blue-600 bg-blue-50' : 'text-neutral-700 hover:bg-neutral-100'
          }`}
          title="現在地に移動 (GPS)"
        >
          <Locate size={18} className={isLocating ? 'animate-pulse text-blue-600' : ''} />
        </button>

        {/* North / Compass Reset */}
        <button
          id="reset-north-btn"
          onClick={onResetNorth}
          className="p-2.5 rounded-xl text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center justify-center"
          title="北を上にする"
        >
          <Compass size={18} />
        </button>

        {/* Zoom In */}
        <button
          id="zoom-in-btn"
          onClick={onZoomIn}
          className="p-2.5 rounded-xl text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center justify-center"
          title="拡大"
        >
          <Plus size={18} />
        </button>

        {/* Zoom Out */}
        <button
          id="zoom-out-btn"
          onClick={onZoomOut}
          className="p-2.5 rounded-xl text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center justify-center"
          title="縮小"
        >
          <Minus size={18} />
        </button>

        {/* Fullscreen */}
        <button
          id="fullscreen-btn"
          onClick={toggleFullscreen}
          className="p-2.5 rounded-xl text-neutral-700 hover:bg-neutral-100 transition-colors hidden sm:flex items-center justify-center"
          title="全画面表示切替"
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>
    </div>
  );
};
