import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { MapContainer } from './components/MapContainer';
import { SearchBar } from './components/SearchBar';
import { LayerSelector } from './components/LayerSelector';
import { RoutePanel } from './components/RoutePanel';
import { SavedSpotsPanel } from './components/SavedSpotsPanel';
import { SpotDetailCard } from './components/SpotDetailCard';
import { MeasurementHUD } from './components/MeasurementHUD';
import { MapControls } from './components/MapControls';
import { MAP_LAYERS, INITIAL_SAVED_SPOTS } from './data/mapLayers';
import {
  ClickedLocationInfo,
  DriverProfile,
  GeoPoint,
  MapLayerConfig,
  ParkingSpot,
  RouteResult,
  SavedSpot,
  SearchResultItem,
  TravelMode,
  VehicleType,
} from './types';
import { DEFAULT_DRIVER_PROFILE } from './data/driverProfiles';
import { VEHICLE_PROFILES } from './data/vehicleProfiles';
import {
  calculateHaversineDistance,
  calculateRoute,
  formatDuration,
  getLocationDetails,
  searchNearbyParking,
} from './services/mapService';
import { Map as MapIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { RainSource, detectRainOnRoute } from './services/rainRadar';
import {
  clearAccidentReports as clearStoredAccidentReports,
  getAccidentReports,
  saveAccidentReport,
} from './services/accident';

const SAVED_SPOTS_STORAGE_KEY = 'map_app_saved_spots_v1';
const DRIVER_PROFILE_STORAGE_KEY = 'map_app_driver_profile_v1';
const AVOID_NARROW_STORAGE_KEY = 'navi_avoid_narrow_roads';
const NARROW_THRESHOLD_STORAGE_KEY = 'navi_narrow_road_threshold';
const WEATHER_VISIBLE_STORAGE_KEY = 'navi_show_weather';
const TRAFFIC_VISIBLE_STORAGE_KEY = 'navi_show_traffic';
const RAIN_VISIBLE_STORAGE_KEY = 'navi_show_rain_v2'; // 既定 OFF 化に伴い旧キー navi_show_rain から変更

/** サイドパネルの幅（px）。ヘッダー・fitBounds のオフセットに使用 */
const PANEL_WIDTH_PX = 420;

/** localStorage から boolean 設定を読む（壊れている場合は defaultValue） */
function readBooleanSetting(key: string, defaultValue: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored === 'true';
  } catch {
    // ignore
  }
  return defaultValue;
}

