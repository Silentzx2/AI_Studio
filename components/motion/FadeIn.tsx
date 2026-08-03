"use client";

import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useThemeStore, getAnimationDuration, getEasing } from '@/stores/useThemeStore';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { cn } from '@/lib/utils';

// ─── Props ───────────────────────────────────────────────────────────────────

interface FadeInProps {
  children: ReactNode;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  delay?: number;
  duration?: number;
}

// ─── Direction Offset ────────────────────────────────────────────────────────

const offset: Record<string, { x: number; y: number }> = {
  up:    { x: 0, y: 16 },
  down:  { x: 0, y: -16 },
  left:  { x: 16, y: 0 },
  right: { x: -16, y: 0 },
  none:  { x: 0, y: 0 },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function FadeIn({
  children,
  className,
  direction = 'up',
  delay = 0,
  duration,
}: FadeInProps) {
  const { animations } = useThemeStore();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  if (!animations.fadeInSection) {
    return <div className={className}>{children}</div>;
  }

  const dur = getAnimationDuration(duration ?? 400) / 1000;
  const ease = getEasing();
  const d = offset[direction] ?? offset.none;

  return (
    <motion.div
      ref={ref}
      className={cn(className)}
      initial={{ opacity: 0, x: d.x, y: d.y }}
      animate={isInView ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: d.x, y: d.y }}
      transition={{
        duration: dur,
        delay,
        ease,
      }}
    >
      {children}
    </motion.div>
  );
}
