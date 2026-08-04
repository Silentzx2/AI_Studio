'use client';

import { useEffect, useId, useRef } from 'react';
import { useThemeStore } from '@/stores/useThemeStore';

// ─── Hex → HSL Conversion ──────────────────────────────────────────────────

/**
 * Converts a hex color string (e.g. "#A855F7") to an HSL string
 * suitable for CSS custom properties: "265 85% 65%".
 * If the input is already an HSL string, it is returned as-is.
 */
export function hexToHSLString(hex: string): string {
  // If it's already an HSL string like "265 85% 65%"
  if (!hex.startsWith('#')) return hex;

  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  } else {
    return hex;
  }

  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// ─── Core Theme Application ─────────────────────────────────────────────────

type ThemeAnimationConfig = {
  cardHoverStyle?: string;
  dropdownStyle?: string;
};

export type ThemeVisualConfig = {
  accentColor?: string;
  accentColorSecondary?: string;
  surfaceOpacity?: number;
  borderRadius?: string;
  borderRadiusSm?: string;
  borderRadiusLg?: string;
  glassEnabled?: boolean;
  glassBlur?: number;
  glassBorderOpacity?: number;
  glassBackgroundOpacity?: number;
  shadowIntensity?: number;
  shadowColor?: string;
  animationSpeed?: number;
  theme?: 'dark' | 'light' | 'system';
  fontSize?: 'sm' | 'md' | 'lg';
  density?: 'compact' | 'normal' | 'comfortable';
  navbarStyle?: 'glass' | 'solid' | 'transparent';
  tabStyle?: string;
  animations?: ThemeAnimationConfig | 'none' | 'reduced' | 'full' | null;
  neonGlowEnabled?: boolean;
};

/**
 * Applies theme config values as CSS custom properties on
 * `document.documentElement.style` and toggles classes / data attributes.
 *
 * Accepts either the full store config or a smaller UI section config.
 */
