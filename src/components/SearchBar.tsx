import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, MapPin } from 'lucide-react';
import { SearchResultItem } from '../types';
import { QUICK_CATEGORIES } from '../data/mapLayers';
import { searchLocations } from '../services/mapService';

interface SearchBarProps {
  onSelectResult: (item: SearchResultItem) => void;
  onClearSearch: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSelectResult, onClearSearch }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const items = await searchLocations(query, controller.signal);
        setResults(items);
        setIsOpen(items.length > 0);
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          console.error(err);
        }
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: SearchResultItem) => {
    onSelectResult(item);
    setQuery(item.display_name.split(',')[0]);
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    onClearSearch();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleQuickCategoryClick = (categoryQuery: string) => {
    setQuery(categoryQuery);
  };

  return (
    <div ref={searchContainerRef} className="relative w-full max-w-md">
      {/* Search Input Box */}
      <div className="relative flex items-center bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-neutral-200/80 transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
        <div className="pl-4 text-neutral-400">
          <Search size={20} />
        </div>

        <input
          id="map-search-input"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(-1);
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="場所・住所・ランドマークを検索..."
          className="w-full py-3.5 pl-3 pr-10 text-sm font-medium text-neutral-800 placeholder-neutral-400 bg-transparent focus:outline-none"
        />

        <div className="absolute right-3 flex items-center gap-1.5">
          {isLoading && (
            <Loader2 size={18} className="animate-spin text-blue-500" />
          )}

          {query && (
            <button
              id="clear-search-btn"
              onClick={handleClear}
              className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              title="クリア"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Quick Category Chips */}
      <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1 no-scrollbar text-xs">
        {QUICK_CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            id={`quick-cat-${cat.label}`}
            onClick={() => handleQuickCategoryClick(cat.query)}
            className="px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-sm text-neutral-700 border border-neutral-200/70 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 font-medium whitespace-nowrap shadow-sm transition-all"
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Autocomplete Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-neutral-200 overflow-hidden z-50 max-h-80 overflow-y-auto">
          <ul className="divide-y divide-neutral-100 py-1">
            {results.map((item, index) => {
              const mainName = item.display_name.split(',')[0];
              const subDetails = item.display_name.split(',').slice(1).join(',').trim();
              const isSelected = index === selectedIndex;

              return (
                <li
                  key={item.place_id}
                  id={`search-result-${index}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`px-4 py-2.5 flex items-start gap-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50 text-blue-900' : 'hover:bg-neutral-50 text-neutral-800'
                  }`}
                >
                  <div className="mt-0.5 text-neutral-400 flex-shrink-0">
                    <MapPin size={18} className={isSelected ? 'text-blue-600' : ''} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{mainName}</div>
                    {subDetails && (
                      <div className="text-xs text-neutral-500 truncate mt-0.5">{subDetails}</div>
                    )}
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
