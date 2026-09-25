'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'neon';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  /** Pulse animation for "live" badges */
  pulse?: boolean;
  /** Show a small colored dot indicator before the content */
  dot?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, { text: string; bg: string; border: string; hoverBg: string; hoverBorder: string; glow: string; dotColor: string }> = {
  default: {
    text: 'text-muted-foreground',
    bg: 'bg-[hsl(var(--surface-2)/0.5)]',
    border: 'border-[hsl(var(--border)/0.4)]',
    hoverBg: 'hover:bg-[hsl(var(--surface-2)/0.7)]',
    hoverBorder: 'hover:border-[hsl(var(--border)/0.6)]',
    glow: 'none',
    dotColor: 'bg-muted-foreground',
  },
  success: {
    text: 'text-[hsl(var(--neon-green))]',
    bg: 'bg-[hsl(var(--neon-green)/0.1)]',
    border: 'border-[hsl(var(--neon-green)/0.2)]',
    hoverBg: 'hover:bg-[hsl(var(--neon-green)/0.16)]',
    hoverBorder: 'hover:border-[hsl(var(--neon-green)/0.35)]',
    glow: '0 0 6px hsl(var(--neon-green)/0.2), 0 0 12px hsl(var(--neon-green)/0.08)',
    dotColor: 'bg-[hsl(var(--neon-green))]',
  },
  warning: {
    text: 'text-[hsl(var(--neon-amber))]',
    bg: 'bg-[hsl(var(--neon-amber)/0.1)]',
    border: 'border-[hsl(var(--neon-amber)/0.2)]',
    hoverBg: 'hover:bg-[hsl(var(--neon-amber)/0.16)]',
    hoverBorder: 'hover:border-[hsl(var(--neon-amber)/0.35)]',
    glow: '0 0 6px hsl(var(--neon-amber)/0.2), 0 0 12px hsl(var(--neon-amber)/0.08)',
    dotColor: 'bg-[hsl(var(--neon-amber))]',
  },
  error: {
    text: 'text-[hsl(var(--destructive))]',
    bg: 'bg-[hsl(var(--destructive)/0.1)]',
    border: 'border-[hsl(var(--destructive)/0.25)]',
    hoverBg: 'hover:bg-[hsl(var(--destructive)/0.16)]',
    hoverBorder: 'hover:border-[hsl(var(--destructive)/0.4)]',
    glow: '0 0 6px hsl(var(--destructive)/0.25), 0 0 12px hsl(var(--destructive)/0.1)',
    dotColor: 'bg-[hsl(var(--destructive))]',
  },
  info: {
    text: 'text-[hsl(var(--neon-blue))]',
    bg: 'bg-[hsl(var(--neon-blue)/0.1)]',
    border: 'border-[hsl(var(--neon-blue)/0.2)]',
    hoverBg: 'hover:bg-[hsl(var(--neon-blue)/0.16)]',
    hoverBorder: 'hover:border-[hsl(var(--neon-blue)/0.35)]',
    glow: '0 0 6px hsl(var(--neon-blue)/0.2), 0 0 12px hsl(var(--neon-blue)/0.08)',
    dotColor: 'bg-[hsl(var(--neon-blue))]',
  },
  neon: {
    text: 'text-[hsl(var(--neon-purple))]',
    bg: 'bg-[hsl(var(--neon-purple)/0.1)]',
    border: 'border-[hsl(var(--neon-purple)/0.25)]',
    hoverBg: 'hover:bg-[hsl(var(--neon-purple)/0.16)]',
    hoverBorder: 'hover:border-[hsl(var(--neon-purple)/0.4)]',
    glow: '0 0 8px hsl(var(--neon-purple)/0.3), 0 0 16px hsl(var(--neon-purple)/0.12)',
    dotColor: 'bg-[hsl(var(--neon-purple))]',
  },
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-px text-[10px] leading-4 gap-1',
  md: 'px-2.5 py-0.5 text-xs leading-4 gap-1.5',
};

const DOT_SIZE: Record<BadgeSize, string> = {
  sm: 'w-1 h-1',
  md: 'w-1.5 h-1.5',
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className,
  pulse = false,
  dot = false,
}: BadgeProps) {
  const v = VARIANT_STYLES[variant];

  return (
    <motion.span
      className={cn(
        'relative inline-flex items-center rounded-full font-medium border',
        'transition-all duration-300 ease-out',
        v.text, v.bg, v.border, v.hoverBg, v.hoverBorder,
        SIZE_CLASSES[size],
        className
      )}
      style={{
        boxShadow: v.glow !== 'none' ? v.glow : undefined,
      }}
      whileHover={{ scale: 1.03 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      {/* Dot indicator */}
      {dot && (
        <span className="relative flex items-center justify-center">
          <span className={cn('rounded-full', DOT_SIZE[size], v.dotColor)} />
          {pulse && (
            <motion.span
              className={cn('absolute rounded-full', DOT_SIZE[size], v.dotColor)}
              animate={{ scale: [1, 1.8, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </span>
      )}
      {children}
    </motion.span>
  );
}