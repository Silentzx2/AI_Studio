'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Wraps content in a 2px rotating conic-gradient glow ring (see `.glow-ring` in
 * globals.css). Use it around primary CTAs (e.g. the Generate button) and the
 * drag-and-drop overlay for a premium animated border.
 */
export function GlowRing({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('glow-ring', className)}>{children}</span>;
}
