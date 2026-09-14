import React from 'react';
import { Layers, ArrowUpFromLine, Navigation } from 'lucide-react';
import { ElevatedInfo, ElevatedVerify, JunctionDetail } from '../services/elevated';
import { formatDistance } from '../services/mapService';

interface ElevatedBadgeProps {
  info: ElevatedInfo;
  liveLevel?: 'highway' | 'surface' | null;
  tracking?: boolean;
  junctions?: JunctionDetail[];
  remaining?: Map<number, number>;
  verify?: ElevatedVerify;
}

/**
 * Pseudo-3D hierarchy badge.
 * Clarifies 高速走行中 vs 高架下の一般道 to prevent misrecognition.
 * True 3D (MapLibre) is deferred; this is a cross-section MVP with
 * live GPS level, JCT details, and Overpass verification.
 */
export const ElevatedBadge: React.FC<ElevatedBadgeProps> = ({
  info,
  liveLevel,
  tracking,
  junctions,
  remaining,
  verify,
}) => {
  const displayLevel = tracking && liveLevel ? liveLevel : info.level;
  const isHighway = displayLevel === 'highway';

  return (
    <div className="bg-gradient-to-br from-sky-50 to-indigo-50/60 p-3.5 rounded-2xl border border-sky-100 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Layers size={14} className="text-sky-600" />
        <span className="text-[11px] font-bold text-sky-700 uppercase tracking-wider">
          立体階層表示
        </span>
        <span
          className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold ${
            isHighway ? 'bg-sky-600 text-white' : 'bg-white text-neutral-600 border border-neutral-200'
          }`}
        >
          {tracking && liveLevel ? (
            <>{isHighway ? '現在：高速（上層）' : '現在：一般道（下層）'}</>
          ) : (
            <>{isHighway ? '高速走行中' : '一般道走行中'}</>
          )}
        </span>
      </div>

      {/* Cross-section diagram: upper highway / lower surface */}
      <div className="rounded-xl bg-white/80 border border-sky-100 p-2.5" aria-hidden="true">
        <div
          className={`rounded-lg px-2 py-1.5 text-[11px] font-bold text-center ${
            isHighway ? 'bg-sky-600 text-white shadow' : 'bg-neutral-100 text-neutral-400'
          }`}
        >
          上層：高速道路{info.highwayNames[0] ? `（${info.highwayNames[0]}）` : ''}
        </div>
        <div className="flex justify-center my-1">
          <ArrowUpFromLine size={12} className="text-neutral-300" />
        </div>
        <div
          className={`rounded-lg px-2 py-1.5 text-[11px] font-bold text-center ${
            !isHighway ? 'bg-emerald-500 text-white shadow' : 'bg-neutral-100 text-neutral-400'
          }`}
        >
          下層：一般道（高架下）
        </div>
      </div>

      <div className="mt-2 text-[11px] text-neutral-600">
        {isHighway ? (
          <>高速走行中です。下道とお間違えなく。降り口の先回り案内を確認してください。</>
        ) : (
          <>一般道走行中です。上の高速とは別ルートです。慌てず車線キープでOK。</>
        )}
        {info.hasJunction && <>分岐・合流ありのため首都高アシストも併せて確認。</>}
      </div>

      {verify && verify.state !== 'unknown' && (
        <div className="mt-1.5 text-[11px] text-neutral-500">
          {verify.state === 'checking' && <>高架・トンネル実測を確認中…</>}
          {verify.state === 'confirmed' && (
            <>
              実測：
              {verify.hasBridge ? '高架あり' : ''}
              {verify.hasBridge && verify.hasTunnel ? '・' : ''}
              {verify.hasTunnel ? 'トンネルあり' : ''}
              {!verify.hasBridge && !verify.hasTunnel ? '高架・トンネルなし' : ''}
            </>
          )}
          {verify.state === 'none' && <>実測：付近に高架・トンネルなし</>}
        </div>
      )}

      {junctions && junctions.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {junctions.map((j) => {
            const rem = tracking ? remaining?.get(j.stepIndex) : undefined;
            return (
              <div
                key={j.stepIndex}
                className="flex items-center gap-1.5 text-[11px] bg-white/80 border border-sky-100 rounded-lg px-2 py-1.5"
              >
                <Navigation size={12} className="text-sky-600 flex-shrink-0" />
                <span className="font-semibold text-neutral-700 truncate">{j.name}</span>
                <span className="ml-auto text-neutral-500 whitespace-nowrap">
                  {rem !== undefined ? (
                    <>あと{formatDistance(Math.max(rem, 0))}</>
                  ) : (
                    <>{formatDistance(j.distanceToManeuver)}先</>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {info.highwayNames.length > 1 && (
        <div className="mt-1 text-[11px] text-neutral-400">
          関連：{info.highwayNames.join('・')}
        </div>
      )}
    </div>
  );
};
