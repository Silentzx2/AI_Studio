"use client";

import { motion, type Variants } from 'framer-motion';
import { useThemeStore, getAnimationDuration, getEasing } from '@/stores/useThemeStore';
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { cn } from '@/lib/utils';

// ─── Props ───────────────────────────────────────────────────────────────────

interface StaggerListProps {
  children: ReactNode;
  staggerDelay?: number;
  className?: string;
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface StaggerListContextValue {
  itemVariants: Variants;
  enabled: boolean;
}

const StaggerListContext = createContext<StaggerListContextValue>({
  itemVariants: {},
  enabled: false,
});

// ─── StaggerList ──────────────────────────────────────────────────────────────

export function StaggerList({
  children,
  staggerDelay = 0.05,
  className,
}: StaggerListProps) {
  const { animations, animationSpeed } = useThemeStore();

  if (!animations.staggerChildren) {
    return <div className={className}>{children}</div>;
  }

  const dur = getAnimationDuration(300) / 1000;
  const ease = getEasing();
  const delay = staggerDelay * animationSpeed;

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: delay,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: dur,
        ease,
      },
    },
  };

  return (
    <StaggerListContext.Provider value={{ itemVariants, enabled: true }}>
      <motion.div
        className={cn(className)}
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        {children}
      </motion.div>
    </StaggerListContext.Provider>
  );
}

// ─── StaggerItem ─────────────────────────────────────────────────────────────

export function StaggerItem({ children, className }: StaggerItemProps) {
  const { itemVariants, enabled } = useContext(StaggerListContext);

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div className={cn(className)} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
