'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  borderWidth?: number;
  colorFrom?: string;
  colorTo?: string;
}

export const BorderBeam: React.FC<BorderBeamProps> = ({
  className,
  duration = 8,
  borderWidth = 1.5,
  colorFrom = '#F9CF00',
  colorTo = 'transparent',
}) => {
  const prefersReducedMotion = useReducedMotion();
  if (prefersReducedMotion) return null;

  return (
    <div
      style={{ padding: `${borderWidth}px` }}
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden z-20',
        className
      )}
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg 320deg, ${colorFrom} 360deg)`,
        }}
        className="absolute -inset-[100%] w-[300%] h-[300%] left-[-100%] top-[-100%]"
      />
      <div className="absolute inset-[1.5px] rounded-[inherit] bg-transparent pointer-events-none" />
    </div>
  );
};
