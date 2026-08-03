'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type SpinnerVariant = 'ring' | 'dots' | 'pulse' | 'orbit';
type SpinnerSize = 'sm' | 'md' | 'lg';
type SpinnerColor = 'purple' | 'blue' | 'cyan' | 'pink' | 'green' | 'amber';

interface SpinnerProps {
  variant?: SpinnerVariant;
  size?: SpinnerSize;
  color?: SpinnerColor;
  className?: string;
  /** Optional label text below the spinner */
  label?: string;
}

const COLOR_VALUES: Record<SpinnerColor, string> = {
  purple: 'hsl(var(--neon-purple))',
  blue: 'hsl(var(--neon-blue))',
  cyan: 'hsl(var(--neon-cyan))',
  pink: 'hsl(var(--neon-pink))',
  green: 'hsl(var(--neon-green))',
  amber: 'hsl(var(--neon-amber))',
};

const SIZE_MAP: Record<SpinnerSize, { ring: number; dot: number; strokeWidth: number; gap: number }> = {
  sm: { ring: 20, dot: 5, strokeWidth: 2.5, gap: 4 },
  md: { ring: 28, dot: 7, strokeWidth: 3, gap: 5 },
  lg: { ring: 44, dot: 11, strokeWidth: 4, gap: 7 },
};

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'w-5 h-5',
  md: 'w-7 h-7',
  lg: 'w-11 h-11',
};

const DOT_SIZE: Record<SpinnerSize, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

/** Ring spinner — rotating border with gradient */
function RingSpinner({ size, color, colorValue, s }: { size: SpinnerSize; color: SpinnerColor; colorValue: string; s: typeof SIZE_MAP[SpinnerSize] }) {
  return (
    <div className={cn('relative', SIZE_CLASSES[size])} style={{ width: s.ring, height: s.ring }}>
      {/* Outer rotating ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          border: `${s.strokeWidth}px solid ${colorValue} / 0.2`,
          borderTopColor: colorValue,
          animation: 'spin-slow 1s linear infinite',
          filter: `drop-shadow(0 0 4px ${colorValue} / 0.5)`,
        }}
      />
      {/* Inner counter-rotating ring */}
      <div
        className="absolute rounded-full"
        style={{
          width: s.ring * 0.6,
          height: s.ring * 0.6,
          inset: s.gap,
          border: `${s.strokeWidth - 1}px solid ${COLOR_VALUES.blue} / 0.15`,
          borderBottomColor: `${COLOR_VALUES.blue} / 0.6`,
          animation: 'spin-slow 2s linear infinite reverse',
          filter: `drop-shadow(0 0 3px ${COLOR_VALUES.blue} / 0.4)`,
        }}
      />
      {/* Center glow */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          boxShadow: `0 0 12px ${colorValue} / 0.15, 0 0 24px ${colorValue} / 0.06`,
        }}
      />
    </div>
  );
}

/** Dots spinner — 3 bouncing dots */
function DotsSpinner({ size, colorValue }: { size: SpinnerSize; colorValue: string }) {
  const containerSize = size === 'sm' ? 24 : size === 'md' ? 32 : 44;

  return (
    <div
      className="flex items-center justify-center gap-1.5"
      style={{ width: containerSize, height: containerSize }}
    >
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={cn('rounded-full', DOT_SIZE[size])}
          style={{
            background: colorValue,
            boxShadow: `0 0 6px ${colorValue} / 0.5`,
          }}
          animate={{
            y: [0, -8, 0],
            opacity: [0.5, 1, 0.5],
            scale: [0.85, 1.1, 0.85],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
}

/** Pulse spinner — pulsing circle */
function PulseSpinner({ size, colorValue }: { size: SpinnerSize; colorValue: string }) {
  const containerSize = size === 'sm' ? 20 : size === 'md' ? 28 : 44;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: containerSize, height: containerSize }}
    >
      {/* Outer pulse ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          inset: 0,
          border: `2px solid ${colorValue} / 0.3`,
        }}
        animate={{
          scale: [1, 1.6],
          opacity: [0.6, 0],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: 'easeOut',
        }}
      />
      {/* Inner pulse ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          inset: 0,
          border: `1.5px solid ${colorValue} / 0.2`,
        }}
        animate={{
          scale: [1, 1.4],
          opacity: [0.4, 0],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: 'easeOut',
          delay: 0.3,
        }}
      />
      {/* Center dot */}
      <motion.div
        className="rounded-full"
        style={{
          width: containerSize * 0.35,
          height: containerSize * 0.35,
          background: colorValue,
          boxShadow: `0 0 8px ${colorValue} / 0.5, 0 0 16px ${colorValue} / 0.2`,
        }}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.8, 1, 0.8],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}

/** Orbit spinner — small dot orbiting a ring */
function OrbitSpinner({ size, colorValue }: { size: SpinnerSize; colorValue: string }) {
  const containerSize = size === 'sm' ? 20 : size === 'md' ? 28 : 44;
  const dotSize = size === 'sm' ? 4 : size === 'md' ? 5 : 7;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: containerSize, height: containerSize }}
    >
      {/* Static ring track */}
      <div
        className="absolute rounded-full"
        style={{
          inset: dotSize / 2,
          border: `1px solid ${colorValue} / 0.15`,
        }}
      />
      {/* Orbiting dot */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: dotSize,
          height: dotSize,
          background: colorValue,
          boxShadow: `0 0 6px ${colorValue} / 0.7, 0 0 12px ${colorValue} / 0.3`,
          top: 0,
          left: '50%',
          marginLeft: -dotSize / 2,
          transformOrigin: `${dotSize / 2}px ${containerSize / 2 - dotSize / 2}px`,
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
      {/* Second orbiting dot (opposite) */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: dotSize * 0.6,
          height: dotSize * 0.6,
          background: `${colorValue} / 0.6`,
          boxShadow: `0 0 4px ${colorValue} / 0.5`,
          bottom: 0,
          left: '50%',
          marginLeft: -(dotSize * 0.6) / 2,
          transformOrigin: `${(dotSize * 0.6) / 2}px ${-(containerSize / 2 - (dotSize * 0.6) / 2)}px`,
        }}
        animate={{ rotate: -360 }}
        transition={{
          duration: 1.6,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    </div>
  );
}

export function Spinner({
  variant = 'ring',
  size = 'md',
  color = 'purple',
  className,
  label,
}: SpinnerProps) {
  const colorValue = COLOR_VALUES[color];
  const s = SIZE_MAP[size];

  const spinnerEl = (() => {
    switch (variant) {
      case 'dots':
        return <DotsSpinner size={size} colorValue={colorValue} />;
      case 'pulse':
        return <PulseSpinner size={size} colorValue={colorValue} />;
      case 'orbit':
        return <OrbitSpinner size={size} colorValue={colorValue} />;
      case 'ring':
      default:
        return <RingSpinner size={size} color={color} colorValue={colorValue} s={s} />;
    }
  })();

  return (
    <div className={cn('inline-flex flex-col items-center gap-2', className)}>
      {spinnerEl}
      {label && (
        <motion.span
          className="text-xs text-muted-foreground font-medium"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {label}
        </motion.span>
      )}
    </div>
  );
}