"use client";

import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { useThemeStore, getAnimationDuration, getEasing } from '@/stores/useThemeStore';
import type { ReactNode } from 'react';

// ─── Props ───────────────────────────────────────────────────────────────────

interface AnimatedDropdownContentProps {
  children: ReactNode;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

// ─── Animation Variants ──────────────────────────────────────────────────────

const variants: Record<string, Variants> = {
  spring: {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slide: {
    hidden: { opacity: 0, y: -8 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  },
  scale: {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
  },
  flip: {
    hidden: { opacity: 0, rotateX: -15 },
    visible: { opacity: 1, rotateX: 0 },
    exit: { opacity: 0, rotateX: -15 },
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function AnimatedDropdownContent({
  children,
  open,
  className,
}: AnimatedDropdownContentProps) {
  const { animations, glassEnabled } = useThemeStore();
  const style = animations.dropdownStyle;
  const duration = getAnimationDuration(150);
  const easing = getEasing();

  const isSpring = style === 'spring';
  const variant = variants[style] ?? variants.spring;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={className}
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={variant}
          transition={
            isSpring
              ? { type: 'spring', damping: 25, stiffness: 400 }
              : { duration: duration / 1000, ease: easing }
          }
          style={{
            transformOrigin: 'top center',
            ...(glassEnabled ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}),
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
