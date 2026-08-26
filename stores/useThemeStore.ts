import React from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Easing } from 'framer-motion';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThemeConfig {
  // Colors
  accentColor: string;
  accentColorSecondary: string;
  surfaceOpacity: number;

  // Workspace Colors
  workspaceBackground: string;
  workspacePanel: string;
  workspaceViewport: string;
  workspaceText: string;
  workspaceTextMuted: string;
  workspaceBorder: string;
  workspaceActiveBg: string;
  workspaceHoverBg: string;
  workspaceTabActiveBg: string;
  workspaceTabBarBg: string;
  workspaceNavBg: string;
  workspaceDropdownBg: string;
  workspaceHudBg: string;
  workspaceHudBorder: string;

  // Border Radius
  borderRadius: string;
  borderRadiusSm: string;
  borderRadiusLg: string;

  // Glass Effect
  glassEnabled: boolean;
  glassBlur: number;
  glassBorderOpacity: number;
  glassBackgroundOpacity: number;

  // Tab Styles
  tabStyle: 'pill' | 'underline' | 'rounded' | 'glass' | 'minimal';
  tabIndicatorColor: 'accent' | 'white' | 'gradient';

  // Button Styles
  buttonGlow: boolean;
  buttonGradient: boolean;
  buttonRippleEffect: boolean;
  buttonBorderGlow: boolean;

  // Lighting Effects
  neonGlowEnabled: boolean;
  neonGlowIntensity: number;
  ambientGlowEnabled: boolean;
  spotlightOnCards: boolean;

  // Animation Controls (per-component)
  animations: {
    pageTransitions: boolean;
    dropdownOpen: boolean;
    dropdownStyle: 'spring' | 'fade' | 'slide' | 'scale' | 'flip';
    cardHover: boolean;
    cardHoverStyle: 'lift' | 'glow' | 'border' | 'tilt' | 'none';
    buttonPress: boolean;
    shimmerLoading: boolean;
    staggerChildren: boolean;
    sidebarTransitions: boolean;
    progressBar: 'default' | 'shimmer' | 'gradient' | 'neon';
    uploadPulse: boolean;
    toastAnimations: boolean;
    fadeInSection: boolean;
  };

  // Animation Speed
  animationSpeed: number;
  animationEasing: 'spring' | 'smooth' | 'snappy' | 'dramatic';

  // Density
  fontSize: 'sm' | 'md' | 'lg';
  density: 'compact' | 'normal' | 'comfortable';

  // Theme Mode
  theme: 'dark' | 'light' | 'system';

  // Navbar
  navbarStyle: 'glass' | 'solid' | 'transparent';

  // Shadows
  shadowIntensity: number;
  shadowColor: string;

  // Global app background (solid / gradient / wallpaper) applied app-wide.
  appBackgroundEnabled: boolean;
  appBackgroundType: 'solid' | 'gradient' | 'wallpaper';
  appBackground: string;
}

type AnimationKey = keyof ThemeConfig['animations'];

// ─── Default Config ──────────────────────────────────────────────────────────

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  // Colors
  accentColor: '#F5A623',
  accentColorSecondary: '#FF5A1F',
  surfaceOpacity: 0.06,

  // Workspace Colors (default dark theme)
  workspaceBackground: '#0d0e12',
  workspacePanel: '#101115',
  workspaceViewport: '#0a0b0e',
  workspaceText: '#f3f4f6',
  workspaceTextMuted: '#8e95a5',
  workspaceBorder: '#21242c',
  workspaceActiveBg: '#1e2230',
  workspaceHoverBg: '#181a20',
  workspaceTabActiveBg: '#1c1f28',
  workspaceTabBarBg: '#0f1014',
  workspaceNavBg: '#0f1015',
  workspaceDropdownBg: '#181a22',
  workspaceHudBg: '#12141a',
  workspaceHudBorder: '#232733',

  // Border Radius
  borderRadius: '0.75rem',
  borderRadiusSm: '0.5rem',
  borderRadiusLg: '1rem',

  // Glass Effect
  glassEnabled: true,
  glassBlur: 12,
  glassBorderOpacity: 0.1,
  glassBackgroundOpacity: 0.08,

  // Tab Styles
  tabStyle: 'pill',
  tabIndicatorColor: 'accent',

  // Button Styles
  buttonGlow: true,
  buttonGradient: true,
  buttonRippleEffect: true,
  buttonBorderGlow: false,

  // Lighting Effects
  neonGlowEnabled: true,
  neonGlowIntensity: 0.22,
  ambientGlowEnabled: true,
  spotlightOnCards: false,

  // Animation Controls
  animations: {
    pageTransitions: true,
    dropdownOpen: true,
    dropdownStyle: 'spring',
    cardHover: true,
    cardHoverStyle: 'lift',
    buttonPress: true,
    shimmerLoading: true,
    staggerChildren: true,
    sidebarTransitions: true,
    progressBar: 'shimmer',
    uploadPulse: true,
    toastAnimations: true,
    fadeInSection: true,
  },

  // Animation Speed
  animationSpeed: 1,
  animationEasing: 'spring',

  // Density
  fontSize: 'md',
  density: 'normal',

  // Theme Mode
  theme: 'dark',

  // Navbar
  navbarStyle: 'solid',

  // Shadows
  shadowIntensity: 0.5,
  shadowColor: '#F5A623',

  // Global app background
  appBackgroundEnabled: false,
  appBackgroundType: 'gradient',
  appBackground: 'linear-gradient(180deg, #0a0e14, #0b0f17)',
};

