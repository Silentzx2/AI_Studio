'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MOTION_SPRING } from '@/lib/motion';

export interface AnimatedSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  activeColor?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  id?: string;
}

export const AnimatedSwitch: React.FC<AnimatedSwitchProps> = ({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  description,
  activeColor = 'bg-primary',
  size = 'md',
  className = '',
  id,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const autoId = React.useId();
  const switchId = id || autoId;

  const trackSizes = {
    sm: 'w-8 h-4.5 p-0.5',
    md: 'w-10 h-5.5 p-0.5',
    lg: 'w-12 h-6.5 p-0.5',
  };

  const thumbSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4.5 h-4.5',
    lg: 'w-5.5 h-5.5',
  };

  const thumbTranslates = {
    sm: 14,
    md: 18,
    lg: 22,
  };

  const toggle = () => {
    if (!disabled) {
      onCheckedChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div className={cn('flex items-center justify-between gap-3 select-none', className)}>
      {(label || description) && (
        <div className="flex flex-col flex-1 pr-2 cursor-pointer" onClick={toggle}>
          {label && (
            <label
              htmlFor={switchId}
              className="text-xs font-semibold text-zinc-200 cursor-pointer flex items-center gap-1.5"
            >
              {label}
            </label>
          )}
          {description && (
            <span className="text-[10px] text-zinc-400 leading-tight mt-0.5">{description}</span>
          )}
        </div>
      )}

      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative inline-flex items-center rounded-full transition-colors duration-200 cursor-pointer border border-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0',
          trackSizes[size],
          checked ? activeColor : 'bg-surface-2'
        )}
      >
        <motion.span
          layout
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : MOTION_SPRING
          }
          animate={{ x: checked ? thumbTranslates[size] : 0 }}
          className={cn(
            'block rounded-full shadow-md pointer-events-none',
            thumbSizes[size],
            checked ? 'bg-black' : 'bg-zinc-400'
          )}
        />
      </button>
    </div>
  );
};
