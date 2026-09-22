import React from 'react';
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudFog,
  CloudLightning,
  Wind,
  AlertTriangle,
  CloudOff,
} from 'lucide-react';
import { RouteWeather, WeatherCategory, WeatherCondition } from '../types';

interface WeatherCardProps {
  weather: RouteWeather | null | undefined;
  routeRain?: boolean | null;
}

function WeatherIcon({ condition }: { condition: WeatherCondition }) {
  if (!condition.ok) return <CloudOff size={18} className="text-neutral-400" />;
  if (condition.isWindy && condition.category !== 'clear') {
    return <Wind size={18} className="text-sky-500" />;
  }
  switch (condition.category) {
    case 'clear':
      return <Sun size={18} className="text-amber-500" />;
    case 'rain':
      return <CloudRain size={18} className="text-blue-500" />;
    case 'snow':
      return <CloudSnow size={18} className="text-sky-400" />;
    case 'fog':
      return <CloudFog size={18} className="text-neutral-400" />;
    case 'thunder':
      return <CloudLightning size={18} className="text-amber-500" />;
    default:
      return <Cloud size={18} className="text-neutral-400" />;
  }
}

function PointColumn({ point }: { point: WeatherCondition }) {
  const bad =
    point.ok &&
    (point.isPrecipitating || point.isFreezingRisk || point.isWindy);
  return (
    <div
      className={`flex-1 rounded-xl border p-2 text-center ${
        bad
          ? 'border-sky-200 bg-sky-50/80'
          : 'border-neutral-100 bg-white/70'
      }`}
    >
      <div className="text-[10px] font-bold text-neutral-500">{point.label}</div>
      <div className="mt-1 flex justify-center">
        <WeatherIcon condition={point} />
      </div>
      <div className="mt-1 text-sm font-bold text-neutral-800 tabular-nums">
        {point.ok && point.temperature !== null
          ? `${Math.round(point.temperature)}°C`
          : '—'}
      </div>
      <div className="text-[10px] text-neutral-500">
        {point.ok && point.precipitationProbability !== null
          ? `降水 ${point.precipitationProbability}%`
          : '降水 —'}
      </div>
      <div className="text-[10px] text-neutral-400">
        {point.ok && point.windSpeed !== null
          ? `風 ${Math.round(point.windSpeed)}km/h`
          : '風 —'}
      </div>
      {point.ok && point.isFreezingRisk && (
        <div className="mt-1 text-[9px] font-bold text-sky-700">凍結注意</div>
      )}
      {point.ok && point.isPrecipitating && !point.isFreezingRisk && (
        <div className="mt-1 text-[9px] font-bold text-blue-600">降水あり</div>
      )}
      {point.ok && point.isWindy && (
        <div className="mt-1 text-[9px] font-bold text-sky-600">強風</div>
      )}
    </div>
  );
}

/** 出発地・途中・目的地の天気を横並び表示する。悪天候時は注意文を表示。 */
export const WeatherCard: React.FC<WeatherCardProps> = ({ weather, routeRain }) => {
  if (weather === undefined) return null;

  if (weather === null || weather.error) {
    return (
      <div className="p-3 rounded-2xl border border-neutral-200 bg-white/70 text-[11px] text-neutral-500 flex items-center gap-2">
        <CloudOff size={15} className="text-neutral-400" />
        <span>天気情報を取得できませんでした</span>
      </div>
    );
  }

  const hasCautions = weather.cautions.length > 0;
  const fetchedTime = new Date(weather.fetchedAt);

  return (
    <div
      className={`p-3.5 rounded-2xl border shadow-sm ${
        hasCautions ? 'border-sky-200 bg-sky-50/80' : 'border-blue-100 bg-blue-50/60'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold text-sky-800 flex items-center gap-1.5">
          <Cloud size={14} className="text-sky-600" />
          <span>道中の天気</span>
        </div>
        <span className="text-[9px] text-neutral-400">
          {fetchedTime.getHours()}:{String(fetchedTime.getMinutes()).padStart(2, '0')}時点
        </span>
      </div>

      <div className="mt-2 flex gap-1.5">
        <PointColumn point={weather.start} />
        <PointColumn point={weather.midpoint} />
        <PointColumn point={weather.end} />
      </div>

      {hasCautions && (
        <div className="mt-2 space-y-1">
          {weather.cautions.map((c, idx) => (
            <div
              key={idx}
              className="flex items-start gap-1.5 text-[11px] text-sky-900 bg-sky-100/80 border border-sky-200/70 rounded-lg px-2 py-1.5 leading-snug"
            >
              <AlertTriangle size={13} className="text-sky-700 flex-shrink-0 mt-px" />
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}

      {routeRain === true && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-sky-900 bg-sky-100/80 border border-sky-200/70 rounded-lg px-2 py-1.5 leading-snug">
          <CloudRain size={13} className="text-sky-700 flex-shrink-0 mt-px" />
          <span>雨雲レーダーでルート上に雨の区間が見られます（傘・雨具のご準備を）</span>
        </div>
      )}
    </div>
  );
};