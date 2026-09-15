import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { ClickedLocationInfo, GeoPoint, MapLayerConfig, ParkingSpot, RouteResult, RouteStep, SavedSpot } from '../types';
import { CATEGORY_INFO } from '../data/mapLayers';

interface MapContainerProps {
  currentLayer: MapLayerConfig;
  savedSpots: SavedSpot[];
  selectedSpot: SavedSpot | null;
  clickedLocation: ClickedLocationInfo | null;
  searchMarker: GeoPoint | null;
  currentLocation: { lat: number; lng: number; accuracy?: number } | null;
  parkingSpots: ParkingSpot[];
  selectedParkingId: string | null;
  onParkingClick: (spot: ParkingSpot) => void;
  routeResult: RouteResult | null;
  routeStart: GeoPoint | null;
  routeEnd: GeoPoint | null;
  isMeasuring: boolean;
  measurePoints: [number, number][];
  isDriving?: boolean;
  onMapClick: (lat: number, lng: number) => void;
  onSpotClick: (spot: SavedSpot) => void;
  onMapMove: (center: { lat: number; lng: number }, zoom: number) => void;
  focusPoint: GeoPoint | null;
  narrowHighlightStepIndex?: number | null;
}

interface NarrowSection {
  stepIndex: number;
  name: string;
  points: [number, number][];
  estimatedWidth?: number;
}

/**
 * 狭路判定済みステップ（narrowLevel）をルートポリライン座標の区間へ分解する。
 * ステップの maneuver 地点（location）を区切りの目安に使う。
 */
function buildNarrowSections(
  coordinates: [number, number][],
  steps: RouteStep[]
): NarrowSection[] {
  const sections: NarrowSection[] = [];
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (st.narrowLevel !== 'narrow' && st.narrowLevel !== 'very_narrow') continue;
    const endLoc = st.location;
    if (!endLoc) continue;
    const startLoc = i === 0 ? coordinates[0] : steps[i - 1]?.location ?? coordinates[0];
    const startIdx = nearestCoordIndex(coordinates, startLoc);
    const endIdx = nearestCoordIndex(coordinates, endLoc);
    const points = coordinates.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
    if (points.length >= 2) {
      sections.push({
        stepIndex: i,
        name: st.name || '名称のない道路',
        points,
        estimatedWidth: st.estimatedWidth,
      });
    }
  }
  return sections;
}

function nearestCoordIndex(
  coordinates: [number, number][],
  point: [number, number]
): number {
  let best = 0;
  let bestDist = Infinity;
  coordinates.forEach((c, idx) => {
    const d = (c[0] - point[0]) ** 2 + (c[1] - point[1]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = idx;
    }
  });
  return best;
}

