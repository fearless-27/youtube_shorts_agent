import React from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: {
    value: string;
    positive: boolean;
  };
  icon?: React.ReactNode;
  sparklineData?: { v: number }[];
  color?: 'purple' | 'emerald' | 'indigo' | 'amber';
  badge?: string;
}

const colorMap = {
  purple: {
    stroke: '#8B5CF6',
    fill: 'url(#sparkline-purple)',
    stop: '#8B5CF6',
    glow: 'rgba(139, 92, 246, 0.45)',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    iconBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  },
  emerald: {
    stroke: '#22C55E',
    fill: 'url(#sparkline-emerald)',
    stop: '#22C55E',
    glow: 'rgba(34, 197, 94, 0.45)',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  indigo: {
    stroke: '#6366F1',
    fill: 'url(#sparkline-indigo)',
    stop: '#6366F1',
    glow: 'rgba(99, 102, 241, 0.45)',
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    iconBg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  },
  amber: {
    stroke: '#F59E0B',
    fill: 'url(#sparkline-amber)',
    stop: '#F59E0B',
    glow: 'rgba(245, 158, 11, 0.45)',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
};

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  change,
  icon,
  sparklineData = [
    { v: 12 }, { v: 19 }, { v: 15 }, { v: 24 }, { v: 22 }, { v: 30 }, { v: 28 }, { v: 35 }
  ],
  color = 'purple',
  badge,
}) => {
  const theme = colorMap[color] || colorMap.purple;

  return (
    <div className="card-metric flex flex-col justify-between overflow-hidden group glow-aura">
      {/* Top row: Icon + Badge / Title */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          {icon && (
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${theme.iconBg} transition-all duration-300 group-hover:scale-105 group-hover:shadow-md`}>
              {icon}
            </div>
          )}
          <div>
            <span className="text-xs font-semibold text-slate-400 block tracking-wider uppercase font-mono">
              {title}
            </span>
            {subtitle && (
              <span className="text-[11px] text-slate-500 block -mt-0.5">
                {subtitle}
              </span>
            )}
          </div>
        </div>

        {badge && (
          <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${theme.badge}`}>
            {badge}
          </span>
        )}
      </div>

      {/* Middle row: Big metric value + change badge */}
      <div className="flex items-baseline justify-between mt-1 mb-3">
        <div className="text-2xl lg:text-3xl font-bold font-display tracking-tight text-white tabular-nums">
          {value}
        </div>

        {change && (
          <div
            className={`flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border tabular-nums ${
              change.positive
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
            }`}
          >
            {change.positive ? (
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
            )}
            {change.value}
          </div>
        )}
      </div>

      {/* Bottom: Sparkline chart with luminous gradient and SVG glow filter */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="h-12 w-full -mx-1 -mb-2 mt-auto opacity-90 group-hover:opacity-100 transition-opacity">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`sparkline-${color}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.stop} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={theme.stop} stopOpacity={0.0} />
                </linearGradient>
                <filter id={`sparkline-glow-${color}`} x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor={theme.stop} floodOpacity="0.5" />
                </filter>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={theme.stroke}
                strokeWidth={2.5}
                filter={`url(#sparkline-glow-${color})`}
                fill={theme.fill}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default MetricCard;