export default function App() {
  // Base map layer state
  const [currentLayer, setCurrentLayer] = useState<MapLayerConfig>(MAP_LAYERS[0]);

  // Saved Spots state with localStorage initialization
  const [savedSpots, setSavedSpots] = useState<SavedSpot[]>(() => {
    try {
      const stored = localStorage.getItem(SAVED_SPOTS_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    // Default initial spots in Tokyo
    return INITIAL_SAVED_SPOTS.map((s, idx) => ({
      ...s,
      id: `initial-spot-${idx}`,
      createdAt: Date.now() - idx * 86400000,
    }));
  });

  // Selected spot & clicked location
  const [selectedSpot, setSelectedSpot] = useState<SavedSpot | null>(null);
  const [clickedLocation, setClickedLocation] = useState<ClickedLocationInfo | null>(null);
  const [searchMarker, setSearchMarker] = useState<GeoPoint | null>(null);
  const [focusPoint, setFocusPoint] = useState<GeoPoint | null>(null);

  // Panels & Tools
  const [activePanel, setActivePanel] = useState<'none' | 'route' | 'spots'>('none');
  const [isDriving, setIsDriving] = useState(false);
  // ルートパネルの折りたたみ（地図を広く使う。デスクトップのみ）
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 640px)').matches : true
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 640px)');
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // パネルを閉じたら折りたたみ状態も解除
  useEffect(() => {
    if (activePanel === 'none') setPanelCollapsed(false);
  }, [activePanel]);

  // パネル表示中はヘッダー・フッター・詳細カードをパネル幅ぶん右へずらす（デスクトップ）
  const panelOpen = activePanel !== 'none';
  const offsetRight = panelOpen && !panelCollapsed && isDesktop ? PANEL_WIDTH_PX + 16 : 0;
  const routeMapLeftOffset =
    activePanel === 'route' && !panelCollapsed && isDesktop ? PANEL_WIDTH_PX : 0;

  // Route Planning State
  const [routeStart, setRouteStart] = useState<GeoPoint | null>(null);
  const [routeEnd, setRouteEnd] = useState<GeoPoint | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);

  // Vehicle type state (運転特性ベースの分類)
  const [vehicleType, setVehicleType] = useState<VehicleType>('standard');

  // 狭路カードから選択された区間（地図ハイライト用 stepIndex）
  const [narrowHighlightStepIndex, setNarrowHighlightStepIndex] = useState<number | null>(null);

  // 駐車場案内の状態
  const [parkingSpots, setParkingSpots] = useState<ParkingSpot[]>([]);
  const [parkingLoading, setParkingLoading] = useState(false);
  const [parkingError, setParkingError] = useState<string | null>(null);
  const [selectedParkingId, setSelectedParkingId] = useState<string | null>(null);

  // Driver profile state with localStorage initialization
  const [driverProfile, setDriverProfile] = useState<DriverProfile>(() => {
    try {
      const stored = localStorage.getItem(DRIVER_PROFILE_STORAGE_KEY);
      if (
        stored === 'standard' ||
        stored === 'beginner' ||
        stored === 'elderly' ||
        stored === 'yutori' ||
        stored === 'expert'
      ) {
        return stored;
      }
    } catch {
      // ignore
    }
    return DEFAULT_DRIVER_PROFILE;
  });

  // 狭い道回避設定（localStorage 永続化）
  const [avoidNarrowRoads, setAvoidNarrowRoads] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(AVOID_NARROW_STORAGE_KEY);
      if (stored !== null) return stored === 'true';
    } catch {
      // ignore
    }
    return false;
  });

  // 気象・混雑情報の表示 ON/OFF（localStorage 永続化）
  const [showWeather, setShowWeather] = useState<boolean>(() =>
    readBooleanSetting(WEATHER_VISIBLE_STORAGE_KEY, true)
  );
  const [showTraffic, setShowTraffic] = useState<boolean>(() =>
    readBooleanSetting(TRAFFIC_VISIBLE_STORAGE_KEY, true)
  );

  // 雨雲レーダー表示（localStorage 永続化・紹介用のお試し機能なので既定 OFF）
  const [showRain, setShowRain] = useState<boolean>(() =>
    readBooleanSetting(RAIN_VISIBLE_STORAGE_KEY, false)
  );
  const [rainForceSim] = useState<boolean>(() => {
    try {
      return new URLSearchParams(window.location.search).get('rain') === 'sim';
    } catch {
      return false;
    }
  });
  const [rainSource, setRainSource] = useState<RainSource | null>(null);
  const [routeRain, setRouteRain] = useState<boolean | null>(null);

  // 事故警告（localStorage の報告 + テスト用シミュレーション）
  const [simulateAccident, setSimulateAccident] = useState<boolean>(() => {
    try {
      return new URLSearchParams(window.location.search).get('accident') === 'sim';
    } catch {
      return false;
    }
  });
  const [accidentReportCount, setAccidentReportCount] = useState<number>(() => {
    try {
      return getAccidentReports().length;
    } catch {
      return 0;
    }
  });

  // MapControls の位置を計測し、雨雲UIをボタン群の左隣（下端揃え）に置く（CSS 変数経由）
  const controlsNavRef = useRef<HTMLElement | null>(null);
  const [controlsBox, setControlsBox] = useState({ right: 0, bottom: 0 });
  useEffect(() => {
    const node = controlsNavRef.current;
    const parent = node?.offsetParent;
    if (!node || !parent) return;
    const update = () => {
      const r = node.getBoundingClientRect();
      const p = parent.getBoundingClientRect();
      // right: 親の右端からボタン群の左端までの距離 / bottom: 親の下端からボタン群の下端までの距離
      setControlsBox({ right: p.right - r.left, bottom: p.bottom - r.bottom });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [activePanel]);
  const [narrowRoadThreshold, setNarrowRoadThreshold] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(NARROW_THRESHOLD_STORAGE_KEY);
      if (stored !== null) {
        const n = parseFloat(stored);
        if (!Number.isNaN(n) && n >= 3 && n <= 6) return n;
      }
    } catch {
      // ignore
    }
    return 4.0;
  });

  // Measurement Tool State
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [measureDistance, setMeasureDistance] = useState(0);

  // GPS / Geolocation State
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // HUD / Map status
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: 35.681236,
    lng: 139.767125,
  });
  const [mapZoom, setMapZoom] = useState(14);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage({ text, type });
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000);
  };

  const handleToggleRain = () => {
    setShowRain((v) => !v);
    showToast(!showRain ? '雨雲レーダーを表示します' : '雨雲レーダーを非表示にしました', 'info');
  };

  // Persist saved spots to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SAVED_SPOTS_STORAGE_KEY, JSON.stringify(savedSpots));
    } catch {
      // ignore
    }
  }, [savedSpots]);

  // Persist driver profile to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(DRIVER_PROFILE_STORAGE_KEY, driverProfile);
    } catch {
      // ignore
    }
  }, [driverProfile]);

  // Persist narrow-road avoidance settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(AVOID_NARROW_STORAGE_KEY, String(avoidNarrowRoads));
    } catch {
      // ignore
    }
  }, [avoidNarrowRoads]);

  useEffect(() => {
    try {
      localStorage.setItem(NARROW_THRESHOLD_STORAGE_KEY, String(narrowRoadThreshold));
    } catch {
      // ignore
    }
  }, [narrowRoadThreshold]);

  // 気象・混雑表示設定の永続化
  useEffect(() => {
    try {
      localStorage.setItem(WEATHER_VISIBLE_STORAGE_KEY, String(showWeather));
    } catch {
      // ignore
    }
  }, [showWeather]);

  useEffect(() => {
    try {
      localStorage.setItem(TRAFFIC_VISIBLE_STORAGE_KEY, String(showTraffic));
    } catch {
      // ignore
    }
  }, [showTraffic]);

  useEffect(() => {
    try {
      localStorage.setItem(RAIN_VISIBLE_STORAGE_KEY, String(showRain));
    } catch {
      // ignore
    }
  }, [showRain]);

  // ルート上に雨区間があるかを検出（シミュレーション表示時を除く）
  useEffect(() => {
    let cancelled = false;
    if (!routeResult || showRain !== true || !rainSource || rainSource === 'simulation') {
      setRouteRain(null);
      return;
    }
    const coordinates: [number, number][] = routeResult.coordinates.map((c) => [c[0], c[1]]);
    detectRainOnRoute(coordinates, rainSource)
      .then((rain) => {
        if (!cancelled) setRouteRain(rain);
      })
      .catch(() => {
        if (!cancelled) setRouteRain(null);
      });
    return () => {
      cancelled = true;
    };
  }, [routeResult, rainSource, showRain]);

  // 目的地が変わったら駐車場の検索結果をクリア
  useEffect(() => {
    setParkingSpots([]);
    setParkingLoading(false);
    setParkingError(null);
    setSelectedParkingId(null);
  }, [routeEnd]);

  // Recalculate measurement distance when points change
  useEffect(() => {
    if (measurePoints.length < 2) {
      setMeasureDistance(0);
      return;
    }
    let total = 0;
    for (let i = 0; i < measurePoints.length - 1; i++) {
      total += calculateHaversineDistance(
        measurePoints[i][0],
        measurePoints[i][1],
        measurePoints[i + 1][0],
        measurePoints[i + 1][1]
      );
    }
    setMeasureDistance(total);
  }, [measurePoints]);

  // Handle map click
  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    // If measuring mode is active, add point
    if (isMeasuring) {
      setMeasurePoints((prev) => [...prev, [lat, lng]]);
      return;
    }

    // Set clicked location and load details
    setClickedLocation({ lat, lng, loading: true });
    setSelectedSpot(null);

    const details = await getLocationDetails(lat, lng);
    setClickedLocation(details);
  }, [isMeasuring]);

  // Handle Spot Click
  const handleSpotClick = useCallback((spot: SavedSpot) => {
    setSelectedSpot(spot);
    setClickedLocation({
      lat: spot.lat,
      lng: spot.lng,
      address: spot.address,
      elevation: spot.elevation,
      loading: false,
    });
    setFocusPoint({ lat: spot.lat, lng: spot.lng, name: spot.title });
  }, []);

  // Handle Map Move
  const handleMapMove = useCallback((center: { lat: number; lng: number }, zoom: number) => {
    setMapCenter(center);
    setMapZoom(zoom);
  }, []);

  // Search selection
  const handleSelectSearchResult = (item: SearchResultItem) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    const name = item.display_name.split(',')[0];

    setSearchMarker({ lat, lng, name });
    setFocusPoint({ lat, lng, name });
    setClickedLocation({
      lat,
      lng,
      address: item.display_name,
      loading: false,
    });
  };

  const handleClearSearch = () => {
    setSearchMarker(null);
  };

  // Route calculation (driverProfile-aware + vehicleType-aware)
  const handleCalculateRoute = async (
    mode: TravelMode = 'driving',
    profileOverride?: DriverProfile,
    vehicleOverride?: VehicleType,
    accidentOverride?: { simulate?: boolean }
  ) => {
    if (!routeStart || !routeEnd) return;
    setIsRoutingLoading(true);
    const profile = profileOverride ?? driverProfile;
    const vehicle = vehicleOverride ?? vehicleType;
    const simulate = accidentOverride?.simulate ?? simulateAccident;

    try {
      const result = await calculateRoute(
        [routeStart.lat, routeStart.lng],
        [routeEnd.lat, routeEnd.lng],
        mode,
        profile,
        vehicle,
        { avoidNarrowRoads, narrowRoadThreshold, includeWeather: showWeather, includeTraffic: showTraffic, includeAccidents: true, simulateAccident: simulate }
      );
      setRouteResult(result);
      setNarrowHighlightStepIndex(null);
      const criticalCount = result.accidents?.segments.filter((s) => s.severity === 'critical').length ?? 0;
      if (criticalCount > 0) {
        showToast(`事故発生中：ルート上に${criticalCount}件の警告があります`, 'error');
      } else if (profile === 'expert') {
        showToast(
          `最速ルート検索: 約 ${formatDuration(result.totalDuration)}`,
          'success'
        );
      } else if (profile !== 'standard' && result.rightTurnCount !== undefined) {
        showToast(
          `ゆとりルート検索: 右折${result.rightTurnCount}回・ストレス${result.stressScore}`,
          'success'
        );
      } else {
        showToast('ルートを検索しました', 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('ルート検索に失敗しました', 'error');
    } finally {
      setIsRoutingLoading(false);
    }
  };

  const handleChangeDriverProfile = async (p: DriverProfile) => {
    setDriverProfile(p);
    // Re-calculate active route with new profile for immediate feedback
    if (routeStart && routeEnd) {
      await handleCalculateRoute(routeResult?.mode ?? 'driving', p);
    }
  };

  // Vehicle type change（既にルートがあれば再計算・トースト通知）
  const handleVehicleTypeChange = (vehicle: VehicleType) => {
    setVehicleType(vehicle);
    if (routeStart && routeEnd) {
      handleCalculateRoute(routeResult?.mode ?? 'driving', driverProfile, vehicle);
    }
    showToast(`車種を「${VEHICLE_PROFILES[vehicle].name}」に切り替えました`, 'info');
  };

  const handleSwapRoutePoints = () => {
    const temp = routeStart;
    setRouteStart(routeEnd);
    setRouteEnd(temp);
    if (routeResult && routeEnd && temp) {
      handleCalculateRoute(routeResult.mode);
    }
  };

  const handleClearRoute = () => {
    setRouteStart(null);
    setRouteEnd(null);
    setRouteResult(null);
  };

  // 事故シミュレーションの ON/OFF（切り替え時は既存ルートを再計算して警告を即時反映）
  const handleToggleSimulateAccident = () => {
    const next = !simulateAccident;
    setSimulateAccident(next);
    showToast(next ? 'テスト用の事故をシミュレートします' : 'シミュレーションを解除しました', 'info');
    if (routeStart && routeEnd) {
      // state 更新のタイミングに依存しないよう override で再計算する
      setTimeout(() => {
        handleCalculateRoute(routeResult?.mode ?? 'driving', undefined, undefined, { simulate: next });
      }, 0);
    }
  };

  // 事故報告のクリア
  const handleClearAccidentReports = () => {
    clearStoredAccidentReports();
    setAccidentReportCount(0);
    showToast('事故報告をクリアしました', 'info');
    if (routeStart && routeEnd) {
      handleCalculateRoute(routeResult?.mode ?? 'driving');
    }
  };

  // 地図クリック地点の事故を報告（半径300m以内のルートに警告表示・6時間で失効）
  const handleReportAccident = (lat: number, lng: number) => {
    saveAccidentReport(lat, lng, 'ユーザー報告');
    setAccidentReportCount(getAccidentReports().length);
    showToast('事故を報告しました。ルートを再検索すると警告に反映されます', 'success');
    if (routeStart && routeEnd) {
      handleCalculateRoute(routeResult?.mode ?? 'driving');
    }
  };

  // 目的地周辺の駐車場を検索（明示的なボタン押下時のみ実行）
  const handleSearchParking = useCallback(async () => {
    if (!routeEnd) return;
    setParkingLoading(true);
    setParkingError(null);
    setSelectedParkingId(null);
    setParkingSpots([]);
    try {
      const spots = await searchNearbyParking(routeEnd.lat, routeEnd.lng);
      setParkingSpots(spots);
      if (spots.length === 0) {
        setParkingError('周辺に駐車場が見つかりませんでした');
      } else {
        showToast(`${spots.length} 件の駐車場を表示しました`, 'success');
      }
    } catch (err) {
      console.error('Parking search error:', err);
      setParkingError('駐車場の検索に失敗しました。時間をおいて再試行してください');
    } finally {
      setParkingLoading(false);
    }
  }, [routeEnd]);

  // 駐車場選択: 地図上でハイライト + その地点へパン
  const handleSelectParking = useCallback((spot: ParkingSpot | null) => {
    setSelectedParkingId(spot?.id ?? null);
    if (spot) {
      setFocusPoint({ lat: spot.lat, lng: spot.lng, name: spot.name });
    }
  }, []);

  // Spot management
  const handleSaveSpot = (newSpotData: Omit<SavedSpot, 'id' | 'createdAt'>) => {
    const spot: SavedSpot = {
      ...newSpotData,
      id: `spot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
    };
    setSavedSpots((prev) => [spot, ...prev]);
    setSelectedSpot(spot);
    showToast(`「${spot.title}」を登録しました`, 'success');
  };

  const handleDeleteSpot = (id: string) => {
    setSavedSpots((prev) => prev.filter((s) => s.id !== id));
    if (selectedSpot?.id === id) {
      setSelectedSpot(null);
      setClickedLocation(null);
    }
    showToast('登録地点を削除しました', 'info');
  };

  const handleImportSpots = (imported: SavedSpot[]) => {
    setSavedSpots(imported);
    showToast(`${imported.length} 件の地点を読み込みました`, 'success');
  };

  // Locate current position
  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      showToast('お使いのブラウザは位置情報をサポートしていません', 'error');
      return;
    }

    setIsLocating(true);
    showToast('現在地を取得中...', 'info');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setCurrentLocation(coords);
        setFocusPoint({ lat: coords.lat, lng: coords.lng, name: '現在地' });
        setIsLocating(false);
        showToast('現在地を表示しました', 'success');
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setIsLocating(false);
        showToast('現在地を取得できませんでした。位置情報の許可をご確認ください。', 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Zoom controls triggering via Leaflet map
  const handleZoomIn = () => {
    const el = document.getElementById('leaflet-map');
    if (el) {
      // dispatch synthetic double click or get leaflet instance
      const leafletMap = (window as unknown as { _currentMap?: { zoomIn: () => void } })._currentMap;
      if (leafletMap) leafletMap.zoomIn();
      else {
        // trigger zoom on map container
        const btn = document.querySelector('.leaflet-control-zoom-in') as HTMLAnchorElement;
        if (btn) btn.click();
        else setMapZoom((prev) => Math.min(prev + 1, 19));
      }
    }
  };

  const handleZoomOut = () => {
    const leafletMap = (window as unknown as { _currentMap?: { zoomOut: () => void } })._currentMap;
    if (leafletMap) leafletMap.zoomOut();
    else {
      const btn = document.querySelector('.leaflet-control-zoom-out') as HTMLAnchorElement;
      if (btn) btn.click();
      else setMapZoom((prev) => Math.max(prev - 1, 3));
    }
  };

  const handleResetNorth = () => {
    // Reset view to current center with smooth pan
    setFocusPoint({ lat: mapCenter.lat, lng: mapCenter.lng });
    showToast('正面（北上）に設定しました', 'info');
  };

  return (
    <main
      className="relative w-screen h-screen overflow-hidden bg-neutral-900 font-sans"
      style={
        {
          ['--map-controls-right']: `${controlsBox.right}px`,
          ['--map-controls-bottom']: `${controlsBox.bottom}px`,
        } as CSSProperties
      }
    >
      {/* Fullscreen Map Layer */}
      <MapContainer
        currentLayer={currentLayer}
        savedSpots={savedSpots}
        selectedSpot={selectedSpot}
        clickedLocation={clickedLocation}
        searchMarker={searchMarker}
        currentLocation={currentLocation}
        parkingSpots={parkingSpots}
        selectedParkingId={selectedParkingId}
        onParkingClick={handleSelectParking}
        routeResult={routeResult}
        routeStart={routeStart}
        routeEnd={routeEnd}
        isMeasuring={isMeasuring}
        measurePoints={measurePoints}
        isDriving={isDriving}
        onMapClick={handleMapClick}
        onSpotClick={handleSpotClick}
        onMapMove={handleMapMove}
        focusPoint={focusPoint}
        narrowHighlightStepIndex={narrowHighlightStepIndex}
        showRain={showRain}
        rainForceSim={rainForceSim}
        onRainSourceChange={setRainSource}
        mapLeftOffset={routeMapLeftOffset}
      />

      {/* Top Floating Header & Search Bar */}
      <header
        className="absolute top-3 left-3 right-3 sm:right-auto sm:left-4 z-30 flex items-start gap-2.5 pointer-events-none transition-[left] duration-200"
        style={offsetRight > 0 ? { left: offsetRight } : undefined}
      >
        {/* Brand Pill */}
        <div className="hidden sm:flex items-center gap-2 px-3.5 py-3.5 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-neutral-200/80 pointer-events-auto">
          <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <MapIcon size={15} />
          </div>
          <span className="font-extrabold text-sm tracking-tight text-neutral-900">地図アプリ</span>
        </div>

        {/* Search Bar */}
        <div className="flex-1 sm:w-80 md:w-96 pointer-events-auto">
          <SearchBar
            onSelectResult={handleSelectSearchResult}
            onClearSearch={handleClearSearch}
          />
        </div>

        {/* Layer Selector */}
        <div className="pointer-events-auto">
          <LayerSelector
            currentLayer={currentLayer}
            onSelectLayer={(l) => {
              setCurrentLayer(l);
              showToast(`「${l.name}」に切り替えました`, 'info');
            }}
            showRain={showRain}
            onToggleRain={handleToggleRain}
          />
        </div>
      </header>

      {/* Sliding Side Drawers (Route or Saved Spots) */}
      {activePanel !== 'none' && (
        <aside
          aria-label="サイドパネル"
          className={`absolute left-0 bottom-0 z-40 flex flex-col animate-in slide-in-from-bottom duration-300 sm:slide-in-from-left sm:duration-200 shadow-2xl ${
            panelCollapsed && activePanel === 'route'
              ? 'w-full h-16 sm:w-14 sm:top-0 sm:h-full sm:rounded-none rounded-t-2xl'
              : 'w-full h-[76vh] sm:top-0 sm:h-full sm:w-[420px] sm:rounded-none rounded-t-2xl'
          }`}
        >
          {/* モバイル用のドラッグハンドル */}
          <div className="sm:hidden flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-neutral-300" />
          </div>
          <div className="flex-1 min-h-0">
          {activePanel === 'route' && (
            <RoutePanel
              routeStart={routeStart}
              routeEnd={routeEnd}
              routeResult={routeResult}
              currentLocation={currentLocation}
              isLoading={isRoutingLoading}
              driverProfile={driverProfile}
              onChangeDriverProfile={handleChangeDriverProfile}
              vehicleType={vehicleType}
              onVehicleTypeChange={handleVehicleTypeChange}
              avoidNarrowRoads={avoidNarrowRoads}
              narrowRoadThreshold={narrowRoadThreshold}
              onChangeAvoidNarrowRoads={setAvoidNarrowRoads}
              onChangeNarrowRoadThreshold={setNarrowRoadThreshold}
              onSetStart={(pt) => {
                setRouteStart(pt);
                if (pt && routeEnd) handleCalculateRoute();
              }}
              onSetEnd={(pt) => {
                setRouteEnd(pt);
                if (routeStart && pt) handleCalculateRoute();
              }}
              onSwapPoints={handleSwapRoutePoints}
              onCalculateRoute={(mode, vehicle) => handleCalculateRoute(mode, undefined, vehicle)}
              onClearRoute={handleClearRoute}
              onClose={() => setActivePanel('none')}
              onDriveModeChange={setIsDriving}
              onNarrowSegmentClick={setNarrowHighlightStepIndex}
              selectedNarrowStepIndex={narrowHighlightStepIndex}
              parkingSpots={parkingSpots}
              parkingLoading={parkingLoading}
              parkingError={parkingError}
              selectedParkingId={selectedParkingId}
              onSearchParking={handleSearchParking}
              onSelectParking={handleSelectParking}
              showWeather={showWeather}
              onToggleWeather={() => setShowWeather((v) => !v)}
              showTraffic={showTraffic}
              onToggleTraffic={() => setShowTraffic((v) => !v)}
              showRain={showRain}
              onToggleRain={handleToggleRain}
              routeRain={routeRain}
              simulateAccident={simulateAccident}
              onToggleSimulateAccident={handleToggleSimulateAccident}
              accidentReportCount={accidentReportCount}
              onClearAccidentReports={handleClearAccidentReports}
              collapsed={panelCollapsed}
              onCollapse={() => setPanelCollapsed(true)}
              onExpand={() => setPanelCollapsed(false)}
            />
          )}

          {activePanel === 'spots' && (
            <SavedSpotsPanel
              savedSpots={savedSpots}
              selectedSpot={selectedSpot}
              onSelectSpot={(spot) => {
                handleSpotClick(spot);
              }}
              onDeleteSpot={handleDeleteSpot}
              onImportSpots={handleImportSpots}
              onClose={() => setActivePanel('none')}
              onSetRouteTarget={(spot) => {
                setRouteEnd({
                  lat: spot.lat,
                  lng: spot.lng,
                  name: spot.title,
                  address: spot.address,
                });
                setActivePanel('route');
                if (currentLocation && !routeStart) {
                  setRouteStart({
                    lat: currentLocation.lat,
                    lng: currentLocation.lng,
                    name: '現在地',
                  });
                }
              }}
            />
          )}
          </div>
        </aside>
      )}

      {/* Floating Measurement HUD (Top center when active) */}
      {isMeasuring && !isDriving && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-30 pointer-events-auto px-3 w-full max-w-sm">
          <MeasurementHUD
            totalDistance={measureDistance}
            pointsCount={measurePoints.length}
            onUndo={() => setMeasurePoints((prev) => prev.slice(0, -1))}
            onClear={() => setMeasurePoints([])}
            onClose={() => {
              setIsMeasuring(false);
              setMeasurePoints([]);
            }}
          />
        </div>
      )}

      {/* Floating Spot Detail Card (Bottom left / bottom center) */}
      {clickedLocation && !isMeasuring && !isDriving && (
        <div
          className="absolute bottom-10 left-3 sm:left-4 z-50 pointer-events-auto max-w-sm w-[calc(100%-1.5rem)] sm:w-96 transition-[left] duration-200"
          style={offsetRight > 0 ? { left: offsetRight } : undefined}
        >
          <SpotDetailCard
            location={clickedLocation}
            existingSpot={selectedSpot}
            onClose={() => {
              setClickedLocation(null);
              setSelectedSpot(null);
            }}
            onSetStart={(pt) => {
              setRouteStart(pt);
              setClickedLocation(null);
              setSelectedSpot(null);
              setActivePanel('route');
              if (routeEnd) handleCalculateRoute();
            }}
            onSetEnd={(pt) => {
              setRouteEnd(pt);
              setClickedLocation(null);
              setSelectedSpot(null);
              setActivePanel('route');
              if (routeStart) handleCalculateRoute();
            }}
            onSaveSpot={handleSaveSpot}
            onReportAccident={() => handleReportAccident(clickedLocation.lat, clickedLocation.lng)}
          />
        </div>
      )}

      {/* Right Floating Map Controls */}
      <nav
        ref={controlsNavRef}
        aria-label="地図操作コントロール"
        className="absolute right-3 bottom-10 sm:right-4 sm:bottom-12 z-30"
      >
        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onLocateUser={handleLocateUser}
          onResetNorth={handleResetNorth}
          isLocating={isLocating}
          activePanel={activePanel}
          onToggleRoute={() => {
            setActivePanel((prev) => (prev === 'route' ? 'none' : 'route'));
          }}
          onToggleSpots={() => {
            setActivePanel((prev) => (prev === 'spots' ? 'none' : 'spots'));
          }}
          showRain={showRain}
          onToggleRain={handleToggleRain}
          isMeasuring={isMeasuring}
          onToggleMeasure={() => {
            setIsMeasuring(!isMeasuring);
            if (!isMeasuring) {
              setClickedLocation(null);
              setSelectedSpot(null);
              showToast('距離計測モードを開始しました', 'info');
            } else {
              setMeasurePoints([]);
            }
          }}
          savedSpotsCount={savedSpots.length}
        />
      </nav>

      {/* Bottom Status Bar (Coordinates & Zoom Level) */}
      <footer
        className="absolute bottom-2 left-3 sm:left-4 z-20 pointer-events-none hidden md:flex items-center gap-2 text-[11px] font-mono text-neutral-600 bg-white/80 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-neutral-200/60 shadow-xs transition-[left] duration-200"
        style={offsetRight > 0 ? { left: offsetRight } : undefined}
      >
        <span>緯度: {mapCenter.lat.toFixed(4)}°</span>
        <span>経度: {mapCenter.lng.toFixed(4)}°</span>
        <span>ズーム: {mapZoom}</span>
      </footer>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-16 sm:bottom-6 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div
            className={`px-4 py-2 rounded-xl shadow-xl backdrop-blur-md text-xs font-semibold flex items-center gap-2 border ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-100 border-emerald-700/50'
                : toastMessage.type === 'error'
                ? 'bg-rose-950/90 text-rose-100 border-rose-700/50'
                : 'bg-neutral-900/90 text-neutral-100 border-neutral-700/50'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 size={15} className="text-emerald-400" />
            ) : toastMessage.type === 'error' ? (
              <AlertCircle size={15} className="text-rose-400" />
            ) : null}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}
    </main>
  );
}