export const MapContainer: React.FC<MapContainerProps> = ({
  currentLayer,
  savedSpots,
  selectedSpot,
  clickedLocation,
  searchMarker,
  currentLocation,
  parkingSpots,
  selectedParkingId,
  onParkingClick,
  routeResult,
  routeStart,
  routeEnd,
  isMeasuring,
  measurePoints,
  isDriving,
  onMapClick,
  onSpotClick,
  onMapMove,
  focusPoint,
  narrowHighlightStepIndex,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Layer groups for markers
  const savedSpotsLayerRef = useRef<L.LayerGroup | null>(null);
  const tempMarkerLayerRef = useRef<L.LayerGroup | null>(null);
  const parkingLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const measureLayerRef = useRef<L.LayerGroup | null>(null);
  const locationLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center: Tokyo Station (35.6812, 139.7671)
    const map = L.map(mapContainerRef.current, {
      center: [35.681236, 139.767125],
      zoom: 14,
      zoomControl: false, // We render custom polished controls
      attributionControl: false, // We render custom attribution cleanly in the bottom corner
    });

    // Custom attribution control placed bottom-right
    L.control.attribution({
      position: 'bottomright',
      prefix: false,
    }).addTo(map);

    // Initialize layer groups
    savedSpotsLayerRef.current = L.layerGroup().addTo(map);
    tempMarkerLayerRef.current = L.layerGroup().addTo(map);
    parkingLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    measureLayerRef.current = L.layerGroup().addTo(map);
    locationLayerRef.current = L.layerGroup().addTo(map);

    // Track movement
    map.on('moveend', () => {
      const center = map.getCenter();
      onMapMove({ lat: center.lat, lng: center.lng }, map.getZoom());
    });

    // Click handler
    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update base tile layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const newTile = L.tileLayer(currentLayer.url, {
      attribution: currentLayer.attribution,
      maxZoom: currentLayer.maxZoom,
      subdomains: currentLayer.subdomains || 'abc',
    });

    newTile.addTo(map);
    tileLayerRef.current = newTile;
  }, [currentLayer]);

  // Focus point effect
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focusPoint) return;

    map.flyTo([focusPoint.lat, focusPoint.lng], Math.max(map.getZoom(), 15), {
      duration: 1.2,
      easeLinearity: 0.25,
    });
  }, [focusPoint]);

  // Render Saved Spots Markers
  useEffect(() => {
    const layer = savedSpotsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    savedSpots.forEach((spot) => {
      const isSelected = selectedSpot?.id === spot.id;
      const catInfo = CATEGORY_INFO[spot.category] || CATEGORY_INFO.other;

      const html = `
        <div class="relative flex items-center justify-center transform transition-transform duration-200 ${
          isSelected ? 'scale-125 z-50' : 'hover:scale-110'
        }">
          <div class="w-9 h-9 rounded-full shadow-lg border-2 flex items-center justify-center text-white font-bold text-xs"
               style="background-color: ${spot.color || catInfo.color}; border-color: ${
        isSelected ? '#ffffff' : 'rgba(255,255,255,0.8)'
      }; box-shadow: 0 4px 12px rgba(0,0,0,0.35);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </div>
          ${
            isSelected
              ? '<span class="absolute -bottom-1 w-2 h-2 bg-white rotate-45 transform"></span>'
              : ''
          }
        </div>
      `;

      const icon = L.divIcon({
        className: 'custom-spot-pin',
        html,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([spot.lat, spot.lng], { icon });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSpotClick(spot);
      });

      marker.bindTooltip(spot.title, {
        direction: 'top',
        offset: [0, -18],
        className: 'custom-tooltip text-xs font-semibold px-2 py-1 rounded shadow-md',
      });

      layer.addLayer(marker);
    });
  }, [savedSpots, selectedSpot, onSpotClick]);

  // Render Temporary Clicked Location & Search Markers
  useEffect(() => {
    const layer = tempMarkerLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    // Clicked location pin
    if (clickedLocation) {
      const html = `
        <div class="relative flex flex-col items-center">
          <div class="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg border-2 border-white animate-bounce">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </div>
          <div class="w-2.5 h-1 bg-neutral-900/40 rounded-full blur-[1px]"></div>
        </div>
      `;
      const icon = L.divIcon({
        className: 'temp-pin',
        html,
        iconSize: [32, 40],
        iconAnchor: [16, 40],
      });
      const marker = L.marker([clickedLocation.lat, clickedLocation.lng], { icon });
      layer.addLayer(marker);
    }

    // Search Result marker
    if (searchMarker && (!clickedLocation || (searchMarker.lat !== clickedLocation.lat && searchMarker.lng !== clickedLocation.lng))) {
      const html = `
        <div class="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white shadow-lg border-2 border-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
        </div>
      `;
      const icon = L.divIcon({
        className: 'search-pin',
        html,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const marker = L.marker([searchMarker.lat, searchMarker.lng], { icon });
      if (searchMarker.name) {
        marker.bindTooltip(searchMarker.name, {
          direction: 'top',
          offset: [0, -16],
          permanent: true,
          className: 'search-tooltip bg-blue-900 text-white text-xs font-semibold px-2 py-1 rounded shadow',
        });
      }
      layer.addLayer(marker);
    }
  }, [clickedLocation, searchMarker]);

  // Render Parking Spots (purple markers)
  useEffect(() => {
    const layer = parkingLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    parkingSpots.forEach((spot) => {
      const isSelected = selectedParkingId === spot.id;
      const capacityText =
        spot.capacity !== undefined ? `収容 ${spot.capacity} 台` : '台数不明';
      const feeText =
        spot.fee === 'yes'
          ? '有料'
          : spot.fee === 'no'
            ? '無料'
            : spot.fee === 'free' || spot.fee === 'public' || spot.fee === 'customers'
              ? '無料'
              : '情報なし';

      const html = `
        <div class="relative flex items-center justify-center transform transition-transform duration-200 ${
          isSelected ? 'scale-125 z-[999]' : 'hover:scale-110'
        }">
          <div class="w-8 h-8 rounded-full shadow-lg border-2 flex items-center justify-center ${
            isSelected ? 'bg-purple-700 border-white' : 'bg-purple-500 border-white/80'
          }" style="box-shadow: 0 4px 12px rgba(124,58,237,0.45);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white">
              <path d="M7 17h10"></path>
              <path d="M6 7h9a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"></path>
            </svg>
          </div>
        </div>
      `;

      const icon = L.divIcon({
        className: 'parking-pin',
        html,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([spot.lat, spot.lng], {
        icon,
        zIndexOffset: isSelected ? 1000 : 0,
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onParkingClick(spot);
      });

      const popupHtml = `
        <div class="min-w-[160px]">
          <div class="font-bold text-sm text-neutral-900 mb-1">${spot.name}</div>
          <div class="text-xs text-neutral-600 space-y-0.5">
            <div>${capacityText}</div>
            <div>${feeText}</div>
            ${spot.parkingType ? `<div>${spot.parkingType}</div>` : ''}
            <div class="text-purple-600 font-semibold">${Math.round(spot.distance)} m</div>
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml, {
        offset: [0, -16],
        className: 'parking-popup',
      });

      marker.bindTooltip(spot.name, {
        direction: 'top',
        offset: [0, -14],
        className: 'custom-tooltip text-xs font-semibold px-2 py-1 rounded shadow-md',
      });

      layer.addLayer(marker);
      if (selectedParkingId === spot.id) {
        marker.openTooltip();
      }
    });
  }, [parkingSpots, selectedParkingId, onParkingClick]);

  // Current GPS Location Marker
  useEffect(() => {
    const layer = locationLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!currentLocation) return;

    // Accuracy Circle
    if (currentLocation.accuracy && currentLocation.accuracy < 1000) {
      const circle = L.circle([currentLocation.lat, currentLocation.lng], {
        radius: currentLocation.accuracy,
        color: '#3b82f6',
        weight: 1,
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
      });
      layer.addLayer(circle);
    }

    // Glowing Pulse Pin
    const html = `
      <div class="relative flex items-center justify-center">
        <div class="absolute w-7 h-7 rounded-full bg-blue-500/40 animate-ping"></div>
        <div class="w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-lg flex items-center justify-center">
          <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
        </div>
      </div>
    `;
    const icon = L.divIcon({
      className: 'gps-pin',
      html,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const marker = L.marker([currentLocation.lat, currentLocation.lng], { icon });
    marker.bindTooltip('現在地', { direction: 'top', offset: [0, -14] });
    layer.addLayer(marker);
  }, [currentLocation]);

  // Route Polyline & Endpoints
  useEffect(() => {
    const layer = routeLayerRef.current;
    const map = mapInstanceRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    if (!routeResult || routeResult.coordinates.length < 2) return;

    // Highway vs surface styling to prevent elevated/under confusion
    const usesHighway =
      routeResult.mode === 'driving' &&
      routeResult.steps.some((s) =>
        /高速|首都高|自動車道|有料道路|C1|C2|湾岸|環状線/i.test(`${s.name} ${s.instruction}`)
      );

    // Outer glow / casing line (thicker shadow for highway)
    const casingPolyline = L.polyline(routeResult.coordinates, {
      color: usesHighway ? '#0c4a6e' : '#1e3a8a',
      weight: usesHighway ? 9 : 7,
      opacity: 0.8,
      lineCap: 'round',
      lineJoin: 'round',
    });
    layer.addLayer(casingPolyline);

    // Inner vibrant route line (dashed for surface under elevated risk)
    const colorMap = {
      driving: usesHighway ? '#0284c7' : '#3b82f6',
      walking: '#10b981',
      cycling: '#f59e0b',
    };
    const mainPolyline = L.polyline(routeResult.coordinates, {
      color: colorMap[routeResult.mode] || '#3b82f6',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    });
    layer.addLayer(mainPolyline);

    // Start Point Pin (Green)
    if (routeStart) {
      const startHtml = `
        <div class="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow-lg border-2 border-white">
          S
        </div>
      `;
      const startIcon = L.divIcon({
        className: 'route-start-pin',
        html: startHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const startMarker = L.marker([routeStart.lat, routeStart.lng], { icon: startIcon });
      startMarker.bindTooltip(routeStart.name || '出発地', { direction: 'top', offset: [0, -14] });
      layer.addLayer(startMarker);
    }

    // End Point Pin (Red flag)
    if (routeEnd) {
      const endHtml = `
        <div class="w-7 h-7 rounded-full bg-rose-600 text-white font-bold text-xs flex items-center justify-center shadow-lg border-2 border-white">
          G
        </div>
      `;
      const endIcon = L.divIcon({
        className: 'route-end-pin',
        html: endHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const endMarker = L.marker([routeEnd.lat, routeEnd.lng], { icon: endIcon });
      endMarker.bindTooltip(routeEnd.name || '目的地', { direction: 'top', offset: [0, -14] });
      layer.addLayer(endMarker);
    }

    // Merge / Shuto points (orange) — driving only
    if (routeResult.mode === 'driving') {
      routeResult.steps.forEach((step) => {
        if ((step.turnType === 'merge' || step.turnType === 'ramp') && step.location) {
          const isShuto = /首都高|C1|C2|湾岸|上野線|渋谷線|新宿線|池袋線|八重洲線|都心環状|中央環状/i.test(
            `${step.name} ${step.instruction}`
          );
          const html = `
            <div class="w-6 h-6 rounded-full ${isShuto ? 'bg-orange-600' : 'bg-amber-500'} text-white flex items-center justify-center shadow-lg border-2 border-white">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path d="m8 6 4-4 4 4"></path>
                <path d="M12 2v10.3"></path>
                <path d="m20 22-4-4-4 4"></path>
                <path d="M16 18v-9"></path>
              </svg>
            </div>
          `;
          const icon = L.divIcon({
            className: 'merge-pin',
            html,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });
          const marker = L.marker(step.location, { icon });
          marker.bindTooltip(
            `${isShuto ? '首都高・' : ''}合流${step.name ? `：${step.name}` : ''}`,
            { direction: 'top', offset: [0, -12] }
          );
          layer.addLayer(marker);
        }
      });
    }

    // Narrow road segments overlay (orange dashed, drawn on top of main route)
    const narrowSections = buildNarrowSections(routeResult.coordinates, routeResult.steps);
    narrowSections.forEach((sec) => {
      const isSelected = narrowHighlightStepIndex === sec.stepIndex;
      const line = L.polyline(sec.points, {
        color: '#f97316',
        weight: isSelected ? 9 : 6,
        opacity: isSelected ? 1 : 0.9,
        dashArray: '8, 8',
        lineCap: 'round',
        lineJoin: 'round',
      });
      line.bindTooltip(
        `${sec.name}（狭い道）${sec.estimatedWidth ? ` 幅員 ${sec.estimatedWidth}m` : ''}`,
        { direction: 'top' }
      );
      layer.addLayer(line);
    });

    // Fit route bounds nicely with padding (skip while driving to keep GPS follow stable)
    if (!isDriving) {
      const bounds = L.latLngBounds(routeResult.coordinates);
      map.fitBounds(bounds, {
        padding: [60, 60],
        maxZoom: 17,
        animate: true,
      });
    }
  }, [routeResult, routeStart, routeEnd, isDriving, narrowHighlightStepIndex]);

  // Measurement Line & Markers
  useEffect(() => {
    const layer = measureLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!isMeasuring || measurePoints.length === 0) return;

    // Measurement Polyline
    if (measurePoints.length >= 2) {
      const line = L.polyline(measurePoints, {
        color: '#f97316',
        weight: 3.5,
        dashArray: '6, 8',
        opacity: 0.9,
      });
      layer.addLayer(line);
    }

    // Measurement Dots
    measurePoints.forEach((point, idx) => {
      const html = `
        <div class="w-5 h-5 rounded-full bg-orange-500 text-white font-bold text-[10px] flex items-center justify-center shadow-md border-2 border-white">
          ${idx + 1}
        </div>
      `;
      const icon = L.divIcon({
        className: 'measure-pin',
        html,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      const marker = L.marker(point, { icon });
      layer.addLayer(marker);
    });
  }, [isMeasuring, measurePoints]);

  return (
    <div className="relative w-full h-full">
      <div id="leaflet-map" ref={mapContainerRef} className="w-full h-full z-0 bg-neutral-900" />
    </div>
  );
};
