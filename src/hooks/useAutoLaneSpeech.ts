import { useEffect, useRef, useState } from 'react';
import {
  LaneAdvice,
  findTraveledMeters,
  remainingToManeuver,
  speakAdvice,
} from '../services/laneGuidance';

interface AutoLaneState {
  tracking: boolean;
  error: string | null;
  traveledMeters: number;
  remaining: Map<number, number>;
}

const FINAL_THRESHOLD_M = 300;

/**
 * GPS-linked hands-free guidance.
 * - watchPosition starts only when enabled && advices exist
 * - auto-speaks earlyMessage once when remaining <= earlyMeters
 * - auto-speaks message once more when remaining <= 300m
 * - no tap needed while driving
 */
export function useAutoLaneSpeech(
  advices: LaneAdvice[],
  routeCoordinates: [number, number][],
  enabled: boolean,
  earlyMeters: number
): AutoLaneState & { start: () => void; stop: () => void } {
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [traveledMeters, setTraveledMeters] = useState(0);
  const [remaining, setRemaining] = useState<Map<number, number>>(new Map());
  const watchIdRef = useRef<number | null>(null);
  const announcedEarlyRef = useRef<Set<number>>(new Set());
  const announcedFinalRef = useRef<Set<number>>(new Set());
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Reset announcements when route changes
  useEffect(() => {
    announcedEarlyRef.current.clear();
    announcedFinalRef.current.clear();
    setTraveledMeters(0);
    setRemaining(new Map());
  }, [advices]);

  // Stop watch when disabled
  useEffect(() => {
    if (!enabled && watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setTracking(false);
    }
  }, [enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  const start = () => {
    if (!('geolocation' in navigator)) {
      setError('位置情報に対応していません');
      return;
    }
    if (watchIdRef.current !== null) return;
    setError(null);
    try {
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const traveled = findTraveledMeters(
            { lat: pos.coords.latitude, lng: pos.coords.longitude },
            routeCoordinates
          );
          setTraveledMeters(traveled);
          const next = new Map<number, number>();
          advices.forEach((a) => {
            next.set(a.stepIndex, remainingToManeuver(a, traveled));
          });
          setRemaining(next);

          // Auto-speak hands-free
          if (!enabledRef.current) return;
          advices.forEach((a) => {
            const rem = remainingToManeuver(a, traveled);
            if (rem < -50) return; // passed
            if (rem <= earlyMeters && !announcedEarlyRef.current.has(a.stepIndex)) {
              announcedEarlyRef.current.add(a.stepIndex);
              speakAdvice(`あと${Math.max(Math.round(rem), 0)}メートル。${a.earlyMessage}`);
            } else if (
              rem <= FINAL_THRESHOLD_M &&
              !announcedFinalRef.current.has(a.stepIndex)
            ) {
              announcedFinalRef.current.add(a.stepIndex);
              speakAdvice(`まもなく。${a.message}`);
            }
          });
        },
        (err) => {
          console.warn('watchPosition error:', err);
          setError('現在地を取得できません。位置情報の許可をご確認ください');
          setTracking(false);
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
      );
      watchIdRef.current = id;
      setTracking(true);
    } catch {
      setError('位置情報の開始に失敗しました');
    }
  };

  const stop = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    setTracking(false);
  };

  return { tracking, error, traveledMeters, remaining, start, stop };
}
