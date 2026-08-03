'use client';

import { motion } from 'framer-motion';

interface GlowOrbProps {
  color?: 'purple' | 'blue' | 'cyan' | 'pink' | 'green' | 'amber';
  size?: number;
  className?: string;
  animate?: boolean;
}

const colorMap: Record<NonNullable<GlowOrbProps['color']>, string> = {
  purple: 'radial-gradient(circle, rgba(147, 51, 234, 0.4) 0%, rgba(147, 51, 234, 0) 70%)',
  blue: 'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(59, 130, 246, 0) 70%)',
  cyan: 'radial-gradient(circle, rgba(6, 182, 212, 0.4) 0%, rgba(6, 182, 212, 0) 70%)',
  pink: 'radial-gradient(circle, rgba(236, 72, 153, 0.4) 0%, rgba(236, 72, 153, 0) 70%)',
  green: 'radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, rgba(34, 197, 94, 0) 70%)',
  amber: 'radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, rgba(245, 158, 11, 0) 70%)',
};

const floatAnimation = {
  x: [0, 30, -20, 15, 0],
  y: [0, -25, 15, -10, 0],
};

export function GlowOrb({
  color = 'purple',
  size = 400,
  className,
  animate = true,
}: GlowOrbProps) {
  return (
    <div
      className={`pointer-events-none absolute ${className ?? ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <motion.div
        className="h-full w-full rounded-full"
        style={{
          background: colorMap[color],
          willChange: animate ? 'transform' : undefined,
        }}
        animate={animate ? floatAnimation : undefined}
        transition={
          animate
            ? {
                duration: 12,
                repeat: Infinity,
                repeatType: 'loop',
                ease: 'easeInOut',
              }
            : undefined
        }
      />
    </div>
  );
}