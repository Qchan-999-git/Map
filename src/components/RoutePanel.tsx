import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigation, Car, Footprints, Bike, ArrowUpDown, X, MapPin, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { DriverProfile, GeoPoint, RouteResult, TravelMode } from '../types';
import { DRIVER_PROFILES, getDriverProfileConfig } from '../data/driverProfiles';
import { NARROW_THRESHOLD_BY_VEHICLE, getNarrowThresholdForVehicle } from '../services/narrowRoad';
import { LaneGuidanceCard } from './LaneGuidanceCard';
import { ShutoMergeAssist } from './ShutoMergeAssist';
import { ElevatedBadge } from './ElevatedBadge';
import { TimeRestrictionCard } from './TimeRestrictionCard';
import { checkTimeRestrictions } from '../services/timeRestriction';
import { DriveModeCard } from './DriveModeCard';
import { buildLaneAdvices, speakAdvice } from '../services/laneGuidance';
import { useAutoLaneSpeech } from '../hooks/useAutoLaneSpeech';
import { findMerges } from '../services/shutoAssist';
import {
  analyzeElevated,
  computeHighwayRanges,
  ElevatedVerify,
  extractJunctions,
  levelAt,
  verifyElevatedTags,
} from '../services/elevated';
import { formatDistance, formatDuration } from '../services/mapService';

interface RoutePanelProps {
  routeStart: GeoPoint | null;
  routeEnd: GeoPoint | null;
  routeResult: RouteResult | null;
  currentLocation: { lat: number; lng: number } | null;
  isLoading: boolean;
  driverProfile: DriverProfile;
  onChangeDriverProfile: (profile: DriverProfile) => void;
  avoidNarrowRoads: boolean;
  narrowRoadThreshold: number;
  onChangeAvoidNarrowRoads: (value: boolean) => void;
  onChangeNarrowRoadThreshold: (value: number) => void;
  onSetStart: (point: GeoPoint | null) => void;
  onSetEnd: (point: GeoPoint | null) => void;
  onSwapPoints: () => void;
  onCalculateRoute: (mode: TravelMode) => void;
  onClearRoute: () => void;
  onClose: () => void;
  onDriveModeChange?: (driving: boolean) => void;
}