// ─── Presets ─────────────────────────────────────────────────────────────────

type PresetConfig = Partial<ThemeConfig>;

const presets: Record<string, PresetConfig> = {
  default: {
    accentColor: '#F5A623',
    accentColorSecondary: '#FF5A1F',
    shadowColor: '#F5A623',
    surfaceOpacity: 0.06,
    glassEnabled: true,
    glassBlur: 12,
    tabStyle: 'pill',
    tabIndicatorColor: 'accent',
    buttonGlow: true,
    buttonGradient: true,
    buttonRippleEffect: true,
    buttonBorderGlow: false,
    neonGlowEnabled: true,
    neonGlowIntensity: 0.5,
    ambientGlowEnabled: true,
    spotlightOnCards: false,
    animationSpeed: 1,
    animationEasing: 'spring',
    navbarStyle: 'glass',
    shadowIntensity: 0.5,
    animations: {
      pageTransitions: true,
      dropdownOpen: true,
      dropdownStyle: 'spring',
      cardHover: true,
      cardHoverStyle: 'lift',
      buttonPress: true,
      shimmerLoading: true,
      staggerChildren: true,
      sidebarTransitions: true,
      progressBar: 'shimmer',
      uploadPulse: true,
      toastAnimations: true,
      fadeInSection: true,
    },
  },

  cyberpunk: {
    accentColor: '#00F0FF',
    accentColorSecondary: '#FF00E5',
    shadowColor: '#00F0FF',
    surfaceOpacity: 0.08,
    glassEnabled: true,
    glassBlur: 14,
    tabStyle: 'glass',
    tabIndicatorColor: 'gradient',
    buttonGlow: true,
    buttonGradient: true,
    buttonRippleEffect: true,
    buttonBorderGlow: true,
    neonGlowEnabled: true,
    neonGlowIntensity: 0.9,
    ambientGlowEnabled: true,
    spotlightOnCards: true,
    animationSpeed: 0.8,
    animationEasing: 'snappy',
    navbarStyle: 'glass',
    shadowIntensity: 0.8,
    animations: {
      pageTransitions: true,
      dropdownOpen: true,
      dropdownStyle: 'scale',
      cardHover: true,
      cardHoverStyle: 'tilt',
      buttonPress: true,
      shimmerLoading: true,
      staggerChildren: true,
      sidebarTransitions: true,
      progressBar: 'neon',
      uploadPulse: true,
      toastAnimations: true,
      fadeInSection: true,
    },
  },

  minimalist: {
    accentColor: '#64748B',
    accentColorSecondary: '#94A3B8',
    shadowColor: '#64748B',
    surfaceOpacity: 0.03,
    glassEnabled: false,
    glassBlur: 4,
    tabStyle: 'minimal',
    tabIndicatorColor: 'accent',
    buttonGlow: false,
    buttonGradient: false,
    buttonRippleEffect: false,
    buttonBorderGlow: false,
    neonGlowEnabled: false,
    neonGlowIntensity: 0,
    ambientGlowEnabled: false,
    spotlightOnCards: false,
    animationSpeed: 1.5,
    animationEasing: 'smooth',
    navbarStyle: 'solid',
    shadowIntensity: 0.15,
    animations: {
      pageTransitions: true,
      dropdownOpen: true,
      dropdownStyle: 'fade',
      cardHover: false,
      cardHoverStyle: 'none',
      buttonPress: false,
      shimmerLoading: false,
      staggerChildren: false,
      sidebarTransitions: true,
      progressBar: 'default',
      uploadPulse: false,
      toastAnimations: true,
      fadeInSection: false,
    },
  },

  neon: {
    accentColor: '#A855F7',
    accentColorSecondary: '#EC4899',
    shadowColor: '#A855F7',
    surfaceOpacity: 0.1,
    glassEnabled: true,
    glassBlur: 16,
    tabStyle: 'glass',
    tabIndicatorColor: 'gradient',
    buttonGlow: true,
    buttonGradient: true,
    buttonRippleEffect: true,
    buttonBorderGlow: true,
    neonGlowEnabled: true,
    neonGlowIntensity: 1,
    ambientGlowEnabled: true,
    spotlightOnCards: true,
    animationSpeed: 1,
    animationEasing: 'spring',
    navbarStyle: 'glass',
    shadowIntensity: 0.9,
    animations: {
      pageTransitions: true,
      dropdownOpen: true,
      dropdownStyle: 'flip',
      cardHover: true,
      cardHoverStyle: 'glow',
      buttonPress: true,
      shimmerLoading: true,
      staggerChildren: true,
      sidebarTransitions: true,
      progressBar: 'neon',
      uploadPulse: true,
      toastAnimations: true,
      fadeInSection: true,
    },
  },

  warm: {
    accentColor: '#F97316',
    accentColorSecondary: '#EF4444',
    shadowColor: '#F97316',
    surfaceOpacity: 0.07,
    glassEnabled: true,
    glassBlur: 10,
    tabStyle: 'rounded',
    tabIndicatorColor: 'accent',
    buttonGlow: true,
    buttonGradient: true,
    buttonRippleEffect: true,
    buttonBorderGlow: false,
    neonGlowEnabled: false,
    neonGlowIntensity: 0.3,
    ambientGlowEnabled: true,
    spotlightOnCards: false,
    animationSpeed: 1.1,
    animationEasing: 'smooth',
    density: 'comfortable',
    navbarStyle: 'solid',
    shadowIntensity: 0.4,
    animations: {
      pageTransitions: true,
      dropdownOpen: true,
      dropdownStyle: 'slide',
      cardHover: true,
      cardHoverStyle: 'lift',
      buttonPress: true,
      shimmerLoading: true,
      staggerChildren: true,
      sidebarTransitions: true,
      progressBar: 'gradient',
      uploadPulse: true,
      toastAnimations: true,
      fadeInSection: true,
    },
  },

  frost: {
    accentColor: '#38BDF8',
    accentColorSecondary: '#818CF8',
    shadowColor: '#38BDF8',
    surfaceOpacity: 0.05,
    glassEnabled: true,
    glassBlur: 20,
    glassBorderOpacity: 0.15,
    glassBackgroundOpacity: 0.12,
    tabStyle: 'glass',
    tabIndicatorColor: 'white',
    buttonGlow: true,
    buttonGradient: true,
    buttonRippleEffect: true,
    buttonBorderGlow: false,
    neonGlowEnabled: true,
    neonGlowIntensity: 0.4,
    ambientGlowEnabled: true,
    spotlightOnCards: true,
    animationSpeed: 1.2,
    animationEasing: 'smooth',
    navbarStyle: 'glass',
    shadowIntensity: 0.3,
    animations: {
      pageTransitions: true,
      dropdownOpen: true,
      dropdownStyle: 'spring',
      cardHover: true,
      cardHoverStyle: 'lift',
      buttonPress: true,
      shimmerLoading: true,
      staggerChildren: true,
      sidebarTransitions: true,
      progressBar: 'gradient',
      uploadPulse: true,
      toastAnimations: true,
      fadeInSection: true,
    },
  },

  // ── Premium presets ──────────────────────────────────────────────────────
  aurora: {
    accentColor: '#22D3EE',
    accentColorSecondary: '#A78BFA',
    shadowColor: '#22D3EE',
    surfaceOpacity: 0.07,
    glassEnabled: true,
    glassBlur: 18,
    glassBorderOpacity: 0.16,
    glassBackgroundOpacity: 0.1,
    tabStyle: 'glass',
    tabIndicatorColor: 'gradient',
    buttonGlow: true,
    buttonGradient: true,
    buttonRippleEffect: true,
    buttonBorderGlow: true,
    neonGlowEnabled: true,
    neonGlowIntensity: 0.7,
    ambientGlowEnabled: true,
    spotlightOnCards: true,
    animationSpeed: 1.1,
    animationEasing: 'smooth',
    navbarStyle: 'glass',
    shadowIntensity: 0.6,
    appBackgroundEnabled: true,
    appBackgroundType: 'gradient',
    appBackground: 'radial-gradient(1100px 700px at 12% 8%, rgba(34,211,238,0.22), transparent), radial-gradient(900px 600px at 88% 92%, rgba(167,139,250,0.20), transparent), linear-gradient(160deg, #04121a, #0a0f1f)',
    animations: {
      pageTransitions: true,
      dropdownOpen: true,
      dropdownStyle: 'scale',
      cardHover: true,
      cardHoverStyle: 'glow',
      buttonPress: true,
      shimmerLoading: true,
      staggerChildren: true,
      sidebarTransitions: true,
      progressBar: 'gradient',
      uploadPulse: true,
      toastAnimations: true,
      fadeInSection: true,
    },
  },

  sunset: {
    accentColor: '#FB7185',
    accentColorSecondary: '#F59E0B',
    shadowColor: '#FB7185',
    surfaceOpacity: 0.08,
    glassEnabled: true,
    glassBlur: 14,
    glassBorderOpacity: 0.16,
    glassBackgroundOpacity: 0.1,
    tabStyle: 'pill',
    tabIndicatorColor: 'gradient',
    buttonGlow: true,
    buttonGradient: true,
    buttonRippleEffect: true,
    buttonBorderGlow: false,
    neonGlowEnabled: true,
    neonGlowIntensity: 0.65,
    ambientGlowEnabled: true,
    spotlightOnCards: false,
    animationSpeed: 1,
    animationEasing: 'dramatic',
    navbarStyle: 'solid',
    shadowIntensity: 0.55,
    appBackgroundEnabled: true,
    appBackgroundType: 'gradient',
    appBackground: 'radial-gradient(1000px 700px at 10% 0%, rgba(251,113,133,0.25), transparent), radial-gradient(900px 700px at 90% 100%, rgba(245,158,11,0.22), transparent), linear-gradient(180deg, #1a0e12, #120a10)',
    animations: {
      pageTransitions: true,
      dropdownOpen: true,
      dropdownStyle: 'spring',
      cardHover: true,
      cardHoverStyle: 'lift',
      buttonPress: true,
      shimmerLoading: true,
      staggerChildren: true,
      sidebarTransitions: true,
      progressBar: 'shimmer',
      uploadPulse: true,
      toastAnimations: true,
      fadeInSection: true,
    },
  },

  ocean: {
    accentColor: '#0EA5E9',
    accentColorSecondary: '#14B8A6',
    shadowColor: '#0EA5E9',
    surfaceOpacity: 0.06,
    glassEnabled: true,
    glassBlur: 16,
    glassBorderOpacity: 0.14,
    glassBackgroundOpacity: 0.09,
    tabStyle: 'rounded',
    tabIndicatorColor: 'accent',
    buttonGlow: true,
    buttonGradient: true,
    buttonRippleEffect: true,
    buttonBorderGlow: false,
    neonGlowEnabled: true,
    neonGlowIntensity: 0.5,
    ambientGlowEnabled: true,
    spotlightOnCards: false,
    animationSpeed: 0.9,
    animationEasing: 'smooth',
    navbarStyle: 'glass',
    shadowIntensity: 0.45,
    appBackgroundEnabled: true,
    appBackgroundType: 'gradient',
    appBackground: 'radial-gradient(1200px 800px at 20% 100%, rgba(14,165,233,0.22), transparent), radial-gradient(800px 600px at 90% 10%, rgba(20,184,166,0.18), transparent), linear-gradient(200deg, #04141a, #061018)',
    animations: {
      pageTransitions: true,
      dropdownOpen: true,
      dropdownStyle: 'slide',
      cardHover: true,
      cardHoverStyle: 'lift',
      buttonPress: true,
      shimmerLoading: true,
      staggerChildren: true,
      sidebarTransitions: true,
      progressBar: 'gradient',
      uploadPulse: true,
      toastAnimations: true,
      fadeInSection: true,
    },
  },

  midnight: {
    accentColor: '#818CF8',
    accentColorSecondary: '#6366F1',
    shadowColor: '#6366F1',
    surfaceOpacity: 0.05,
    glassEnabled: true,
    glassBlur: 20,
    glassBorderOpacity: 0.12,
    glassBackgroundOpacity: 0.07,
    tabStyle: 'glass',
    tabIndicatorColor: 'white',
    buttonGlow: true,
    buttonGradient: true,
    buttonRippleEffect: true,
    buttonBorderGlow: true,
    neonGlowEnabled: true,
    neonGlowIntensity: 0.6,
    ambientGlowEnabled: true,
    spotlightOnCards: true,
    animationSpeed: 1.2,
    animationEasing: 'spring',
    navbarStyle: 'glass',
    shadowIntensity: 0.5,
    appBackgroundEnabled: true,
    appBackgroundType: 'solid',
    appBackground: '#070912',
    animations: {
      pageTransitions: true,
      dropdownOpen: true,
      dropdownStyle: 'flip',
      cardHover: true,
      cardHoverStyle: 'glow',
      buttonPress: true,
      shimmerLoading: true,
      staggerChildren: true,
      sidebarTransitions: true,
      progressBar: 'neon',
      uploadPulse: true,
      toastAnimations: true,
      fadeInSection: true,
    },
  },

  emerald: {
    accentColor: '#34D399',
    accentColorSecondary: '#10B981',
    shadowColor: '#34D399',
    surfaceOpacity: 0.06,
    glassEnabled: true,
    glassBlur: 14,
    glassBorderOpacity: 0.14,
    glassBackgroundOpacity: 0.08,
    tabStyle: 'pill',
    tabIndicatorColor: 'accent',
    buttonGlow: true,
    buttonGradient: true,
    buttonRippleEffect: true,
    buttonBorderGlow: false,
    neonGlowEnabled: true,
    neonGlowIntensity: 0.55,
    ambientGlowEnabled: true,
    spotlightOnCards: false,
    animationSpeed: 1,
    animationEasing: 'smooth',
    navbarStyle: 'glass',
    shadowIntensity: 0.45,
    appBackgroundEnabled: true,
    appBackgroundType: 'gradient',
    appBackground: 'radial-gradient(1000px 700px at 15% 5%, rgba(52,211,153,0.20), transparent), radial-gradient(900px 700px at 85% 95%, rgba(16,185,129,0.18), transparent), linear-gradient(180deg, #04130d, #07120c)',
    animations: {
      pageTransitions: true,
      dropdownOpen: true,
      dropdownStyle: 'spring',
      cardHover: true,
      cardHoverStyle: 'border',
      buttonPress: true,
      shimmerLoading: true,
      staggerChildren: true,
      sidebarTransitions: true,
      progressBar: 'gradient',
      uploadPulse: true,
      toastAnimations: true,
      fadeInSection: true,
    },
  },
};

