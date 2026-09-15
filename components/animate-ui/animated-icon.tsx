'use client';

import * as React from 'react';
import { motion, useReducedMotion, type TargetAndTransition } from 'framer-motion';
import { cn } from '@/lib/utils';

export type AnimationType = 'rotate' | 'bounce' | 'pulse' | 'bump' | 'shake';

export interface AnimatedIconProps {
  icon: React.ComponentType<{ className?: string; size?: number | string }>;
  animation?: AnimationType;
  className?: string;
  size?: number | string;
  isActive?: boolean;
}

export const AnimatedIcon: React.FC<AnimatedIconProps> = ({
  icon: Icon,
  animation = 'bump',
  className = '',
  size = 16,
  isActive = false,
}) => {
  const prefersReducedMotion = useReducedMotion();

  const animationVariants: Record<AnimationType, { hover: TargetAndTransition; active: TargetAndTransition }> = {
    rotate: {
      hover: { rotate: 90, transition: { duration: 0.25, ease: 'easeOut' } },
      active: { rotate: 360, transition: { repeat: Infinity, duration: 1, ease: 'linear' } },
    },
    bounce: {
      hover: { y: -2, transition: { type: 'spring', stiffness: 400, damping: 12 } },
      active: { y: [-2, 0, -2], transition: { repeat: Infinity, duration: 0.8 } },
    },
    pulse: {
      hover: { scale: 1.15, transition: { duration: 0.15 } },
      active: { scale: [1, 1.15, 1], transition: { repeat: Infinity, duration: 1.2 } },
    },
    bump: {
      hover: { scale: 1.1, transition: { type: 'spring', stiffness: 500, damping: 15 } },
      active: { scale: 1.05 },
    },
    shake: {
      hover: { rotate: [-4, 4, -4, 0], transition: { duration: 0.25 } },
      active: { rotate: [-4, 4, -4, 0] },
    },
  };

  if (prefersReducedMotion) {
    return <Icon className={className} size={size} />;
  }

  const selectedVariant = animationVariants[animation];

  return (
    <motion.span
      className={cn('inline-flex items-center justify-center', className)}
      whileHover={selectedVariant.hover}
      animate={isActive ? selectedVariant.active : undefined}
    >
      <Icon size={size} />
    </motion.span>
  );
};
