import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  TooltipProps
} from 'recharts';
import { TrackPoint } from '../types';

interface AnalysisChartsProps {
  data: TrackPoint[];
  onHoverPoint: (index: number | null) => void;
}

// Custom Tooltip to show detailed data
const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/90 border border-slate-700 p-3 rounded-lg shadow-xl backdrop-blur-sm text-xs z-50">
        <p className="text-slate-400 mb-2 font-bold">{`Distance: ${label} km`}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center space-x-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-white">
              {entry.name}: <span className="font-mono font-bold">{entry.value}</span> {entry.unit}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const AnalysisCharts: React.FC<AnalysisChartsProps> = ({ data, onHoverPoint }) => {
  // Downsample data for better chart performance if track is huge
  const chartData = data.length > 2000 
    ? data.filter((_, i) => i % Math.ceil(data.length / 2000) === 0) 
    : data;

  const handleMouseMove = (e: any) => {
    if (e.activeTooltipIndex !== undefined) {
        const item = chartData[e.activeTooltipIndex];
        if(item) {
             const originalIndex = data.findIndex(p => p.dist === item.dist);
             onHoverPoint(originalIndex);
        }
    }
  };

  const handleMouseLeave = () => {
    onHoverPoint(null);
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-lg h-full flex flex-col overflow-hidden relative z-0">
      <div className="mb-4 flex items-center justify-between flex-none">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
            Elevation Profile
        </h3>
        <span className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Alt (m) vs Dist (km)</span>
      </div>
      
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="colorEle" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis 
                dataKey="dist" 
                stroke="#64748b" 
                tick={{fontSize: 12}} 
                tickFormatter={(val) => `${val}km`}
                minTickGap={50}
            />
            <YAxis 
                stroke="#64748b" 
                tick={{fontSize: 12}}
                domain={['auto', 'auto']}
                width={40}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="ele"
              name="Elevation"
              unit="m"
              stroke="#10b981"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorEle)"
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};