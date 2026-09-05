import React, { useState, useRef, useEffect } from 'react';
import { Layers, Check } from 'lucide-react';
import { MapLayerConfig } from '../types';
import { MAP_LAYERS } from '../data/mapLayers';

interface LayerSelectorProps {
  currentLayer: MapLayerConfig;
  onSelectLayer: (layer: MapLayerConfig) => void;
}

export const LayerSelector: React.FC<LayerSelectorProps> = ({ currentLayer, onSelectLayer }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        id="layer-selector-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl shadow-lg border backdrop-blur-md transition-all ${
          isOpen
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white/90 text-neutral-800 border-neutral-200/80 hover:bg-white'
        }`}
        title="地図スタイルの切り替え"
      >
        <Layers size={18} />
        <span className="text-xs font-semibold hidden sm:inline">地図切替</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 bottom-12 sm:bottom-auto sm:top-12 w-64 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-neutral-200/90 p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider px-2 pb-2 mb-1 border-b border-neutral-100 flex items-center justify-between">
            <span>ベースマップ選択</span>
            <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
              {MAP_LAYERS.length} 種類
            </span>
          </div>

          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {MAP_LAYERS.map((layer) => {
              const isSelected = layer.id === currentLayer.id;
              return (
                <button
                  key={layer.id}
                  id={`select-layer-${layer.id}`}
                  onClick={() => {
                    onSelectLayer(layer);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-all ${
                    isSelected
                      ? 'bg-blue-50 border border-blue-200 text-blue-900 font-medium'
                      : 'hover:bg-neutral-100/80 border border-transparent text-neutral-800'
                  }`}
                >
                  <div
                    className="w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 shadow-xs"
                    style={{ backgroundColor: layer.thumbnailColor || '#e2e8f0' }}
                  >
                    {isSelected && <Check size={14} className="text-blue-600" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{layer.name}</div>
                    <div className="text-[10px] text-neutral-500 truncate">
                      {layer.category === 'satellite'
                        ? '衛星・航空写真'
                        : layer.category === 'japan'
                        ? '国土地理院公式'
                        : layer.category === 'terrain'
                        ? '等高線・陰影起伏'
                        : layer.category === 'dark'
                        ? '夜間・コントラスト'
                        : '標準表示'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
