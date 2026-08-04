"use client";

import { motion } from 'framer-motion';
import { useThemeStore, getAnimationDuration } from '@/stores/useThemeStore';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ─── Props ───────────────────────────────────────────────────────────────────

interface ShimmerButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  shimmer?: boolean;
  glow?: boolean;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  form?: string;
}

// ─── Size Mapping ─────────────────────────────────────────────────────────────

const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
};

// ─── Variant Base Styles ─────────────────────────────────────────────────────

const variantClasses: Record<string, string> = {
  primary: 'text-[hsl(var(--foreground))] relative overflow-hidden',
  secondary: 'bg-secondary text-secondary-foreground relative overflow-hidden',
  ghost: 'bg-transparent hover:bg-accent/10 text-foreground',
  outline: 'bg-transparent border border-border text-foreground relative overflow-hidden',
};

// ─── Keyframe Injection ───────────────────────────────────────────────────────

let keyframeInjected = false;
function ensureKeyframe() {
  if (keyframeInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `@keyframes shimmer-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`;
  document.head.appendChild(style);
  keyframeInjected = true;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ShimmerButton({
  variant = 'primary',
  size = 'md',
  shimmer = true,
  glow,
  children,
  className,
  disabled,
  style: externalStyle,
  onClick,
  type,
  form,
}: ShimmerButtonProps) {
  const {
    accentColor,
    accentColorSecondary,
    buttonGlow,
    buttonGradient,
    neonGlowEnabled,
    neonGlowIntensity,
    borderRadius,
  } = useThemeStore();

  const useGlow = glow ?? buttonGlow;
  const isPrimary = variant === 'primary';
  const shimmerDuration = getAnimationDuration(1500);

  ensureKeyframe();

  // Dynamic background for primary
  const bgStyle: React.CSSProperties = isPrimary
    ? {
        backgroundColor: buttonGradient ? 'transparent' : accentColor,
        ...(buttonGradient
          ? { backgroundImage: `linear-gradient(135deg, ${accentColor}, ${accentColorSecondary})` }
          : {}),
      }
    : {};

  // Glow
  const blurSize = neonGlowEnabled ? 20 : 12;
  const intensity = neonGlowIntensity ?? 0.3;
  const baseShadow = useGlow
    ? `0 0 ${blurSize}px ${accentColor}40`
    : 'none';
  const hoverShadow = useGlow
    ? `0 0 ${blurSize + 8}px ${accentColor}70`
    : 'none';

  return (
    <motion.button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      style={{
        ...bgStyle,
        borderRadius,
        boxShadow: baseShadow,
        ...externalStyle,
      }}
      whileHover={{
        scale: 1.02,
        boxShadow: hoverShadow,
      }}
      whileTap={{
        scale: 0.98,
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      disabled={disabled}
      onClick={onClick}
      type={type}
      form={form}
    >
      {/* Shimmer overlay */}
      {shimmer && (isPrimary || variant === 'outline' || variant === 'secondary') && (
        <span
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ borderRadius: 'inherit' }}
          aria-hidden
        >
          <span
            className="absolute inset-0"
            style={{
              background: isPrimary
                ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)'
                : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
              animation: `shimmer-sweep ${shimmerDuration}ms ease-in-out infinite`,
            }}
          />
        </span>
      )}

      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}
