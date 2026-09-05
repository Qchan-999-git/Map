import { ClickedLocationInfo, RouteResult, SearchResultItem, TravelMode } from '../types';

/**
 * Calculates distance between two LatLng points using the Haversine formula (in meters).
 */
export function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Formats distance into readable Japanese string (m or km)
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Formats duration in seconds into readable Japanese string
 */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) {
    return `約 ${mins} 分`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `約 ${hours} 時間 ${remainingMins} 分`;
}

/**
 * Searches places using Nominatim with Japanese localization
 */
export async function searchLocations(query: string, signal?: AbortSignal): Promise<SearchResultItem[]> {
  if (!query || query.trim().length < 1) return [];

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('q', query.trim());
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '8');
    url.searchParams.set('accept-language', 'ja,en');

    const res = await fetch(url.toString(), {
      signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) throw new Error('Search request failed');
    const data: SearchResultItem[] = await res.json();
    return data;
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') return [];
    console.warn('Geocoding search failed:', err);
    return [];
  }
}

/**
 * Reverse geocodes coordinates into an address
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'json');
    url.searchParams.set('lat', lat.toString());
    url.searchParams.set('lon', lng.toString());
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'ja');

    const res = await fetch(url.toString());
    if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const data = await res.json();
    
    // Create clean readable address
    if (data && data.address) {
      const a = data.address;
      const parts = [
        a.country === '日本' ? '' : a.country,
        a.province || a.prefecture || a.state,
        a.city || a.ward || a.county,
        a.suburb || a.neighbourhood || a.quarter,
        a.road || a.pedestrian,
        a.house_number,
      ].filter(Boolean);

      if (parts.length > 0) {
        return parts.join(' ');
      }
    }

    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch (err) {
    console.warn('Reverse geocode error:', err);
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

/**
 * Fetches elevation in Japan from GSI (Geospatial Information Authority of Japan)
 * or open-elevation API worldwide.
 */
export async function getElevation(lat: number, lng: number): Promise<number | null> {
  // Check if within approximate bounds of Japan (Lat: 20-46, Lng: 122-154)
  const isJapan = lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154;

  if (isJapan) {
    try {
      const gsiUrl = `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lat=${lat}&lon=${lng}&outtype=JSON`;
      const res = await fetch(gsiUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.elevation === 'number') {
          return Math.round(data.elevation * 10) / 10;
        }
      }
    } catch {
      // ignore and fallback
    }
  }

  try {
    const fallbackUrl = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`;
    const res = await fetch(fallbackUrl);
    if (res.ok) {
      const data = await res.json();
      if (data?.results?.[0]?.elevation !== undefined) {
        return Math.round(data.results[0].elevation * 10) / 10;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Fetches comprehensive location details for a clicked spot
 */
export async function getLocationDetails(lat: number, lng: number): Promise<ClickedLocationInfo> {
  const [address, elevation] = await Promise.all([
    reverseGeocode(lat, lng),
    getElevation(lat, lng),
  ]);

  return {
    lat,
    lng,
    address,
    elevation,
    loading: false,
  };
}

/**
 * Calculates real-world route using OSRM with turn-by-turn steps
 */
export async function calculateRoute(
  start: [number, number],
  end: [number, number],
  mode: TravelMode = 'driving'
): Promise<RouteResult> {
  const profileMap: Record<TravelMode, string> = {
    driving: 'driving',
    walking: 'foot',
    cycling: 'bike',
  };

  const profile = profileMap[mode];
  // OSRM expects coordinates as: lng,lat ; lng,lat
  const url = `https://router.project-osrm.org/route/v1/${profile}/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('OSRM routing request failed');
    const data = await res.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      // Geometry coordinates are [lng, lat] -> convert to [lat, lng]
      const coordinates: [number, number][] = route.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]]
      );

      const steps = (route.legs?.[0]?.steps || []).map((s: { maneuver?: { instruction?: string; type?: string; modifier?: string }; distance?: number; duration?: number; name?: string }) => {
        let instruction = s.maneuver?.instruction || '';
        if (!instruction && s.maneuver) {
          const type = s.maneuver.type || '';
          const mod = s.maneuver.modifier ? ` (${s.maneuver.modifier})` : '';
          instruction = `${type}${mod} ${s.name ? `on ${s.name}` : ''}`;
        }
        return {
          instruction: translateInstruction(instruction || '進む'),
          distance: s.distance || 0,
          duration: s.duration || 0,
          name: s.name || '',
        };
      });

      return {
        coordinates,
        totalDistance: route.distance,
        totalDuration: route.duration,
        steps,
        mode,
      };
    }
  } catch (err) {
    console.warn('OSRM router error, generating fallback path:', err);
  }

  // Fallback: Haversine direct line with estimated speed
  const dist = calculateHaversineDistance(start[0], start[1], end[0], end[1]);
  const speedMps: Record<TravelMode, number> = {
    driving: 11.1, // ~40 km/h
    walking: 1.25, // ~4.5 km/h
    cycling: 4.16, // ~15 km/h
  };

  return {
    coordinates: [start, end],
    totalDistance: dist,
    totalDuration: dist / speedMps[mode],
    steps: [
      {
        instruction: '出発地点から目的地へ向かいます',
        distance: dist,
        duration: dist / speedMps[mode],
        name: '直線推計ルート',
      },
    ],
    mode,
  };
}

/**
 * Translates standard OSRM navigation cues into natural Japanese instructions
 */
function translateInstruction(instruction: string): string {
  if (/depart/i.test(instruction)) return '出発します';
  if (/arrive/i.test(instruction)) return '目的地に到着しました';
  if (/turn right/i.test(instruction)) return '右折します';
  if (/turn left/i.test(instruction)) return '左折します';
  if (/slight right/i.test(instruction)) return '右方向へ斜めに進みます';
  if (/slight left/i.test(instruction)) return '左方向へ斜めに進みます';
  if (/sharp right/i.test(instruction)) return '右へ大きく曲がります';
  if (/sharp left/i.test(instruction)) return '左へ大きく曲がります';
  if (/continue/i.test(instruction)) return '直進します';
  if (/roundabout/i.test(instruction)) return 'ロータリーを通過します';
  if (/merge/i.test(instruction)) return '合流します';
  if (/ramp/i.test(instruction)) return 'ランプ道へ進みます';
  return instruction;
}