// ─── Store Interface ─────────────────────────────────────────────────────────

interface ThemeStore extends ThemeConfig {
  applyPreset: (presetName: string) => void;
  reset: () => void;
  updateSetting: <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) => void;
  updateAnimation: <K extends AnimationKey>(key: K, value: ThemeConfig['animations'][K]) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Applies the current animation speed multiplier to a base duration.
 * For example, with speed 0.5 → returns ms * 0.5 (faster).
 * With speed 2 → returns ms * 2 (slower).
 */
export function getAnimationDuration(ms: number): number {
  const speed = useThemeStore.getState().animationSpeed;
  return ms * speed;
}

/**
 * Returns a framer-motion compatible easing config based on the theme setting.
 */
export function getEasing(easing?: string): Easing {
  const resolved = easing ?? useThemeStore.getState().animationEasing;

  switch (resolved) {
    case 'spring':
      return [0.43, 0.13, 0.23, 0.96] as Easing;
    case 'smooth':
      return [0.4, 0, 0.2, 1] as Easing; // easeInOut
    case 'snappy':
      return [0.68, -0.55, 0.265, 1.55] as Easing; // back out
    case 'dramatic':
      return [0.87, 0, 0.13, 1] as Easing; // easeInOutQuart
    default:
      return [0.43, 0.13, 0.23, 0.96] as Easing;
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────

/**
 * Deep-clones the default config so each call gets a fresh object.
 * Ensures animation sub-object is never shared by reference.
 */
function cloneDefaults(): ThemeConfig {
  return {
    ...DEFAULT_THEME_CONFIG,
    animations: { ...DEFAULT_THEME_CONFIG.animations },
  };
}

/**
 * Merges a partial preset into a fresh default config.
 * Handles the nested `animations` object correctly.
 */
function mergePreset(preset: PresetConfig): ThemeConfig {
  const base = cloneDefaults();
  const { animations, ...rest } = preset;

  return {
    ...base,
    ...rest,
    // Merge animations deeply so unspecified keys fall back to defaults
    animations: {
      ...base.animations,
      ...animations,
    },
  };
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      ...cloneDefaults(),

      applyPreset: (presetName: string) => {
        const preset = presets[presetName];
        if (!preset) {
          console.warn(`[useThemeStore] Unknown preset: "${presetName}"`);
          return;
        }
        set(mergePreset(preset));
      },

      reset: () => {
        set(cloneDefaults());
      },

      updateSetting: (key, value) => {
        set({ [key]: value } as Partial<ThemeConfig>);
      },

      updateAnimation: (key, value) => {
        set((state) => ({
          animations: {
            ...state.animations,
            [key]: value,
          },
        }));
      },
    }),
    {
      name: 'ai-studio-theme',
      storage: createJSONStorage(() => localStorage),
      // Only persist the ThemeConfig fields, not the actions
      partialize: (state) => {
         
        const { applyPreset, reset, updateSetting, updateAnimation, ...config } = state;
        return config;
      },
      // Merge persisted values on top of defaults so new fields auto-initialize
      merge: (persisted, current) => {
        const defaults = cloneDefaults();
        const p = persisted as Partial<ThemeConfig>;
        return {
          ...defaults,
          ...current,
          ...p,
          animations: {
            ...defaults.animations,
            ...(p?.animations ?? {}),
          },
        } as ThemeStore;
      },
    },
  ),
);

