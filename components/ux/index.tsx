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

// ─── Themed Button (respects glow / gradient / ripple appearance settings) ─
type BtnVariant = 'primary' | 'ghost' | 'outline' | 'subtle';

export function PremiumButton({
  variant = 'primary',
  className,
  children,
  glow = true,
  ...props
}: HTMLMotionProps<'button'> & { variant?: BtnVariant; glow?: boolean }) {
  const buttonGlow = useThemeStore((s) => s.buttonGlow);
  const buttonGradient = useThemeStore((s) => s.buttonGradient);
  const buttonRippleEffect = useThemeStore((s) => s.buttonRippleEffect);
  const enabled = useAnimationEnabled('buttonPress');

  const base =
    'group relative inline-flex items-center justify-center gap-2 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors overflow-hidden select-none';

  const variants: Record<BtnVariant, string> = {
    primary: buttonGradient
      ? 'text-white bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent-secondary,var(--primary)))] border border-transparent'
      : 'text-white bg-[hsl(var(--primary))] border border-transparent',
    ghost: 'text-foreground/80 hover:text-foreground bg-transparent border border-transparent hover:bg-foreground/5',
    outline: 'text-foreground/90 border border-border bg-transparent hover:bg-foreground/5',
    subtle: 'text-foreground/80 bg-surface-2 border border-border hover:bg-surface-3',
  };

  return (
    <motion.button
      whileHover={enabled ? { y: -1 } : undefined}
      whileTap={enabled ? { scale: 0.97 } : undefined}
      className={cn(
        base,
        variants[variant],
        glow && buttonGlow && 'shadow-[0_0_20px_hsl(var(--primary)/0.35)]',
        className,
      )}
      {...props}
    >
      {buttonRippleEffect && (
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <span className="absolute left-1/2 top-1/2 h-0 w-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30 blur-xl transition-all duration-500 group-active:h-40 group-active:w-40" />
        </span>
      )}
      {children}
    </motion.button>
  );
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
