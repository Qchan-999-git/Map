import React, { useState } from 'react';
import { MapPin, Navigation, Bookmark, Copy, Check, X, Mountain, Flag, Loader2 } from 'lucide-react';
import { ClickedLocationInfo, GeoPoint, SavedSpot, SpotCategory } from '../types';
import { CATEGORY_INFO } from '../data/mapLayers';

interface SpotDetailCardProps {
  location: ClickedLocationInfo;
  onClose: () => void;
  onSetStart: (point: GeoPoint) => void;
  onSetEnd: (point: GeoPoint) => void;
  onSaveSpot: (spot: Omit<SavedSpot, 'id' | 'createdAt'>) => void;
  existingSpot?: SavedSpot | null;
}

export const SpotDetailCard: React.FC<SpotDetailCardProps> = ({
  location,
  onClose,
  onSetStart,
  onSetEnd,
  onSaveSpot,
  existingSpot,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(existingSpot?.title || '');
  const [category, setCategory] = useState<SpotCategory>(existingSpot?.category || 'favorite');
  const [description, setDescription] = useState(existingSpot?.description || '');
  const [copied, setCopied] = useState(false);

  const formattedCoords = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;

  const handleCopyCoords = () => {
    navigator.clipboard.writeText(formattedCoords);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSaveSpot({
      title: title.trim(),
      category,
      description: description.trim(),
      lat: location.lat,
      lng: location.lng,
      address: location.address,
      elevation: location.elevation !== null ? location.elevation : undefined,
      color: CATEGORY_INFO[category].color,
    });
    setIsEditing(false);
  };

  const handleSetStart = () => {
    onSetStart({
      lat: location.lat,
      lng: location.lng,
      name: existingSpot?.title || location.address || formattedCoords,
      address: location.address,
    });
  };

  const handleSetEnd = () => {
    onSetEnd({
      lat: location.lat,
      lng: location.lng,
      name: existingSpot?.title || location.address || formattedCoords,
      address: location.address,
    });
  };

  return (
    <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-neutral-200/90 p-4 max-w-sm w-full text-neutral-800 animate-in fade-in slide-in-from-bottom-3 duration-200">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-2 border-b border-neutral-100">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
            <MapPin size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-neutral-900 truncate">
              {existingSpot ? existingSpot.title : '選択した地点'}
            </div>
            <div className="text-xs text-neutral-500 line-clamp-2 mt-0.5">
              {location.loading ? (
                <span className="flex items-center gap-1 text-blue-500">
                  <Loader2 size={12} className="animate-spin" />
                  住所を取得中...
                </span>
              ) : (
                location.address || formattedCoords
              )}
            </div>
          </div>
        </div>

        <button
          id="close-spot-detail-btn"
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-700 p-1 rounded-full hover:bg-neutral-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Info Badges (Coordinates & Elevation) */}
      <div className="flex items-center gap-2 my-3 text-xs">
        {/* LatLng Badge */}
        <button
          onClick={handleCopyCoords}
          className="flex-1 flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/80 font-mono text-[11px] text-neutral-600 transition-colors"
          title="座標をコピー"
        >
          <span>{formattedCoords}</span>
          {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} className="text-neutral-400" />}
        </button>

        {/* Elevation Badge */}
        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[11px] font-medium flex-shrink-0">
          <Mountain size={13} />
          <span>
            {location.elevation !== null && location.elevation !== undefined
              ? `標高 ${location.elevation}m`
              : '標高 --'}
          </span>
        </div>
      </div>

      {/* Spot Save Form if editing */}
      {isEditing ? (
        <form onSubmit={handleSave} className="space-y-3 pt-1">
          <div>
            <label className="text-[11px] font-semibold text-neutral-600 block mb-1">地点名</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: お気に入りのカフェ、集合場所"
              className="w-full text-xs px-3 py-2 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-neutral-600 block mb-1">カテゴリー</label>
            <div className="grid grid-cols-3 gap-1 text-[11px]">
              {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setCategory(key as SpotCategory)}
                  className={`py-1 px-1.5 rounded-lg border text-center truncate transition-all ${
                    category === key
                      ? 'bg-blue-50 border-blue-400 text-blue-800 font-semibold'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {info.label.split('・')[0]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-neutral-600 block mb-1">メモ</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="メモや営業時間、特徴など..."
              rows={2}
              className="w-full text-xs px-3 py-1.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="flex-1 py-1.5 text-xs font-semibold rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            >
              保存する
            </button>
          </div>
        </form>
      ) : (
        /* Action Buttons */
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <button
              id="set-as-start-btn"
              onClick={handleSetStart}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold transition-colors"
            >
              <Navigation size={14} />
              <span>出発地に設定</span>
            </button>
            <button
              id="set-as-destination-btn"
              onClick={handleSetEnd}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-semibold transition-colors"
            >
              <Flag size={14} />
              <span>目的地に設定</span>
            </button>
          </div>

          <button
            id="bookmark-spot-btn"
            onClick={() => {
              if (!title && location.address) {
                setTitle(location.address.split(',')[0]);
              }
              setIsEditing(true);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 text-xs font-semibold shadow-md transition-colors"
          >
            <Bookmark size={14} className="text-amber-400" />
            <span>{existingSpot ? '登録内容を編集' : 'お気に入り・地点に登録'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