// Apply theme values to CSS custom properties on :root
// This runs whenever the store state changes
export function ThemeEffect() {
  React.useEffect(() => {
    const applyThemeToCSS = (state: ThemeStore) => {
      const root = document.documentElement;
      root.style.setProperty('--ws-accent', state.accentColor);
      root.style.setProperty('--ws-accent-secondary', state.accentColorSecondary);
      root.style.setProperty('--ws-bg', state.workspaceBackground);
      root.style.setProperty('--ws-panel', state.workspacePanel);
      root.style.setProperty('--ws-viewport', state.workspaceViewport);
      root.style.setProperty('--ws-text', state.workspaceText);
      root.style.setProperty('--ws-text-muted', state.workspaceTextMuted);
      root.style.setProperty('--ws-border', state.workspaceBorder);
      root.style.setProperty('--ws-active-bg', state.workspaceActiveBg);
      root.style.setProperty('--ws-hover-bg', state.workspaceHoverBg);
      root.style.setProperty('--ws-tab-active-bg', state.workspaceTabActiveBg);
      root.style.setProperty('--ws-tab-bar-bg', state.workspaceTabBarBg);
      root.style.setProperty('--ws-nav-bg', state.workspaceNavBg);
      root.style.setProperty('--ws-dropdown-bg', state.workspaceDropdownBg);
      root.style.setProperty('--ws-hud-bg', state.workspaceHudBg);
      root.style.setProperty('--ws-hud-border', state.workspaceHudBorder);
      root.style.setProperty('--ws-surface-opacity', String(state.surfaceOpacity));
      root.style.setProperty('--ws-border-radius', state.borderRadius);
    };

    // Apply initial theme
    applyThemeToCSS(useThemeStore.getState());

    // Subscribe to changes
    const unsubscribe = useThemeStore.subscribe(applyThemeToCSS);

    return unsubscribe;
  }, []);

  return null;
}
