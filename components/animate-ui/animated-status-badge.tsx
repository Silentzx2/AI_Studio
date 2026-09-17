'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MOTION_FAST, MOTION_SPRING } from '@/lib/motion';

export type StatusType = 'idle' | 'running' | 'completed' | 'failed' | 'warning' | 'online' | 'offline';

export interface AnimatedStatusBadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
  pulse?: boolean;
}

const statusConfigs: Record<
  StatusType,
  {
    color: string;
    bg: string;
    border: string;
    dotColor: string;
    pingColor: string;
    defaultLabel: string;
  }
> = {
  idle: {
    color: 'text-zinc-400',
    bg: 'bg-zinc-800/40',
    border: 'border-zinc-700/40',
    dotColor: 'bg-zinc-400',
    pingColor: 'bg-zinc-400',
    defaultLabel: 'Idle',
  },
  running: {
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/30',
    dotColor: 'bg-primary',
    pingColor: 'bg-primary',
    defaultLabel: 'Running',
  },
  completed: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    dotColor: 'bg-emerald-400',
    pingColor: 'bg-emerald-400',
    defaultLabel: 'Ready',
  },
  online: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    dotColor: 'bg-emerald-400',
    pingColor: 'bg-emerald-400',
    defaultLabel: 'Online',
  },
  failed: {
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    dotColor: 'bg-rose-400',
    pingColor: 'bg-rose-400',
    defaultLabel: 'Failed',
  },
  offline: {
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    dotColor: 'bg-rose-400',
    pingColor: 'bg-rose-400',
    defaultLabel: 'Offline',
  },
  warning: {
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    dotColor: 'bg-amber-400',
    pingColor: 'bg-amber-400',
    defaultLabel: 'Warning',
  },
};

export const AnimatedStatusBadge: React.FC<AnimatedStatusBadgeProps> = ({
  status,
  label,
  className = '',
  pulse = true,
}) => {
  const cfg = statusConfigs[status] || statusConfigs.idle;
  const isPulsing = pulse && (status === 'running' || status === 'online');

  return (
    <motion.span
      layout
      transition={MOTION_SPRING}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border transition-colors select-none',
        cfg.bg,
        cfg.border,
        cfg.color,
        className
      )}
    >
      {/* Radar Ping Dot */}
      <span className="relative flex h-2 w-2">
        {isPulsing && (
          <span
            className={cn(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              cfg.pingColor
            )}
          />
        )}
        <span className={cn('relative inline-flex rounded-full h-2 w-2', cfg.dotColor)} />
      </span>

      {/* Status Text with morphing transition */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label || cfg.defaultLabel}
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 2 }}
          transition={MOTION_FAST}
          className="truncate"
        >
          {label || cfg.defaultLabel}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
};
