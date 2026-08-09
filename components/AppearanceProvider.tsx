'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/stores/useThemeStore';

// ─── Hex → HSL Conversion ──────────────────────────────────────────────────

/**
 * Converts a hex color string (e.g. "#A855F7") to an HSL string
 * suitable for CSS custom properties: "265 85% 65%".
 * If the input is already an HSL string, it is returned as-is.
 */
export function hexToHSLString(hex: string): string {
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

import type { ThemeConfig } from '@/stores/useThemeStore';

/**
 * Applies the entire ThemeConfig to `document.documentElement` as CSS custom
 * properties and data attributes. Every setting in the store is written here so
 * that globals.css has a single runtime layer to read from.
 */
export function applyGlobalTheme(cfg: ThemeConfig): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement.style;
  const html = document.documentElement;

  // ── Colors ──
  if (cfg.accentColor) {
    const hsl = hexToHSLString(cfg.accentColor);
    root.setProperty('--primary', hsl);
    root.setProperty('--ring', hsl);
    root.setProperty('--accent', hsl);
    root.setProperty('--neon-purple', hsl);
    root.setProperty('--neon-amber', hsl);
    root.setProperty('--accent-gradient-from', `hsl(${hsl})`);
    root.setProperty('--accent-gradient-to', hexToHSLString(cfg.accentColorSecondary || cfg.accentColor));
  }

  if (cfg.accentColorSecondary) {
    root.setProperty('--accent-secondary', hexToHSLString(cfg.accentColorSecondary));
  }

  if (cfg.surfaceOpacity !== undefined) {
    root.setProperty('--surface-opacity', String(cfg.surfaceOpacity));
  }

  // ── Border Radius ──
  if (cfg.borderRadius) root.setProperty('--radius', cfg.borderRadius);
  if (cfg.borderRadiusSm) root.setProperty('--radius-sm', cfg.borderRadiusSm);
  if (cfg.borderRadiusLg) root.setProperty('--radius-lg', cfg.borderRadiusLg);

  // ── Glass Effect ──
  const glassEnabled = cfg.glassEnabled === true;
  if (cfg.glassBlur !== undefined) root.setProperty('--glass-blur', `${cfg.glassBlur}px`);
  if (cfg.glassBorderOpacity !== undefined) {
    root.setProperty('--glass-border-opacity', String(cfg.glassBorderOpacity));
  }
  if (cfg.glassBackgroundOpacity !== undefined) {
    root.setProperty('--glass-bg-opacity', String(cfg.glassBackgroundOpacity));
  }
  root.setProperty('--glass-enabled', glassEnabled ? '1' : '0');

  // ── Shadows ──
  if (cfg.shadowIntensity !== undefined) {
    root.setProperty('--shadow-intensity', String(cfg.shadowIntensity));
  }
  root.setProperty('--shadow-color', hexToHSLString(cfg.shadowColor || cfg.accentColor || '#000000'));

  // ── Global app background (solid / gradient / wallpaper) ──
  if (cfg.appBackgroundEnabled && cfg.appBackground) {
    root.setProperty('--app-background', cfg.appBackground);
  } else {
    root.setProperty('--app-background', '');
  }

  // ── Neon Glow ──
  root.setProperty('--neon-glow-intensity', String(cfg.neonGlowIntensity ?? 0.5));

  // ── Animation Speed ──
  if (cfg.animationSpeed !== undefined) {
    root.setProperty('--animation-speed', String(cfg.animationSpeed));
    html.classList.remove('no-animations', 'reduced-animations');
    if (cfg.animationSpeed === 0) {
      html.classList.add('no-animations');
    } else if (cfg.animationSpeed >= 2) {
      html.classList.add('reduced-animations');
    }
  }

  // ── Theme Mode ──
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

  // ── Font Size ──
  if (cfg.fontSize) {
    const sizeMap: Record<string, string> = {
      sm: '14px',
      md: '16px',
      lg: '18px',
    };
    root.setProperty('--base-font-size', sizeMap[cfg.fontSize] || '16px');
  }

  // ── Density ──
  if (cfg.density) {
    html.setAttribute('data-density', cfg.density);
    const multMap: Record<string, string> = { compact: '0.75', normal: '1', comfortable: '1.25' };
    root.setProperty('--spacing-multiplier', multMap[cfg.density] || '1');
  }

  // ── Navbar ──
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

  // ── Tab Style & Indicator ──
  html.setAttribute('data-tab-style', cfg.tabStyle || 'pill');
  html.setAttribute('data-tab-indicator', cfg.tabIndicatorColor || 'accent');

  // ── Button Styles ──
  html.setAttribute('data-button-glow', String(cfg.buttonGlow));
  html.setAttribute('data-button-gradient', String(cfg.buttonGradient));
  html.setAttribute('data-button-ripple', String(cfg.buttonRippleEffect));
  html.setAttribute('data-button-border-glow', String(cfg.buttonBorderGlow));

  // ── Lighting Effects ──
  html.setAttribute('data-neon-glow', String(cfg.neonGlowEnabled));
  html.setAttribute('data-ambient-glow', String(cfg.ambientGlowEnabled));
  html.setAttribute('data-spotlight-cards', String(cfg.spotlightOnCards));

  // ── Animation Easing ──
  html.setAttribute('data-animation-easing', cfg.animationEasing || 'spring');

  // ── Animation Toggles ──
  const a = cfg.animations;
  html.setAttribute('data-anim-page-transitions', String(a.pageTransitions));
  html.setAttribute('data-anim-dropdown', String(a.dropdownOpen));
  html.setAttribute('data-dropdown-style', a.dropdownStyle || 'spring');
  html.setAttribute('data-anim-card-hover', String(a.cardHover));
  html.setAttribute('data-card-hover', a.cardHoverStyle || 'lift');
  html.setAttribute('data-anim-button-press', String(a.buttonPress));
  html.setAttribute('data-anim-shimmer', String(a.shimmerLoading));
  html.setAttribute('data-anim-stagger', String(a.staggerChildren));
  html.setAttribute('data-anim-sidebar', String(a.sidebarTransitions));
  html.setAttribute('data-anim-progress', a.progressBar || 'default');
  html.setAttribute('data-anim-upload-pulse', String(a.uploadPulse));
  html.setAttribute('data-anim-toast', String(a.toastAnimations));
  html.setAttribute('data-anim-fade-in', String(a.fadeInSection));
}

// ─── Provider Component ──────────────────────────────────────────────────────

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;

    // Apply initial config from the store
    const cfg = useThemeStore.getState();
    applyGlobalTheme(cfg);

    // Subscribe to store changes — re-apply on every update
    const unsubscribe = useThemeStore.subscribe((newCfg) => {
      applyGlobalTheme(newCfg);
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

  return <>{children}</>;
}
