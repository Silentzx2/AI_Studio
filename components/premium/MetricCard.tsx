"use client";


import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from './GlassCard';

type MetricColor = 'purple' | 'blue' | 'cyan' | 'green' | 'pink' | 'amber';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: { value: number; positive: boolean };
  color?: MetricColor;
  delay?: number;
  children?: React.ReactNode;
  /** Array of numbers for a sparkline mini-chart (7-30 points recommended) */
  sparkline?: number[];
}

const ICON_COLORS: Record<MetricColor, { text: string; bg: string; glow: string; accent: string }> = {
  purple: {
    text: 'text-[hsl(var(--neon-purple))]',
    bg: 'bg-[hsl(var(--neon-purple)/0.12)]',
    glow: '0 0 12px hsl(var(--neon-purple)/0.2), 0 0 28px hsl(var(--neon-purple)/0.08)',
    accent: 'hsl(var(--neon-purple))',
  },
  blue: {
    text: 'text-[hsl(var(--neon-blue))]',
    bg: 'bg-[hsl(var(--neon-blue)/0.12)]',
    glow: '0 0 12px hsl(var(--neon-blue)/0.2), 0 0 28px hsl(var(--neon-blue)/0.08)',
    accent: 'hsl(var(--neon-blue))',
  },
  cyan: {
    text: 'text-[hsl(var(--neon-cyan))]',
    bg: 'bg-[hsl(var(--neon-cyan)/0.12)]',
    glow: '0 0 12px hsl(var(--neon-cyan)/0.2), 0 0 28px hsl(var(--neon-cyan)/0.08)',
    accent: 'hsl(var(--neon-cyan))',
  },
  green: {
    text: 'text-[hsl(var(--neon-green))]',
    bg: 'bg-[hsl(var(--neon-green)/0.12)]',
    glow: '0 0 12px hsl(150 80% 55%/0.2), 0 0 28px hsl(150 80% 55%/0.08)',
    accent: 'hsl(var(--neon-green))',
  },
  pink: {
    text: 'text-[hsl(var(--neon-pink))]',
    bg: 'bg-[hsl(var(--neon-pink)/0.12)]',
    glow: '0 0 12px hsl(var(--neon-pink)/0.2), 0 0 28px hsl(var(--neon-pink)/0.08)',
    accent: 'hsl(var(--neon-pink))',
  },
  amber: {
    text: 'text-[hsl(var(--neon-amber))]',
    bg: 'bg-[hsl(var(--neon-amber)/0.12)]',
    glow: '0 0 12px hsl(38 95% 55%/0.2), 0 0 28px hsl(38 95% 55%/0.08)',
    accent: 'hsl(var(--neon-amber))',
  },
};

/** Hook: animates a numeric value from 0 to target */
function useCountUp(target: number, duration = 1200, delay = 0) {
  const [display, setDisplay] = useState(() => {
    // Initialize with target if it's not a valid number for animation
    if (target === 0 || typeof target !== 'number' || isNaN(target)) return target;
    return 0;
  });
  const rafRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0 || typeof target !== 'number' || isNaN(target)) return;
    const timeout = setTimeout(() => {
      startRef.current = null;
      const step = (timestamp: number) => {
        if (!startRef.current) startRef.current = timestamp;
        const elapsed = timestamp - startRef.current;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(eased * target));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step);
        }
      };
      rafRef.current = requestAnimationFrame(step);
    }, delay * 1000);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay]);

  return display;
}

/** Mini sparkline SVG */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const padY = 2;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - padY - ((v - min) / range) * (h - padY * 2);
    return `${x},${y}`;
  });
  const pathD = `M${points.join(' L')}`;
  const areaD = `${pathD} L${w},${h} L0,${h} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-20 h-7"
      preserveAspectRatio="none"
      style={{ overflow: 'visible' }}
    >
      {/* Area fill */}
      <path d={areaD} fill={color} opacity={0.08} />
      {/* Line */}
      <motion.path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
      />
      {/* End dot */}
      <motion.circle
        cx={w}
        cy={h - padY - ((data[data.length - 1] - min) / range) * (h - padY * 2)}
        r="2"
        fill={color}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 1.2 }}
      />
    </svg>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  trend,
  color = 'amber',
  delay = 0,
  children,
  sparkline,
}: MetricCardProps) {
  const ic = ICON_COLORS[color] || ICON_COLORS.amber;
  const isNumeric = typeof value === 'number' || (!isNaN(Number(value)) && value !== '');
  const numericVal = isNumeric ? Number(value) : 0;
  const hasDecimals = String(value).includes('.');
  const decimalPlaces = hasDecimals ? String(value).split('.')[1]?.length || 0 : 0;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[hsl(var(--surface-1))] p-5 shadow-sm transition-all hover:border-white/[0.14]">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <motion.div
              className={cn('flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.05] text-zinc-300 border border-white/[0.06]')}
              whileHover={{ scale: 1.08 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            >
              <Icon className="w-4 h-4 text-primary" />
            </motion.div>
          )}
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            {label}
          </span>
        </div>
        {trend && (
          <span
            className={cn(
              'text-xs font-mono inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md',
              trend.positive
                ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                : 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
            )}
          >
            <span>{trend.positive ? '↑' : '↓'}</span>
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1.5 font-mono">
          {isNumeric ? (
            <span className="text-2xl font-black text-white">
              {numericVal.toFixed(decimalPlaces)}
            </span>
          ) : (
            <span className="text-2xl font-black text-white">
              {value}
            </span>
          )}
          {unit && (
            <span className="text-xs text-zinc-400 font-sans">
              {unit}
            </span>
          )}
        </div>

        {sparkline && sparkline.length >= 2 && (
          <Sparkline data={sparkline} color="hsl(var(--primary))" />
        )}
      </div>

      {children}
    </div>
  );
}