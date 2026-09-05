import { useState, useEffect, useCallback, useRef } from 'react';
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
  GeoPoint,
  MapLayerConfig,
  RouteResult,
  SavedSpot,
  SearchResultItem,
  TravelMode,
} from './types';
import {
  calculateHaversineDistance,
  calculateRoute,
  getLocationDetails,
} from './services/mapService';
import { Map as MapIcon, CheckCircle2, AlertCircle } from 'lucide-react';

const SAVED_SPOTS_STORAGE_KEY = 'map_app_saved_spots_v1';

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

  // Route Planning State
  const [routeStart, setRouteStart] = useState<GeoPoint | null>(null);
  const [routeEnd, setRouteEnd] = useState<GeoPoint | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);

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

  // Persist saved spots to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SAVED_SPOTS_STORAGE_KEY, JSON.stringify(savedSpots));
    } catch {
      // ignore
    }
  }, [savedSpots]);

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

  // Route calculation
  const handleCalculateRoute = async (mode: TravelMode = 'driving') => {
    if (!routeStart || !routeEnd) return;
    setIsRoutingLoading(true);

    try {
      const result = await calculateRoute([routeStart.lat, routeStart.lng], [routeEnd.lat, routeEnd.lng], mode);
      setRouteResult(result);
      showToast('ルートを検索しました', 'success');
    } catch (err) {
      console.error(err);
      showToast('ルート検索に失敗しました', 'error');
    } finally {
      setIsRoutingLoading(false);
    }
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
    <main className="relative w-screen h-screen overflow-hidden bg-neutral-900 font-sans">
      {/* Fullscreen Map Layer */}
      <MapContainer
        currentLayer={currentLayer}
        savedSpots={savedSpots}
        selectedSpot={selectedSpot}
        clickedLocation={clickedLocation}
        searchMarker={searchMarker}
        currentLocation={currentLocation}
        routeResult={routeResult}
        routeStart={routeStart}
        routeEnd={routeEnd}
        isMeasuring={isMeasuring}
        measurePoints={measurePoints}
        onMapClick={handleMapClick}
        onSpotClick={handleSpotClick}
        onMapMove={handleMapMove}
        focusPoint={focusPoint}
      />

      {/* Top Floating Header & Search Bar */}
      <header className="absolute top-3 left-3 right-3 sm:right-auto sm:left-4 z-30 flex items-start gap-2.5 pointer-events-none">
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
          />
        </div>
      </header>

      {/* Sliding Side Drawers (Route or Saved Spots) */}
      {activePanel !== 'none' && (
        <aside aria-label="サイドパネル" className="absolute top-0 left-0 bottom-0 z-40 animate-in slide-in-from-left duration-200 shadow-2xl">
          {activePanel === 'route' && (
            <RoutePanel
              routeStart={routeStart}
              routeEnd={routeEnd}
              routeResult={routeResult}
              currentLocation={currentLocation}
              isLoading={isRoutingLoading}
              onSetStart={(pt) => {
                setRouteStart(pt);
                if (pt && routeEnd) handleCalculateRoute();
              }}
              onSetEnd={(pt) => {
                setRouteEnd(pt);
                if (routeStart && pt) handleCalculateRoute();
              }}
              onSwapPoints={handleSwapRoutePoints}
              onCalculateRoute={handleCalculateRoute}
              onClearRoute={handleClearRoute}
              onClose={() => setActivePanel('none')}
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
        </aside>
      )}

      {/* Floating Measurement HUD (Top center when active) */}
      {isMeasuring && (
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
      {clickedLocation && !isMeasuring && (
        <div className="absolute bottom-10 left-3 sm:left-4 z-30 pointer-events-auto max-w-sm w-[calc(100%-1.5rem)] sm:w-96">
          <SpotDetailCard
            location={clickedLocation}
            existingSpot={selectedSpot}
            onClose={() => {
              setClickedLocation(null);
              setSelectedSpot(null);
            }}
            onSetStart={(pt) => {
              setRouteStart(pt);
              setActivePanel('route');
              if (routeEnd) handleCalculateRoute();
            }}
            onSetEnd={(pt) => {
              setRouteEnd(pt);
              setActivePanel('route');
              if (routeStart) handleCalculateRoute();
            }}
            onSaveSpot={handleSaveSpot}
          />
        </div>
      )}

      {/* Right Floating Map Controls */}
      <nav aria-label="地図操作コントロール" className="absolute right-3 bottom-10 sm:right-4 sm:bottom-12 z-30">
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
      <footer className="absolute bottom-2 left-3 sm:left-4 z-20 pointer-events-none hidden md:flex items-center gap-2 text-[11px] font-mono text-neutral-600 bg-white/80 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-neutral-200/60 shadow-xs">
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
