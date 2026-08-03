"use client";

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useThemeStore, getEasing, getAnimationDuration } from '@/stores/useThemeStore';
import type { ReactNode, MouseEvent } from 'react';
import { useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

// ─── Props ───────────────────────────────────────────────────────────────────

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  glass?: boolean;
  intensity?: 'light' | 'medium' | 'heavy';
  hoverEffect?: boolean;
  spotlight?: boolean;
}

// ─── Intensity Config ────────────────────────────────────────────────────────

const intensityConfig = {
  light:  { blur: 8,  bgOpacity: 0.04, borderOpacity: 0.06 },
  medium: { blur: 12, bgOpacity: 0.08, borderOpacity: 0.1  },
  heavy:  { blur: 20, bgOpacity: 0.14, borderOpacity: 0.16 },
} as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function GlassCard({
  children,
  className,
  glass,
  intensity = 'medium',
  hoverEffect,
  spotlight,
}: GlassCardProps) {
  const {
    glassEnabled: themeGlass,
    animations,
    accentColor,
    shadowIntensity,
    borderRadiusLg,
  } = useThemeStore();

  const useGlass = glass ?? themeGlass;
  const useHover = hoverEffect ?? animations.cardHover;
  const useSpotlight = spotlight ?? false;
  const hoverStyle = animations.cardHoverStyle;

  // Glass config
  const cfg = useGlass ? intensityConfig[intensity] : null;
  const blur = cfg ? cfg.blur : 0;
  const bgOpacity = cfg ? cfg.bgOpacity : 0;
  const borderOpacity = cfg ? cfg.borderOpacity : 0;

  // Tilt state
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [spotlightPos, setSpotlightPos] = useState({ x: 0, y: 0 });

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const springCfg = { damping: 30, stiffness: 200, mass: 0.5 };
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [5, -5]), springCfg);
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-5, 5]), springCfg);

  const isTilt = useHover && hoverStyle === 'tilt';

  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      mouseX.set(x);
      mouseY.set(y);
      if (useSpotlight) {
        setSpotlightPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    },
    [mouseX, mouseY, useSpotlight],
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    mouseX.set(0.5);
    mouseY.set(0.5);
  }, [mouseX, mouseY]);

  // Build hover animation props
  const hoverWhileHover: Record<string, unknown> = {};
  const hoverTransition: Record<string, unknown> = {};

  if (useHover && hoverStyle !== 'none' && hoverStyle !== 'tilt') {
    const dur = getAnimationDuration(200) / 1000;
    const ease = getEasing();

    switch (hoverStyle) {
      case 'lift':
        hoverWhileHover.y = -2;
        hoverWhileHover.boxShadow = `0 8px ${24 * shadowIntensity}px rgba(0,0,0,${shadowIntensity * 0.15})`;
        break;
      case 'glow':
        hoverWhileHover.boxShadow = `0 0 ${20 * shadowIntensity}px ${accentColor}50`;
        break;
      case 'border':
        hoverWhileHover.borderColor = accentColor;
        break;
    }

    hoverTransition.duration = dur;
    hoverTransition.ease = ease;
  }

  return (
    <motion.div
      ref={ref}
      className={cn(
        'relative rounded-lg border border-border bg-card text-card-foreground overflow-hidden',
        className,
      )}
      style={{
        borderRadius: borderRadiusLg,
        ...(useGlass
          ? {
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              backgroundColor: `rgba(var(--card), ${bgOpacity})`,
              borderColor: `rgba(var(--border), ${borderOpacity})`,
            }
          : {}),
        ...(isTilt
          ? { rotateX, rotateY, transformPerspective: 800, transformStyle: 'preserve-3d' }
          : {}),
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      whileHover={(Object.keys(hoverWhileHover).length > 0 ? hoverWhileHover : undefined) as any}
      transition={(Object.keys(hoverTransition).length > 0 ? hoverTransition : undefined) as any}
    >
      {/* Spotlight overlay */}
      {useSpotlight && hovered && (
        <div
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-200"
          style={{
            background: `radial-gradient(300px circle at ${spotlightPos.x}px ${spotlightPos.y}px, rgba(255,255,255,0.08), transparent 60%)`,
          }}
        />
      )}

      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
