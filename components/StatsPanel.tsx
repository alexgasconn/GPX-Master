import React from 'react';
import { GPXStatistics } from '../types';
import { Ruler, Mountain, Activity, ArrowUpRight, ArrowDownRight, MapPin } from 'lucide-react';

interface StatsPanelProps {
  stats: GPXStatistics;
  pointCount?: number;
}

const StatCard: React.FC<{
  title: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, subValue, icon, color }) => (
  <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl flex items-center gap-3 hover:border-slate-600 hover:bg-slate-750 transition-all shadow-sm h-full group">
    <div className={`p-2.5 rounded-lg ${color} bg-opacity-10 text-white min-w-[40px] h-[40px] flex items-center justify-center group-hover:scale-105 transition-transform`}>
      {React.cloneElement(icon as React.ReactElement<any>, { className: `text-${color.split('-')[1]}-400`, size: 20 })}
    </div>
    <div className="overflow-hidden flex-1 min-w-0">
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-0.5">{title}</p>
      <h4 className="text-lg lg:text-xl font-bold text-white tracking-tight truncate leading-none mb-0.5">{value}</h4>
      {subValue && <p className="text-slate-500 text-[10px] truncate">{subValue}</p>}
    </div>
  </div>
);

export const StatsPanel: React.FC<StatsPanelProps> = ({ stats }) => {
  const pointCount = (stats as any).pointCount || 0;
  // Calculate Density (Points per KM)
  const density = stats.totalDistance > 0 ? Math.round(pointCount / stats.totalDistance) : 0;
  // Calculate Spacing (Meters per point)
  const spacing = density > 0 ? (1000 / density).toFixed(1) : "0";

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 w-full">
      <StatCard
        title="Distance"
        value={`${stats.totalDistance.toLocaleString()} km`}
        icon={<Ruler />}
        color="bg-blue-500"
      />
      <StatCard
        title="Elev Gain"
        value={`${stats.totalElevationGain.toLocaleString()} m`}
        subValue={`Loss: -${stats.totalElevationLoss} m`}
        icon={<ArrowUpRight />}
        color="bg-emerald-500"
      />
       <StatCard
        title="Max Elev"
        value={`${stats.maxElevation.toLocaleString()} m`}
        icon={<Mountain />}
        color="bg-indigo-500"
      />
      <StatCard
        title="Min Elev"
        value={`${stats.minElevation.toLocaleString()} m`}
        icon={<ArrowDownRight />}
        color="bg-cyan-500"
      />
      <StatCard
        title="Density"
        value={`${density.toLocaleString()}`}
        subValue={`${spacing}m spacing`}
        icon={<Activity />}
        color="bg-amber-500"
      />
       <StatCard
        title="Points"
        value={pointCount.toLocaleString()}
        icon={<MapPin />}
        color="bg-pink-500"
      />
    </div>
  );
};