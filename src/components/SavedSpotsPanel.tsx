import React, { useState } from 'react';
import { Bookmark, Search, Trash2, Download, Upload, X, Navigation } from 'lucide-react';
import { SavedSpot, SpotCategory } from '../types';
import { CATEGORY_INFO } from '../data/mapLayers';

interface SavedSpotsPanelProps {
  savedSpots: SavedSpot[];
  selectedSpot: SavedSpot | null;
  onSelectSpot: (spot: SavedSpot) => void;
  onDeleteSpot: (id: string) => void;
  onImportSpots: (spots: SavedSpot[]) => void;
  onClose: () => void;
  onSetRouteTarget: (spot: SavedSpot) => void;
}

export const SavedSpotsPanel: React.FC<SavedSpotsPanelProps> = ({
  savedSpots,
  selectedSpot,
  onSelectSpot,
  onDeleteSpot,
  onImportSpots,
  onClose,
  onSetRouteTarget,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SpotCategory | 'all'>('all');

  const filteredSpots = savedSpots.filter((spot) => {
    const matchesCat = selectedCategory === 'all' || spot.category === selectedCategory;
    const matchesQuery =
      searchQuery.trim() === '' ||
      spot.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (spot.address && spot.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (spot.description && spot.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesQuery;
  });

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(savedSpots, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `map-saved-spots-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          onImportSpots(json);
        }
      } catch (err) {
        alert('ファイルの読み込みに失敗しました。有効なJSONファイルを選択してください。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-white/95 backdrop-blur-md border-r border-neutral-200/90 shadow-2xl w-full sm:w-96 text-neutral-800 z-40">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200/80 flex items-center justify-between bg-neutral-50/70">
        <div className="flex items-center gap-2 font-bold text-base text-neutral-900">
          <Bookmark size={20} className="text-amber-500" />
          <span>登録地点・お気に入り</span>
          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
            {savedSpots.length}
          </span>
        </div>
        <button
          id="close-saved-spots-btn"
          onClick={onClose}
          className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Filter & Search */}
      <div className="p-4 space-y-3 border-b border-neutral-100">
        {/* Search Input */}
        <div className="relative flex items-center bg-neutral-100/80 rounded-xl px-3 py-2 text-xs">
          <Search size={16} className="text-neutral-400 mr-2 flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="登録地点を絞り込み..."
            className="w-full bg-transparent text-neutral-800 placeholder-neutral-400 focus:outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-neutral-400 hover:text-neutral-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCategory === 'all'
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            すべて ({savedSpots.length})
          </button>
          {Object.entries(CATEGORY_INFO).map(([key, info]) => {
            const count = savedSpots.filter((s) => s.category === key).length;
            if (count === 0) return null;
            const isSelected = selectedCategory === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedCategory(key as SpotCategory)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1 transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                <span>{info.label}</span>
                <span className="text-[10px] opacity-80">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Spots List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {filteredSpots.length > 0 ? (
          filteredSpots.map((spot) => {
            const isSelected = selectedSpot?.id === spot.id;
            const catInfo = CATEGORY_INFO[spot.category] || CATEGORY_INFO.other;

            return (
              <div
                key={spot.id}
                id={`saved-spot-card-${spot.id}`}
                onClick={() => onSelectSpot(spot)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/80 border-blue-300 shadow-sm'
                    : 'bg-white hover:bg-neutral-50 border-neutral-200/80 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className="w-3.5 h-3.5 rounded-full mt-1 flex-shrink-0 shadow-xs"
                      style={{ backgroundColor: spot.color || catInfo.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-neutral-900 truncate">
                        {spot.title}
                      </div>
                      <div className="text-[11px] text-neutral-500 font-medium mt-0.5">
                        {catInfo.label}
                        {spot.elevation !== undefined && spot.elevation !== null && (
                          <span className="ml-2 text-neutral-400">標高 {spot.elevation}m</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      id={`route-to-spot-${spot.id}`}
                      onClick={() => onSetRouteTarget(spot)}
                      title="ここへ行く (目的地に設定)"
                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                    >
                      <Navigation size={15} />
                    </button>
                    <button
                      id={`delete-spot-${spot.id}`}
                      onClick={() => onDeleteSpot(spot.id)}
                      title="削除"
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {spot.description && (
                  <p className="text-xs text-neutral-600 mt-2 line-clamp-2 bg-neutral-50/60 p-2 rounded-lg border border-neutral-100">
                    {spot.description}
                  </p>
                )}

                {spot.address && (
                  <div className="text-[10px] text-neutral-400 mt-2 truncate">
                    {spot.address}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 px-4 text-neutral-400">
            <Bookmark size={36} className="mx-auto text-neutral-300 mb-2" />
            <div className="text-xs font-medium text-neutral-600">登録地点はありません</div>
            <div className="text-[11px] text-neutral-400 mt-1">
              地図上をクリックして「地点を保存」からお気に入りを追加できます
            </div>
          </div>
        )}
      </div>

      {/* Footer: Export / Import JSON */}
      <div className="p-3 border-t border-neutral-200/80 bg-neutral-50/80 flex items-center justify-between text-xs">
        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700 font-medium cursor-pointer transition-colors">
          <Upload size={14} />
          <span>インポート</span>
          <input
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
        </label>

        <button
          id="export-spots-btn"
          disabled={savedSpots.length === 0}
          onClick={handleExportJSON}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-100 disabled:opacity-50 text-neutral-700 font-medium transition-colors"
        >
          <Download size={14} />
          <span>エクスポート</span>
        </button>
      </div>
    </div>
  );
};
