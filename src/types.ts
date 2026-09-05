export type TravelMode = 'driving' | 'walking' | 'cycling';

export interface GeoPoint {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

export interface MapLayerConfig {
  id: string;
  name: string;
  category: 'standard' | 'japan' | 'satellite' | 'dark' | 'terrain';
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string[];
  thumbnailColor?: string;
}

export type SpotCategory = 
  | 'favorite'
  | 'food'
  | 'cafe'
  | 'sightseeing'
  | 'station'
  | 'hotel'
  | 'shopping'
  | 'work'
  | 'other';

export interface SavedSpot {
  id: string;
  title: string;
  description?: string;
  lat: number;
  lng: number;
  address?: string;
  category: SpotCategory;
  color: string;
  elevation?: number;
  createdAt: number;
}

export interface SearchResultItem {
  place_id: number | string;
  osm_id?: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
  icon?: string;
}

export interface RouteStep {
  instruction: string;
  distance: number; // meters
  duration: number; // seconds
  name: string;
}

export interface RouteResult {
  coordinates: [number, number][]; // [lat, lng]
  totalDistance: number; // meters
  totalDuration: number; // seconds
  steps: RouteStep[];
  mode: TravelMode;
}

export interface ClickedLocationInfo {
  lat: number;
  lng: number;
  address?: string;
  elevation?: number | null;
  loading?: boolean;
}