export const RoutePanel: React.FC<RoutePanelProps> = ({
  routeStart,
  routeEnd,
  routeResult,
  currentLocation,
  isLoading,
  driverProfile,
  onChangeDriverProfile,
  avoidNarrowRoads,
  narrowRoadThreshold,
  onChangeAvoidNarrowRoads,
  onChangeNarrowRoadThreshold,
  onSetStart,
  onSetEnd,
  onSwapPoints,
  onCalculateRoute,
  onClearRoute,
  onClose,
  onDriveModeChange,
}) => {
  const [mode, setMode] = useState<TravelMode>('driving');
  const [voiceOn, setVoiceOn] = useState(true);
  const [navMode, setNavMode] = useState<'plan' | 'drive'>('plan');

  const laneAdvices = useMemo(
    () => (routeResult ? buildLaneAdvices(routeResult.steps, driverProfile) : []),
    [routeResult, driverProfile]
  );
  const merges = useMemo(
    () => (routeResult ? findMerges(routeResult.steps) : []),
    [routeResult]
  );
  const elevatedInfo = useMemo(
    () => (routeResult ? analyzeElevated(routeResult.steps) : null),
    [routeResult]
  );
  const highwayRanges = useMemo(
    () => (routeResult ? computeHighwayRanges(routeResult.steps) : []),
    [routeResult]
  );
  const junctions = useMemo(
    () => (routeResult ? extractJunctions(routeResult.steps) : []),
    [routeResult]
  );
  const earlyMeters = getDriverProfileConfig(driverProfile).earlyGuidanceMeters;

  // 時間通行止めチェック（1分ごとに再評価・初心者向け簡易表示）
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const timeStatuses = useMemo(
    () => checkTimeRestrictions(routeResult, new Date(nowTick)),
    [routeResult, nowTick]
  );
  const nowLabel = useMemo(() => {
    const d = new Date(nowTick);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, [nowTick]);

  // Single shared GPS watch for lane + shuto auto guidance (hands-free)
  const autoSpeech = useAutoLaneSpeech(
    laneAdvices,
    routeResult?.coordinates ?? [],
    voiceOn && mode === 'driving' && laneAdvices.length > 0,
    earlyMeters
  );

  // Live elevated level from traveled distance
  const liveLevel =
    autoSpeech.tracking && highwayRanges.length > 0
      ? levelAt(autoSpeech.traveledMeters, highwayRanges)
      : null;

  // Dedicated voice on highway/surface switch (no tap)
  const prevLevelRef = useRef<'highway' | 'surface' | null>(null);
  useEffect(() => {
    if (!autoSpeech.tracking || !voiceOn || !liveLevel) return;
    if (prevLevelRef.current !== null && prevLevelRef.current !== liveLevel) {
      speakAdvice(
        liveLevel === 'highway'
          ? '高速に入りました。下道とお間違えなく。'
          : '一般道に入りました。上の高速とは別ルートです。'
      );
    }
    prevLevelRef.current = liveLevel;
  }, [liveLevel, autoSpeech.tracking, voiceOn]);

  // Overpass verification (bridge/tunnel) per route
  const [elevatedVerify, setElevatedVerify] = useState<ElevatedVerify>({ state: 'unknown' });
  useEffect(() => {
    if (!routeResult || mode !== 'driving') {
      setElevatedVerify({ state: 'unknown' });
      return;
    }
    const ctrl = new AbortController();
    setElevatedVerify({ state: 'checking' });
    const t = setTimeout(() => ctrl.abort(), 8000);
    verifyElevatedTags(routeResult.coordinates, ctrl.signal)
      .then(setElevatedVerify)
      .catch(() => setElevatedVerify({ state: 'unknown' }));
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [routeResult, mode]);

  const handleModeChange = (newMode: TravelMode) => {
    setMode(newMode);
    if (routeStart && routeEnd) {
      onCalculateRoute(newMode);
    }
  };

  const isDriving = navMode === 'drive';
  useEffect(() => {
    onDriveModeChange?.(isDriving);
  }, [isDriving, onDriveModeChange]);

  useEffect(() => {
    if (!routeResult) setNavMode('plan');
  }, [routeResult]);

  const canDrive =
    mode === 'driving' && routeResult !== null && laneAdvices.length > 0;

  const handleStartDrive = () => {
    if (!canDrive) return;
    setNavMode('drive');
    autoSpeech.start();
  };

  const handleExitDrive = () => {
    autoSpeech.stop();
    setNavMode('plan');
  };

  const handleClosePanel = () => {
    if (isDriving) autoSpeech.stop();
    setNavMode('plan');
    onClose();
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
          <span>{isDriving ? '走行モード' : 'ルート案内・経路検索'}</span>
        </div>
        <button
          id="close-route-panel-btn"
          onClick={handleClosePanel}
          className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {isDriving ? (
        <div className="flex-1 flex min-h-0">
          <DriveModeCard
            advices={laneAdvices}
            remaining={autoSpeech.remaining}
            tracking={autoSpeech.tracking}
            earlyMeters={earlyMeters}
            liveLevel={liveLevel}
            merges={merges}
            junctions={junctions}
            voiceOn={voiceOn}
            onToggleVoice={() => setVoiceOn((v) => !v)}
            onExitDrive={handleExitDrive}
            trackError={autoSpeech.error}
          />
        </div>
      ) : (
        <>
      {/* Inputs & Travel Modes */}
      <div className="p-4 space-y-3.5 border-b border-neutral-100">
        {/* Driver Profile Selector */}
        <div>
          <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>運転タイプ</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {DRIVER_PROFILES.map((p) => (
              <button
                key={p.id}
                id={`driver-profile-${p.id}-btn`}
                onClick={() => onChangeDriverProfile(p.id)}
                title={p.description}
                className={`py-1.5 px-1 rounded-lg text-xs font-semibold border transition-all ${
                  driverProfile === p.id
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-neutral-400 mt-1">
            {DRIVER_PROFILES.find((p) => p.id === driverProfile)?.description}
          </div>
        </div>

        {/* Narrow Road Avoidance Toggle */}
        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-neutral-700">狭い道を避ける</span>
              <span className="text-[10px] text-neutral-400 hidden sm:inline">
                すれ違いが難しい生活道路を回避
              </span>
            </div>
            <button
              id="toggle-avoid-narrow-roads"
              role="switch"
              aria-checked={avoidNarrowRoads}
              onClick={() => onChangeAvoidNarrowRoads(!avoidNarrowRoads)}
              className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 flex-shrink-0 ${
                avoidNarrowRoads ? 'bg-orange-500' : 'bg-neutral-300'
              }`}
              style={{ height: 22 }}
            >
              <span
                className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all duration-200 ${
                  avoidNarrowRoads ? 'left-[19px]' : 'left-0.5'
                }`}
                style={{ width: 18, height: 18, top: 2 }}
              />
            </button>
          </div>

          {avoidNarrowRoads && (
            <div className="mt-2.5 space-y-2">
              {/* Threshold slider */}
              <div className="flex items-center gap-2">
                <input
                  id="narrow-threshold-slider"
                  type="range"
                  min={3}
                  max={6}
                  step={0.5}
                  value={narrowRoadThreshold}
                  onChange={(e) => onChangeNarrowRoadThreshold(parseFloat(e.target.value))}
                  className="flex-1 accent-orange-500"
                  aria-label="狭い道の幅員閾値"
                />
                <span className="text-xs font-bold text-orange-600 tabular-nums w-14 text-right">
                  {narrowRoadThreshold.toFixed(1)} m
                </span>
              </div>

              {/* Vehicle-based presets (F-1-2) */}
              <div className="flex flex-wrap gap-1">
                {(Object.keys(NARROW_THRESHOLD_BY_VEHICLE) as (keyof typeof NARROW_THRESHOLD_BY_VEHICLE)[])
                  .filter((v) => v !== 'motorcycle')
                  .map((v) => {
                    const t = getNarrowThresholdForVehicle(v);
                    if (t === null) return null;
                    const labelMap: Record<string, string> = {
                      kei: '軽',
                      standard: '普通車',
                      large: 'SUV',
                      truck: 'トラック',
                    };
                    return (
                      <button
                        key={v}
                        onClick={() => onChangeNarrowRoadThreshold(t)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors ${
                          Math.abs(narrowRoadThreshold - t) < 0.001
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-neutral-50 text-neutral-500 border-neutral-200 hover:border-orange-300'
                        }`}
                      >
                        {labelMap[v]} {t.toFixed(1)}m
                      </button>
                    );
                  })}
              </div>

              <p className="text-[10px] text-neutral-400 leading-snug">
                閾値より狭い幅員の区間を避けてルートを選びます（OSM データが検証に使われます）。
              </p>
            </div>
          )}
        </div>

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
        {/* Time-based closure check (always visible: school zone / Ginza hokoten / timed no-right-turn) */}
        <TimeRestrictionCard statuses={timeStatuses} nowLabel={nowLabel} />

        {routeResult ? (
          <>
            {/* Early lane guidance (driving only, hands-free, shared GPS) */}
            {mode === 'driving' && laneAdvices.length > 0 && routeResult && (
              <LaneGuidanceCard
                advices={laneAdvices}
                earlyMeters={earlyMeters}
                routeCoordinates={routeResult.coordinates}
                tracking={autoSpeech.tracking}
                remaining={autoSpeech.remaining}
                voiceOn={voiceOn}
                onToggleVoice={() => setVoiceOn((v) => !v)}
                onStartTracking={autoSpeech.start}
                onStopTracking={autoSpeech.stop}
                trackError={autoSpeech.error}
              />
            )}

            {/* Shuto / merge assist (driving only, live remaining) */}
            {mode === 'driving' && merges.length > 0 && routeResult && (
              <ShutoMergeAssist
                merges={merges}
                totalDistance={routeResult.totalDistance}
                remaining={autoSpeech.remaining}
                tracking={autoSpeech.tracking}
              />
            )}

            {/* Elevated hierarchy badge (driving only) */}
            {mode === 'driving' && elevatedInfo && (
              <ElevatedBadge
                info={elevatedInfo}
                liveLevel={liveLevel}
                tracking={autoSpeech.tracking}
                junctions={junctions}
                remaining={autoSpeech.remaining}
                verify={elevatedVerify}
              />
            )}

            {/* Summary card */}
            {canDrive && (
              <button
                id="start-drive-mode-btn"
                onClick={handleStartDrive}
                className="w-full py-3 px-4 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 min-h-[44px]"
              >
                <Navigation size={16} />
                <span>走行開始（Next1件表示に切替）</span>
              </button>
            )}
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
              {/* Yutori stress summary */}
              {routeResult.profile && routeResult.profile !== 'standard' && (
                <div className="mt-2.5 pt-2.5 border-t border-blue-100/80 flex items-center gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                    ゆとり適用:{' '}
                    {routeResult.profile === 'beginner'
                      ? '初心者'
                      : routeResult.profile === 'elderly'
                        ? '高齢者'
                        : 'ゆとり優先'}
                  </span>
                  <span className="text-neutral-600">
                    右折 {routeResult.rightTurnCount ?? 0}回・左折 {routeResult.leftTurnCount ?? 0}回
                  </span>
                  {routeResult.stressScore !== undefined && (
                    <span className="text-neutral-500">ストレス {routeResult.stressScore}</span>
                  )}
                </div>
              )}
              {routeResult.alternatives && routeResult.alternatives.length > 1 && (
                <div className="mt-1.5 text-[11px] text-neutral-500">
                  {routeResult.alternatives.length}案から低ストレス順に選択
                </div>
              )}
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
        </>
      )}
    </div>
  );
};
