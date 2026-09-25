'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type ProgressColor = 'purple' | 'blue' | 'cyan' | 'green' | 'amber' | 'pink';

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  color?: ProgressColor;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'thin';
  showGlow?: boolean;
  indeterminate?: boolean;
  /** Show a percentage label with gradient text */
  showLabel?: boolean;
}

const COLORS: Record<ProgressColor, { from: string; to: string; glow: string }> = {
  purple: { from: 'hsl(var(--neon-purple))', to: 'hsl(var(--neon-pink))', glow: 'hsl(var(--neon-purple))' },
  blue: { from: 'hsl(var(--neon-blue))', to: 'hsl(var(--neon-cyan))', glow: 'hsl(var(--neon-blue))' },
  cyan: { from: 'hsl(var(--neon-cyan))', to: 'hsl(var(--neon-blue))', glow: 'hsl(var(--neon-cyan))' },
  green: { from: 'hsl(150 80% 55%)', to: 'hsl(150 70% 45%)', glow: 'hsl(150 80% 55%)' },
  pink: { from: 'hsl(var(--neon-pink))', to: 'hsl(var(--neon-purple))', glow: 'hsl(var(--neon-pink))' },
  amber: { from: 'hsl(var(--neon-amber))', to: 'hsl(30 100% 55%)', glow: 'hsl(var(--neon-amber))' },
};

function getGlowStyle(color: ProgressColor, intensity: 'normal' | 'strong'): string {
  const c = COLORS[color].glow;
  const a1 = intensity === 'strong' ? 0.6 : 0.4;
  const a2 = intensity === 'strong' ? 0.3 : 0.15;
  const a3 = intensity === 'strong' ? 0.15 : 0.08;
  return `0 0 8px ${c} / ${a1}, 0 0 20px ${c} / ${a2}, 0 0 40px ${c} / ${a3}`;
}

const SIZES: Record<string, string> = {
  xs: 'h-0.5',
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2.5',
  thin: 'h-0.5',
};

export function ProgressBar({
  value,
  max = 100,
  className,
  color = 'purple',
  size = 'md',
  showGlow = false,
  indeterminate = false,
  showLabel = false,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const c = COLORS[color];
  const isThin = size === 'thin';

  return (
    <div className={cn('relative w-full', showLabel && 'flex items-center gap-3', className)}>
      <div
        className={cn(
          'relative flex-1 overflow-hidden rounded-full',
          SIZES[size],
          isThin ? 'bg-[hsl(var(--surface-3)/0.5)]' : 'bg-[hsl(var(--surface-3))]'
        )}
      >
        {indeterminate ? (
          <div className="absolute inset-0">
            <div
              className="absolute h-full w-1/3 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${c.from}, ${c.to})`,
                animation: 'progress-indeterminate 2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                boxShadow: getGlowStyle(color, 'strong'),
                filter: 'brightness(1.1)',
              }}
            />
          </div>
        ) : (
          <motion.div
            className="relative h-full rounded-full overflow-hidden"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              background: `linear-gradient(90deg, ${c.from}, ${c.to})`,
              boxShadow: showGlow ? getGlowStyle(color, 'strong') : `0 2px 8px ${c.glow} / 0.2`,
            }}
          >
            {/* Animated gradient shimmer moving across the fill */}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, transparent 0%, hsl(var(--foreground) / 0.25) 50%, transparent 100%)`,
                backgroundSize: '200% 100%',
                animation: 'shimmer 2s ease-in-out infinite',
              }}
            />
            {/* Bright tip at the leading edge */}
            {!isThin && pct > 0 && (
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-full rounded-full"
                style={{
                  background: 'white',
                  opacity: 0.6,
                  filter: `drop-shadow(0 0 3px ${c.glow} / 0.8)`,
                }}
              />
            )}
          </motion.div>
        )}
      </div>

      {/* Percentage label with gradient text */}
      {showLabel && !indeterminate && (
        <motion.span
          className="text-xs font-mono font-medium tabular-nums min-w-[2.5rem] text-right"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{
            background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {Math.round(pct)}%
        </motion.span>
      )}
    </div>
  );
}