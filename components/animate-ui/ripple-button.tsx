'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export interface RippleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  hoverScale?: number;
  tapScale?: number;
  rippleColor?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  shimmer?: boolean;
}

export const RippleButton = React.forwardRef<HTMLButtonElement, RippleButtonProps>(
  (
    {
      children,
      className,
      onClick,
      disabled,
      hoverScale = 1.015,
      tapScale = 0.98,
      rippleColor = 'rgba(255, 255, 255, 0.35)',
      variant = 'primary',
      size,
      shimmer = false,
      ...props
    },
    ref
  ) => {
    const prefersReducedMotion = useReducedMotion();
    const [ripples, setRipples] = React.useState<Ripple[]>([]);
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);

    React.useImperativeHandle(ref, () => buttonRef.current as HTMLButtonElement);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;

      if (!prefersReducedMotion && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const newRipple: Ripple = { id: Date.now(), x, y };

        setRipples((prev) => [...prev, newRipple]);

        setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
        }, 600);
      }

      onClick?.(e);
    };

    const variantStyles = {
      primary:
        'bg-gradient-to-b from-[#FFE24C] to-[#F9CF00] hover:from-[#FFE660] hover:to-[#FFD700] text-black shadow-[0_4px_16px_rgba(249,207,0,0.2)] font-bold',
      secondary:
        'bg-[#1F2228] hover:bg-[#282C34] text-zinc-100 border border-white/[0.08] shadow-sm',
      ghost:
        'bg-transparent hover:bg-white/[0.06] text-zinc-300 hover:text-white',
      outline:
        'bg-transparent border border-white/[0.12] hover:border-[#F9CF00]/50 hover:bg-[#F9CF00]/5 text-zinc-200',
      destructive:
        'bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-900/40 shadow-sm',
    };

    const sizeStyles = {
      sm: 'px-2.5 py-1 text-xs rounded-lg',
      md: 'px-4 py-2 text-sm rounded-xl',
      lg: 'px-6 py-3 text-base rounded-xl',
    };

    return (
      <motion.button
        ref={buttonRef}
        onClick={handleClick}
        disabled={disabled}
        whileHover={!disabled && !prefersReducedMotion ? { scale: hoverScale } : undefined}
        whileTap={!disabled && !prefersReducedMotion ? { scale: tapScale } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'relative overflow-hidden rounded-xl font-medium transition-colors cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2',
          variantStyles[variant],
          size ? sizeStyles[size] : '',
          className
        )}
        {...(props as any)}
      >
        {children}

        {/* Shimmer Light Reflection (21st.dev style) */}
        {shimmer && !disabled && !prefersReducedMotion && (
          <motion.span
            initial={{ x: '-150%' }}
            animate={{ x: '250%' }}
            transition={{
              repeat: Infinity,
              duration: 2.2,
              ease: 'easeInOut',
              repeatDelay: 1.2,
            }}
            className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12 pointer-events-none"
          />
        )}

        {/* Dynamic Ripple Layer */}
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            initial={{ scale: 0, opacity: 0.7 }}
            animate={{ scale: 8, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: ripple.y - 12,
              left: ripple.x - 12,
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: rippleColor,
              pointerEvents: 'none',
            }}
          />
        ))}
      </motion.button>
    );
  }
);

RippleButton.displayName = 'RippleButton';
