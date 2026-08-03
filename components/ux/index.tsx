'use client';

import * as React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/stores/useThemeStore';

/**
 * Lightweight, theme-aware UX primitives used across the studio to keep
 * loading states, micro-interactions, and premium animations consistent.
 * All colors/glow derive from the Appearance store via CSS variables.
 */

function useAnimationEnabled(flag: string): boolean {
  return useThemeStore((s) => Boolean((s.animations as Record<string, unknown>)[flag]));
}

// ─── Skeleton ────────────────────────────────────────────────────────────
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('shimmer-loading', className)} aria-hidden="true" {...props} />;
}

// ─── Hover Card (respects cardHover style + spotlight appearance settings) ─
export function HoverCard({
  className,
  children,
  hover = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  const cardHover = useThemeStore((s) => s.animations.cardHover);
  const cardHoverStyle = useThemeStore((s) => s.animations.cardHoverStyle);
  const spotlight = useThemeStore((s) => s.spotlightOnCards);

  const hoverClass =
    hover && cardHover
      ? cardHoverStyle === 'glow'
        ? 'card-hover-glow'
        : cardHoverStyle === 'border'
          ? 'card-hover-border'
          : cardHoverStyle === 'tilt'
            ? 'transition-transform hover:-rotate-1 hover:scale-[1.01]'
            : cardHoverStyle === 'none'
              ? ''
              : 'card-hover-lift'
      : '';

  return (
    <div
      className={cn(
        'relative rounded-2xl border border-border bg-card',
        spotlight && 'spotlight',
        hoverClass,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── AI Processing Indicator (streaming dots + rings) ──────────────────────
export function AIProcessing({ label = 'Processing' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="flex items-end gap-0.5 h-4">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-[hsl(var(--primary))] animate-pulse"
            style={{ height: '100%', animationDelay: `${i * 150}ms`, animationDuration: '1s' }}
          />
        ))}
      </span>
    </div>
  );
}

// ─── Page Transition wrapper ───────────────────────────────────────────────
export function PageFade({ children, className }: { children: React.ReactNode; className?: string }) {
  const enabled = useAnimationEnabled('pageTransitions');
  if (!enabled) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