export function applyGlobalTheme(cfg: ThemeVisualConfig): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement.style;
  const html = document.documentElement;

  // Colors
  if (cfg.accentColor) {
    const hsl = hexToHSLString(cfg.accentColor);
    root.setProperty('--primary', hsl);
    root.setProperty('--ring', hsl);
    root.setProperty('--accent', hsl);
    root.setProperty('--neon-purple', hsl);
    root.setProperty('--neon-amber', hsl);
  }

  if (cfg.accentColorSecondary) {
    root.setProperty('--accent-secondary', hexToHSLString(cfg.accentColorSecondary));
  }

  if (cfg.surfaceOpacity !== undefined) {
    root.setProperty('--surface-opacity', String(cfg.surfaceOpacity));
  }

  // Radius
  if (cfg.borderRadius) root.setProperty('--radius', cfg.borderRadius);
  if (cfg.borderRadiusSm) root.setProperty('--radius-sm', cfg.borderRadiusSm);
  if (cfg.borderRadiusLg) root.setProperty('--radius-lg', cfg.borderRadiusLg);

  // Glass
  const glassEnabled = cfg.glassEnabled === true;
  if (cfg.glassBlur !== undefined) root.setProperty('--glass-blur', `${cfg.glassBlur}px`);
  if (cfg.glassBorderOpacity !== undefined) {
    root.setProperty('--glass-border-opacity', String(cfg.glassBorderOpacity));
  }
  if (cfg.glassBackgroundOpacity !== undefined) {
    root.setProperty('--glass-bg-opacity', String(cfg.glassBackgroundOpacity));
  }
  root.setProperty('--glass-enabled', glassEnabled ? '1' : '0');

  // Shadows
  if (cfg.shadowIntensity !== undefined) {
    root.setProperty('--shadow-intensity', String(cfg.shadowIntensity));
  }
  root.setProperty('--shadow-color', cfg.shadowColor || cfg.accentColor || '#000000');

  // Animation
  if (cfg.animationSpeed !== undefined) {
    root.setProperty('--animation-speed', String(cfg.animationSpeed));
    html.classList.remove('no-animations', 'reduced-animations');
    if (cfg.animationSpeed === 0) {
      html.classList.add('no-animations');
    } else if (cfg.animationSpeed >= 2) {
      html.classList.add('reduced-animations');
    }
  }

  // Theme Mode
  const resolveTheme = (mode: string): 'dark' | 'light' => {
    if (mode === 'system') {
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode as 'dark' | 'light';
  };

  if (cfg.theme) {
    const resolved = resolveTheme(cfg.theme);
    html.classList.toggle('dark', resolved === 'dark');
    html.classList.toggle('light', resolved === 'light');
    html.setAttribute('data-theme', resolved);
  }

  // Font Size
  if (cfg.fontSize) {
    const sizeMap: Record<string, string> = {
      sm: '14px',
      md: '16px',
      lg: '18px',
    };
    root.setProperty('--base-font-size', sizeMap[cfg.fontSize] || '16px');
  }

  // Density
  if (cfg.density) {
    html.setAttribute('data-density', cfg.density);
  }

  // Navbar
  if (cfg.navbarStyle) {
    const navMap: Record<string, [string, string]> = {
      glass: ['0.8', '12px'],
      solid: ['1', '0px'],
      transparent: ['0', '0px'],
    };
    const [bgOpacity, backdropBlur] = navMap[cfg.navbarStyle] || navMap.glass;
    root.setProperty('--nav-bg-opacity', bgOpacity);
    root.setProperty('--nav-backdrop-blur', backdropBlur);
  }

  // Data Attributes for CSS Selectors
  html.setAttribute('data-glass-enabled', String(glassEnabled));
  html.setAttribute('data-tab-style', cfg.tabStyle || 'pill');

  if (typeof cfg.animations === 'object' && cfg.animations) {
    html.setAttribute('data-card-hover', cfg.animations.cardHoverStyle || 'lift');
    html.setAttribute('data-dropdown-style', cfg.animations.dropdownStyle || 'spring');
  } else {
    html.setAttribute('data-card-hover', 'lift');
    html.setAttribute('data-dropdown-style', 'spring');
  }

  if (typeof cfg.neonGlowEnabled === 'boolean') {
    html.setAttribute('data-neon-glow', String(cfg.neonGlowEnabled));
  }
}

// ─── Dynamic Utility CSS ─────────────────────────────────────────────────────

/**
 * Generates a `<style>` block whose rules read from CSS custom properties so
 * the utility classes automatically reflect the current theme values.
 */
