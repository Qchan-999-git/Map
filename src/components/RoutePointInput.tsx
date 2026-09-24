import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { GeoPoint, SearchResultItem } from '../types';
import { searchLocations } from '../services/mapService';

interface RoutePointInputProps {
  id: string;
  label: string;
  value: GeoPoint | null;
  dotClassName: string;
  onSelect: (point: GeoPoint) => void;
  onClear: () => void;
  placeholder?: string;
}

function pointLabel(point: GeoPoint): string {
  return point.name || point.address || `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

export function searchResultToGeoPoint(item: SearchResultItem): GeoPoint {
  const lat = parseFloat(item.lat);
  const lng = parseFloat(item.lon);
  const name = item.display_name.split(',')[0].trim();
  return { lat, lng, name, address: item.display_name };
}

export const RoutePointInput: React.FC<RoutePointInputProps> = ({
  id,
  label,
  value,
  dotClassName,
  onSelect,
  onClear,
  placeholder = '地名・住所を入力 または 地図をクリック',
}) => {
  const [query, setQuery] = useState(value ? pointLabel(value) : '');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 外部からの地点変更（地図クリック・クリア等）を入力欄に反映。編集中は上書きしない
  useEffect(() => {
    if (!focused) {
      setQuery(value ? pointLabel(value) : '');
    }
  }, [value, focused]);

  // 入力デバウンス検索（SearchBar と同じ 350ms + Abort）
  useEffect(() => {
    if (!focused || !query.trim()) {
      if (!focused) {
        setResults([]);
        setIsLoading(false);
      }
      return;
    }
    // 既に確定済みの地点名と完全一致なら再検索しない
    if (value && query === pointLabel(value)) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(async () => {
      try {
        const items = await searchLocations(query, controller.signal);
        setResults(items);
        setIsOpen(items.length > 0);
        setSelectedIndex(-1);
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') console.error(err);
      } finally {
        setIsLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, focused, value]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const handleSelect = (item: SearchResultItem) => {
    onSelect(searchResultToGeoPoint(item));
    setQuery(item.display_name.split(',')[0].trim());
    setIsOpen(false);
    setResults([]);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    onClear();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (!isOpen || results.length === 0) {
      if (e.key === 'Enter') {
        // 候補なしで Enter → 何もしない（地図クリックを促す）
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((p) => (p < results.length - 1 ? p + 1 : p));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((p) => (p > 0 ? p - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 bg-neutral-50 px-3 py-2 rounded-xl border border-neutral-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClassName}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-neutral-400 font-semibold uppercase">{label}</div>
          <input
            id={id}
            type="text"
            role="combobox"
            aria-label={label}
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls={`${id}-listbox`}
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setSelectedIndex(-1);
              // テキストを全消ししたら地点もクリア
              if (v === '' && value) onClear();
            }}
            onFocus={() => {
              setFocused(true);
              if (results.length > 0) setIsOpen(true);
            }}
            onBlur={() => {
              setFocused(false);
              // 確定せずに離れたら表示を地点ラベルに戻す
              if (value) setQuery(pointLabel(value));
              else if (query.trim() === '') setQuery('');
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full text-xs font-medium truncate text-neutral-800 placeholder-neutral-400 placeholder:italic bg-transparent focus:outline-none"
          />
        </div>
        {isLoading ? (
          <Loader2 size={14} className="animate-spin text-blue-500 flex-shrink-0" />
        ) : (
          (value || query) && (
            <button
              onClick={handleClear}
              aria-label={`${label}をクリア`}
              className="text-neutral-400 hover:text-neutral-600 p-0.5 flex-shrink-0"
            >
              <X size={14} />
            </button>
          )
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden z-50 max-h-64 overflow-y-auto">
          <ul id={`${id}-listbox`} role="listbox" className="divide-y divide-neutral-100 py-1">
            {results.map((item, index) => {
              const mainName = item.display_name.split(',')[0].trim();
              const sub = item.display_name.split(',').slice(1).join(',').trim();
              const active = index === selectedIndex;
              return (
                <li
                  key={item.place_id}
                  id={`${id}-result-${index}`}
                  role="option"
                  aria-selected={active}
                  onMouseDown={(e) => {
                    // blur より先に選択を確定させる
                    e.preventDefault();
                    handleSelect(item);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`px-3 py-2 flex items-start gap-2 cursor-pointer transition-colors ${
                    active ? 'bg-blue-50 text-blue-900' : 'hover:bg-neutral-50 text-neutral-800'
                  }`}
                >
                  <MapPin size={15} className={`mt-0.5 flex-shrink-0 ${active ? 'text-blue-600' : 'text-neutral-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{mainName}</div>
                    {sub && <div className="text-[11px] text-neutral-500 truncate mt-0.5">{sub}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
