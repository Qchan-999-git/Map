import React, { useState } from 'react';
import { Navigation, Car, Footprints, Bike, ArrowUpDown, X, MapPin, Loader2, CheckCircle2 } from 'lucide-react';
import { GeoPoint, RouteResult, TravelMode } from '../types';
import { formatDistance, formatDuration } from '../services/mapService';

interface RoutePanelProps {
  routeStart: GeoPoint | null;
  routeEnd: GeoPoint | null;
  routeResult: RouteResult | null;
  currentLocation: { lat: number; lng: number } | null;
  isLoading: boolean;
  onSetStart: (point: GeoPoint | null) => void;
  onSetEnd: (point: GeoPoint | null) => void;
  onSwapPoints: () => void;
  onCalculateRoute: (mode: TravelMode) => void;
  onClearRoute: () => void;
  onClose: () => void;
}

export const RoutePanel: React.FC<RoutePanelProps> = ({
  routeStart,
  routeEnd,
  routeResult,
  currentLocation,
  isLoading,
  onSetStart,
  onSetEnd,
  onSwapPoints,
  onCalculateRoute,
  onClearRoute,
  onClose,
}) => {
  const [mode, setMode] = useState<TravelMode>('driving');

  const handleModeChange = (newMode: TravelMode) => {
    setMode(newMode);
    if (routeStart && routeEnd) {
      onCalculateRoute(newMode);
    }
  };

  const handleUseCurrentLocationForStart = () => {
    if (!currentLocation) return;
    onSetStart({
      lat: currentLocation.lat,
      lng: currentLocation.lng,
      name: '現在地',
      address: '現在位置 (GPS)',
    });
  };

  return (
    <div className="flex flex-col h-full bg-white/95 backdrop-blur-md border-r border-neutral-200/90 shadow-2xl w-full sm:w-96 text-neutral-800 z-40">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200/80 flex items-center justify-between bg-neutral-50/70">
        <div className="flex items-center gap-2 font-bold text-base text-neutral-900">
          <Navigation size={20} className="text-blue-600" />
          <span>ルート案内・経路検索</span>
        </div>
        <button
          id="close-route-panel-btn"
          onClick={onClose}
          className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Inputs & Travel Modes */}
      <div className="p-4 space-y-3.5 border-b border-neutral-100">
        {/* Travel Mode Toggle */}
        <div className="flex bg-neutral-100 p-1 rounded-xl">
          <button
            id="mode-driving-btn"
            onClick={() => handleModeChange('driving')}
            className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'driving'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Car size={16} />
            <span>車</span>
          </button>
          <button
            id="mode-walking-btn"
            onClick={() => handleModeChange('walking')}
            className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'walking'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Footprints size={16} />
            <span>徒歩</span>
          </button>
          <button
            id="mode-cycling-btn"
            onClick={() => handleModeChange('cycling')}
            className={`flex-1 py-1.5 flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'cycling'
                ? 'bg-white text-amber-600 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Bike size={16} />
            <span>自転車</span>
          </button>
        </div>

        {/* Start & End Inputs */}
        <div className="relative flex items-center gap-2">
          <div className="flex-1 space-y-2">
            {/* Start Point */}
            <div className="flex items-center gap-2 bg-neutral-50 px-3 py-2 rounded-xl border border-neutral-200">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-neutral-400 font-semibold uppercase">出発地</div>
                <div className="text-xs font-medium truncate text-neutral-800">
                  {routeStart ? routeStart.name || routeStart.address || `${routeStart.lat.toFixed(4)}, ${routeStart.lng.toFixed(4)}` : (
                    <span className="text-neutral-400 italic">地図上をクリック または 選択</span>
                  )}
                </div>
              </div>
              {routeStart && (
                <button
                  onClick={() => onSetStart(null)}
                  className="text-neutral-400 hover:text-neutral-600 p-0.5"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* End Point */}
            <div className="flex items-center gap-2 bg-neutral-50 px-3 py-2 rounded-xl border border-neutral-200">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-neutral-400 font-semibold uppercase">目的地</div>
                <div className="text-xs font-medium truncate text-neutral-800">
                  {routeEnd ? routeEnd.name || routeEnd.address || `${routeEnd.lat.toFixed(4)}, ${routeEnd.lng.toFixed(4)}` : (
                    <span className="text-neutral-400 italic">地図上をクリック または 選択</span>
                  )}
                </div>
              </div>
              {routeEnd && (
                <button
                  onClick={() => onSetEnd(null)}
                  className="text-neutral-400 hover:text-neutral-600 p-0.5"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Swap Button */}
          <button
            id="swap-route-points-btn"
            onClick={onSwapPoints}
            className="p-2.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 hover:text-neutral-900 transition-colors shadow-xs"
            title="出発地と目的地を入れ替え"
          >
            <ArrowUpDown size={16} />
          </button>
        </div>

        {/* Quick GPS button */}
        {currentLocation && !routeStart && (
          <button
            id="use-current-as-start-btn"
            onClick={handleUseCurrentLocationForStart}
            className="w-full py-1.5 px-3 rounded-lg border border-blue-200 bg-blue-50/80 text-blue-700 hover:bg-blue-100 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <MapPin size={14} />
            <span>現在地を出発地に設定</span>
          </button>
        )}

        {/* Calculate / Action button */}
        <div className="flex gap-2 pt-1">
          <button
            id="compute-route-btn"
            disabled={!routeStart || !routeEnd || isLoading}
            onClick={() => onCalculateRoute(mode)}
            className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-200 disabled:text-neutral-400 text-white font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>検索中...</span>
              </>
            ) : (
              <>
                <Navigation size={16} />
                <span>ルートを検索</span>
              </>
            )}
          </button>

          {(routeResult || routeStart || routeEnd) && (
            <button
              id="clear-route-btn"
              onClick={onClearRoute}
              className="py-2.5 px-3 rounded-xl border border-neutral-200 hover:bg-neutral-100 text-neutral-600 text-xs font-medium transition-colors"
            >
              クリア
            </button>
          )}
        </div>
      </div>

      {/* Results / Step-by-Step Directions */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {routeResult ? (
          <>
            {/* Summary card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 p-4 rounded-2xl border border-blue-100/90 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-blue-600 font-semibold uppercase">所要時間・距離</div>
                  <div className="text-2xl font-bold text-neutral-900 mt-0.5">
                    {formatDuration(routeResult.totalDuration)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-neutral-800">
                    {formatDistance(routeResult.totalDistance)}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">
                    {routeResult.mode === 'driving' ? '自動車' : routeResult.mode === 'walking' ? '徒歩' : '自転車'}
                  </div>
                </div>
              </div>
            </div>

            {/* Directions List */}
            <div>
              <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-blue-600" />
                <span>進行手順 ({routeResult.steps.length} 区間)</span>
              </div>

              <div className="space-y-2">
                {routeResult.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl border border-neutral-100 hover:border-neutral-200 bg-neutral-50/50 flex items-start gap-2.5 transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-neutral-800">
                        {step.instruction}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-400">
                        <span>{formatDistance(step.distance)}</span>
                        {step.name && (
                          <>
                            <span>•</span>
                            <span className="truncate">{step.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-10 px-4 text-neutral-400">
            <Navigation size={36} className="mx-auto text-neutral-300 mb-2" />
            <div className="text-xs font-medium text-neutral-600">
              出発地と目的地を指定してください
            </div>
            <div className="text-[11px] text-neutral-400 mt-1 max-w-xs mx-auto">
              地図上をクリックして「出発地に設定」または「目的地に設定」を選択できます
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