function buildUtilityCSS(): string {
  return `
/* ─── Glass Effect ─────────────────────────────────────── */
.glass-effect {
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  background: rgba(255, 255, 255, calc(var(--glass-bg-opacity, 0.08) * var(--glass-enabled, 1)));
  border: 1px solid rgba(255, 255, 255, calc(var(--glass-border-opacity, 0.1) * var(--glass-enabled, 1)));
}

html.dark .glass-effect {
  background: rgba(255, 255, 255, calc(var(--glass-bg-opacity, 0.08) * var(--glass-enabled, 1)));
  border-color: rgba(255, 255, 255, calc(var(--glass-border-opacity, 0.1) * var(--glass-enabled, 1)));
}

html.light .glass-effect {
  background: rgba(0, 0, 0, calc(var(--glass-bg-opacity, 0.08) * var(--glass-enabled, 1)));
  border-color: rgba(0, 0, 0, calc(var(--glass-border-opacity, 0.1) * var(--glass-enabled, 1)));
}

/* ─── Glass Card ───────────────────────────────────────── */
.glass-card {
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  background: rgba(255, 255, 255, calc(var(--glass-bg-opacity, 0.08) * var(--glass-enabled, 1)));
  border: 1px solid rgba(255, 255, 255, calc(var(--glass-border-opacity, 0.1) * var(--glass-enabled, 1)));
  border-radius: var(--radius, 0.75rem);
  padding: 1.5rem;
}

html.dark .glass-card {
  background: rgba(255, 255, 255, calc(var(--glass-bg-opacity, 0.08) * var(--glass-enabled, 1)));
  border-color: rgba(255, 255, 255, calc(var(--glass-border-opacity, 0.1) * var(--glass-enabled, 1)));
}

html.light .glass-card {
  background: rgba(0, 0, 0, calc(var(--glass-bg-opacity, 0.08) * var(--glass-enabled, 1)));
  border-color: rgba(0, 0, 0, calc(var(--glass-border-opacity, 0.1) * var(--glass-enabled, 1)));
}

/* ─── Glow Effect ──────────────────────────────────────── */
.glow-effect {
  box-shadow:
    0 0 calc(15px * var(--shadow-intensity, 0.5))
        hsl(from var(--neon-purple, 265 85% 65%) h s l / calc(0.35 * var(--shadow-intensity, 0.5))),
    0 0 calc(40px * var(--shadow-intensity, 0.5))
        hsl(from var(--neon-purple, 265 85% 65%) h s l / calc(0.15 * var(--shadow-intensity, 0.5)));
}

html:not([data-neon-glow="true"]) .glow-effect,
[data-neon-glow="false"] .glow-effect {
  box-shadow: none;
}

/* ─── Shimmer Loading ──────────────────────────────────── */
@keyframes shimmer-slide {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.shimmer-loading {
  position: relative;
  overflow: hidden;
  background: var(--surface-opacity, rgba(255, 255, 255, 0.06));
}

html.dark .shimmer-loading {
  background: rgba(255, 255, 255, var(--surface-opacity, 0.06));
}

html.light .shimmer-loading {
  background: rgba(0, 0, 0, var(--surface-opacity, 0.06));
}

.shimmer-loading::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.08) 50%,
    transparent 100%
  );
  animation: shimmer-slide calc(1.5s / var(--animation-speed, 1)) infinite ease-in-out;
}

html.light .shimmer-loading::after {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(0, 0, 0, 0.06) 50%,
    transparent 100%
  );
}

/* ─── Animation Speed Modifiers ────────────────────────── */
.no-animations *,
.no-animations *::before,
.no-animations *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}

.reduced-animations *,
.reduced-animations *::before,
.reduced-animations *::after {
  animation-duration: 0.01s !important;
  transition-duration: 0.01s !important;
}
  `.trim();
}

// ─── Provider Component ──────────────────────────────────────────────────────

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const styleId = useId();
  const initialApplied = useRef(false);

  useEffect(() => {
    const root = document.documentElement;

    // Apply initial config from the store
    const cfg = useThemeStore.getState();
    applyGlobalTheme(cfg);
    root.setAttribute('data-neon-glow', String(cfg.neonGlowEnabled));
    initialApplied.current = true;

    // Subscribe to store changes — re-apply on every update
    const unsubscribe = useThemeStore.subscribe((newCfg) => {
      applyGlobalTheme(newCfg);
      root.setAttribute('data-neon-glow', String(newCfg.neonGlowEnabled));
    });

    // Listen for system prefers-color-scheme changes when theme === 'system'
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      const current = useThemeStore.getState();
      if (current.theme === 'system') {
        const isDark = mediaQuery.matches;
        root.classList.toggle('dark', isDark);
        root.classList.toggle('light', !isDark);
        root.setAttribute('data-theme', isDark ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handleSystemChange);

    return () => {
      unsubscribe();
      mediaQuery.removeEventListener('change', handleSystemChange);
    };
  }, []);

  return (
    <>
      {/* Utility CSS classes that read from CSS custom properties */}
      <style
        dangerouslySetInnerHTML={{ __html: buildUtilityCSS() }}
        data-theme-utilities={styleId}
      />
      {children}
    </>
  );
}
