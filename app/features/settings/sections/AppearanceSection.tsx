'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ShimmerButton } from '@/components/motion/ShimmerButton';
import { useThemeStore, DEFAULT_THEME_CONFIG } from '@/stores/useThemeStore';
import { applyGlobalTheme } from '@/components/AppearanceProvider';
import { useAutoSave } from '@/hooks/useAutoSave';
import {
  Palette,
  GlassWater,
  MousePointerClick,
  LayoutGrid,
  Lightbulb,
  Wand2,
  Ruler,
  SwatchBook,
  RotateCcw,
  Check,
  Download,
  Upload,
  Moon,
  Sun,
  Monitor,
  Plus,
  Sparkles,
  Zap,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThemeConfig } from '@/stores/useThemeStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT_COLORS = [
  { name: 'Amber', value: '#F5A623' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#FF5A1F' },
];

const TAB_OPTIONS = [
  { id: 'colors', label: 'Colors', icon: Palette },
  { id: 'glass', label: 'Glass', icon: GlassWater },
  { id: 'buttons', label: 'Buttons', icon: MousePointerClick },
  { id: 'tabs', label: 'Tabs', icon: LayoutGrid },
  { id: 'lighting', label: 'Lighting', icon: Lightbulb },
  { id: 'animations', label: 'Animations', icon: Wand2 },
  { id: 'density', label: 'Density', icon: Ruler },
  { id: 'presets', label: 'Presets', icon: SwatchBook },
] as const;

type TabId = (typeof TAB_OPTIONS)[number]['id'];

const PRESET_CARDS = [
  {
    key: 'default',
    name: 'Default',
    description: 'Balanced amber tones with subtle glass effects and smooth animations.',
    accentColor: '#F5A623',
    secondaryColor: '#FF5A1F',
    glass: true,
  },
  {
    key: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'High-contrast cyan and magenta with intense neon glows and snappy motion.',
    accentColor: '#00F0FF',
    secondaryColor: '#FF00E5',
    glass: true,
  },
  {
    key: 'minimalist',
    name: 'Minimalist',
    description: 'Muted slate palette with no effects. Clean, fast, distraction-free.',
    accentColor: '#64748B',
    secondaryColor: '#94A3B8',
    glass: false,
  },
  {
    key: 'neon',
    name: 'Neon',
    description: 'Purple and pink neon with full glow effects, glass, and dramatic motion.',
    accentColor: '#A855F7',
    secondaryColor: '#EC4899',
    glass: true,
  },
  {
    key: 'warm',
    name: 'Warm',
    description: 'Orange and red warmth with comfortable density and smooth easing.',
    accentColor: '#F97316',
    secondaryColor: '#EF4444',
    glass: true,
  },
  {
    key: 'frost',
    name: 'Frost',
    description: 'Cool blue and indigo tones with heavy frosted glass and gentle motion.',
    accentColor: '#38BDF8',
    secondaryColor: '#818CF8',
    glass: true,
  },
];

const EASING_OPTIONS = ['spring', 'smooth', 'snappy', 'dramatic'] as const;
const DROPDOWN_STYLES = ['spring', 'fade', 'slide', 'scale', 'flip'] as const;
const HOVER_STYLES = ['lift', 'glow', 'border', 'tilt', 'none'] as const;
const PROGRESS_STYLES = ['default', 'shimmer', 'gradient', 'neon'] as const;

// ─── Helper: Button Group ─────────────────────────────────────────────────────

function ButtonGroup<T extends string>({
  options,
  value,
  onChange,
  renderLabel,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  renderLabel?: (v: T) => string;
}) {
  return (
    <div className="flex gap-2 w-full">
      {options.map((opt) => {
        const isActive = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={cn(
              'flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all duration-200',
              isActive
                ? 'border-primary/50 text-primary'
                : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
            )}
            style={
              isActive
                ? {
                    backgroundColor: `color-mix(in srgb, var(--primary) 15%, transparent)`,
                    boxShadow: `0 0 12px color-mix(in srgb, var(--primary) 20%, transparent)`,
                  }
                : {}
            }
          >
            {renderLabel ? renderLabel(opt) : opt.charAt(0).toUpperCase() + opt.slice(1)}
          </button>
        );
      })}
    </div>
  );
}

// ─── Helper: Setting Row ──────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// ─── Helper: Section Label ────────────────────────────────────────────────────

function SectionLabel({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

// ─── Helper: Color Swatch Grid ────────────────────────────────────────────────

function ColorSwatchGrid({
  colors,
  selected,
  onSelect,
  onCustom,
}: {
  colors: typeof ACCENT_COLORS;
  selected: string;
  onSelect: (c: string) => void;
  onCustom: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {colors.map((c) => (
        <button
          key={c.value}
          onClick={() => onSelect(c.value)}
          title={c.name}
          className={cn(
            'relative h-10 w-10 rounded-xl transition-all duration-200 hover:scale-110',
            selected === c.value
              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110'
              : 'ring-1 ring-white/10 hover:ring-white/30'
          )}
          style={{ backgroundColor: c.value }}
        >
          {selected === c.value && (
            <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow-md" />
          )}
        </button>
      ))}
      <div className="relative h-10 w-10 rounded-xl overflow-hidden ring-1 ring-white/10 hover:ring-white/30 transition-all hover:scale-110">
        <input
          type="color"
          value={selected}
          onChange={(e) => onCustom(e.target.value)}
          className="absolute inset-[-8px] w-[calc(100%+16px)] h-[calc(100%+16px)] cursor-pointer"
        />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/30 text-white">
          <Plus className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AppearanceSection() {
  const [activeTab, setActiveTab] = useState<TabId>('colors');

  // Pull the full store state & actions
  const store = useThemeStore();
  const { updateSetting, updateAnimation, applyPreset, reset: resetStore } = store;

  // Build a stable snapshot string for auto-save (exclude actions)
  const configJson = useMemo(() => {
    const { applyPreset: _, reset: __, updateSetting: ___, updateAnimation: ____, ...cfg } = store as any;
    return JSON.stringify(cfg);
  }, [
    store.accentColor,
    store.accentColorSecondary,
    store.surfaceOpacity,
    store.glassEnabled,
    store.glassBlur,
    store.glassBorderOpacity,
    store.glassBackgroundOpacity,
    store.tabStyle,
    store.tabIndicatorColor,
    store.buttonGlow,
    store.buttonGradient,
    store.buttonRippleEffect,
    store.buttonBorderGlow,
    store.neonGlowEnabled,
    store.neonGlowIntensity,
    store.ambientGlowEnabled,
    store.spotlightOnCards,
    store.animationSpeed,
    store.animationEasing,
    store.animations,
    store.fontSize,
    store.density,
    store.theme,
    store.navbarStyle,
    store.borderRadius,
    store.borderRadiusSm,
    store.borderRadiusLg,
    store.shadowIntensity,
    store.shadowColor,
  ]);

  // Save appearance_settings for AppearanceProvider
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('appearance_settings', configJson);
    }
  }, [configJson]);

  const { Indicator } = useAutoSave(configJson, async () => {}, 300, true);

  // Apply global theme CSS variables when store changes
  useEffect(() => {
    const { applyPreset: _, reset: __, updateSetting: ___, updateAnimation: ____, ...cfg } = store as any;
    applyGlobalTheme(cfg);
  }, [
    store.accentColor,
    store.borderRadius,
    store.navbarStyle,
  ]);

  // Apply dark/light/system class
  useEffect(() => {
    const html = document.documentElement;
    if (store.theme === 'dark') {
      html.classList.add('dark');
    } else if (store.theme === 'light') {
      html.classList.remove('dark');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
    }
  }, [store.theme]);

  // Apply font size
  useEffect(() => {
    const html = document.documentElement;
    const size = store.fontSize === 'sm' ? '14px' : store.fontSize === 'lg' ? '18px' : '16px';
    html.style.fontSize = size;
  }, [store.fontSize]);

  // Apply density
  useEffect(() => {
    document.documentElement.dataset.density = store.density;
  }, [store.density]);

  // ── Quick apply preset (header buttons) ────────────────────────
  const quickPresets = ['default', 'cyberpunk', 'minimalist', 'neon', 'warm', 'frost'] as const;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="min-h-full w-full">
      <Indicator />

      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6 pb-6 border-b border-border/40">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Sparkles className="w-7 h-7 text-primary" />
              Theme Manager
            </h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Full control over every visual aspect of the app. Every change applies instantly.
            </p>
          </div>
          <ShimmerButton
            variant="outline"
            size="sm"
            shimmer={false}
            onClick={() => resetStore()}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Default
          </ShimmerButton>
        </div>

        {/* Quick preset pills */}
        <div className="flex flex-wrap gap-2">
          {quickPresets.map((p) => (
            <ShimmerButton
              key={p}
              variant="outline"
              size="sm"
              shimmer={false}
              className="text-xs"
              onClick={() => applyPreset(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </ShimmerButton>
          ))}
        </div>
      </div>

      {/* ─── Tab Navigation ──────────────────────────────────────── */}
      <div className="mt-6 flex gap-1 overflow-x-auto pb-2 scrollbar-none -mb-px">
        {TAB_OPTIONS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors duration-200',
                isActive
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="theme-tab-indicator"
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--primary)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Tab Content ─────────────────────────────────────────── */}
      <div className="mt-6 pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            {activeTab === 'colors' && <ColorsTab />}
            {activeTab === 'glass' && <GlassTab />}
            {activeTab === 'buttons' && <ButtonsTab />}
            {activeTab === 'tabs' && <TabsTab />}
            {activeTab === 'lighting' && <LightingTab />}
            {activeTab === 'animations' && <AnimationsTab />}
            {activeTab === 'density' && <DensityTab />}
            {activeTab === 'presets' && <PresetsTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: COLORS
// ═══════════════════════════════════════════════════════════════════════════════

function ColorsTab() {
  const { accentColor, accentColorSecondary, surfaceOpacity, theme, updateSetting } = useThemeStore();

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Palette className="w-5 h-5 text-primary" />
          Colors
        </CardTitle>
        <CardDescription>Control the accent colors, surface opacity, and theme mode.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Accent Color */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Accent Color</span>
            <span className="text-xs text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">{accentColor}</span>
          </div>
          <ColorSwatchGrid
            colors={ACCENT_COLORS}
            selected={accentColor}
            onSelect={(c) => updateSetting('accentColor', c)}
            onCustom={(c) => updateSetting('accentColor', c)}
          />
        </div>

        {/* Secondary Accent */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Secondary Accent Color</span>
            <span className="text-xs text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">{accentColorSecondary}</span>
          </div>
          <ColorSwatchGrid
            colors={ACCENT_COLORS}
            selected={accentColorSecondary}
            onSelect={(c) => updateSetting('accentColorSecondary', c)}
            onCustom={(c) => updateSetting('accentColorSecondary', c)}
          />
        </div>

        {/* Surface Opacity */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Surface Opacity</span>
            <span className="text-xs text-muted-foreground font-mono">{Math.round(surfaceOpacity * 100)}%</span>
          </div>
          <Slider
            value={[surfaceOpacity * 100]}
            onValueChange={([v]) => updateSetting('surfaceOpacity', v / 100)}
            min={0}
            max={100}
            step={1}
            className="w-full"
          />
        </div>

        {/* Theme Mode */}
        <div className="space-y-3">
          <span className="text-sm font-medium">Theme Mode</span>
          <div className="flex gap-2">
            {(
              [
                { val: 'dark', label: 'Dark', icon: Moon },
                { val: 'light', label: 'Light', icon: Sun },
                { val: 'system', label: 'System', icon: Monitor },
              ] as const
            ).map(({ val, label, icon: Icon }) => (
              <button
                key={val}
                onClick={() => updateSetting('theme', val)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg border transition-all duration-200',
                  theme === val
                    ? 'border-primary/50 text-primary'
                    : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                )}
                style={
                  theme === val
                    ? {
                        backgroundColor: `color-mix(in srgb, var(--primary) 15%, transparent)`,
                      }
                    : {}
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Live Preview */}
        <div className="space-y-3">
          <span className="text-sm font-medium text-muted-foreground">Live Preview</span>
          <div
            className="relative rounded-xl p-5 overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${accentColor}22, ${accentColorSecondary}22)`,
              border: `1px solid ${accentColor}33`,
            }}
          >
            <div className="space-y-3 relative z-10">
              <div className="flex gap-2">
                <div
                  className="h-8 px-4 rounded-lg flex items-center text-xs font-medium text-white"
                  style={{
                    background: `linear-gradient(135deg, ${accentColor}, ${accentColorSecondary})`,
                    boxShadow: `0 0 16px ${accentColor}44`,
                  }}
                >
                  Primary Button
                </div>
                <div
                  className="h-8 px-4 rounded-lg flex items-center text-xs font-medium border"
                  style={{ borderColor: `${accentColor}44`, color: accentColor }}
                >
                  Secondary
                </div>
              </div>
              <div
                className="h-2 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${accentColor}, ${accentColorSecondary})`,
                  opacity: 0.7,
                }}
              />
              <div className="flex gap-2">
                {[accentColor, accentColorSecondary, accentColor + '88', accentColorSecondary + '88'].map(
                  (c, i) => (
                    <div key={i} className="h-8 flex-1 rounded-lg" style={{ backgroundColor: c }} />
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: GLASS EFFECTS
// ═══════════════════════════════════════════════════════════════════════════════

function GlassTab() {
  const { glassEnabled, glassBlur, glassBorderOpacity, glassBackgroundOpacity, accentColor, accentColorSecondary, updateSetting } =
    useThemeStore();

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <GlassWater className="w-5 h-5 text-primary" />
          Glass Effects
        </CardTitle>
        <CardDescription>Frosted glass-morphism effects on cards, panels, and surfaces.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <SettingRow label="Glass Enabled" description="Enable frosted glass backgrounds on UI surfaces">
          <Switch checked={glassEnabled} onCheckedChange={(v) => updateSetting('glassEnabled', v)} />
        </SettingRow>

        <div className="border-t border-border/30" />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Blur Intensity</span>
            <span className="text-xs text-muted-foreground font-mono">{glassBlur}px</span>
          </div>
          <Slider
            value={[glassBlur]}
            onValueChange={([v]) => updateSetting('glassBlur', v)}
            min={4}
            max={24}
            step={1}
            disabled={!glassEnabled}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Border Opacity</span>
            <span className="text-xs text-muted-foreground font-mono">{Math.round(glassBorderOpacity * 100)}%</span>
          </div>
          <Slider
            value={[glassBorderOpacity * 100]}
            onValueChange={([v]) => updateSetting('glassBorderOpacity', v / 100)}
            min={0}
            max={100}
            step={1}
            disabled={!glassEnabled}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Background Opacity</span>
            <span className="text-xs text-muted-foreground font-mono">{Math.round(glassBackgroundOpacity * 100)}%</span>
          </div>
          <Slider
            value={[glassBackgroundOpacity * 100]}
            onValueChange={([v]) => updateSetting('glassBackgroundOpacity', v / 100)}
            min={0}
            max={30}
            step={1}
            disabled={!glassEnabled}
          />
        </div>

        {/* Live Preview */}
        <div className="border-t border-border/30 pt-4">
          <span className="text-sm font-medium text-muted-foreground">Live Preview</span>
          <div className="mt-3 relative rounded-xl p-1 overflow-hidden">
            {/* Colorful background behind the glass card */}
            <div
              className="absolute inset-0"
              style={{
                background: `conic-gradient(from 45deg, ${accentColor}, ${accentColorSecondary}, #a855f7, ${accentColor}, ${accentColorSecondary})`,
                filter: 'blur(2px)',
              }}
            />
            <div
              className={cn('relative rounded-lg p-5 transition-all duration-300', !glassEnabled && 'opacity-50')}
              style={{
                backdropFilter: glassEnabled ? `blur(${glassBlur}px)` : 'none',
                WebkitBackdropFilter: glassEnabled ? `blur(${glassBlur}px)` : 'none',
                backgroundColor: glassEnabled
                  ? `rgba(255, 255, 255, ${glassBackgroundOpacity})`
                  : 'rgba(30, 30, 30, 0.9)',
                border: `1px solid rgba(255, 255, 255, ${glassBorderOpacity})`,
              }}
            >
              <div className="text-sm font-medium text-white">Glass Card Preview</div>
              <div className="text-xs text-white/60 mt-1">
                Blur: {glassBlur}px &middot; Border: {Math.round(glassBorderOpacity * 100)}% &middot; BG:{' '}
                {Math.round(glassBackgroundOpacity * 100)}%
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: BUTTONS
// ═══════════════════════════════════════════════════════════════════════════════

function ButtonsTab() {
  const { buttonGlow, buttonGradient, buttonRippleEffect, buttonBorderGlow, accentColor, accentColorSecondary, borderRadius, updateSetting } =
    useThemeStore();

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MousePointerClick className="w-5 h-5 text-primary" />
          Button Effects
        </CardTitle>
        <CardDescription>Control glow, gradient, ripple, and border effects on buttons.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <SettingRow label="Button Glow" description="Adds a subtle glow around buttons on hover">
          <Switch checked={buttonGlow} onCheckedChange={(v) => updateSetting('buttonGlow', v)} />
        </SettingRow>

        <div className="border-t border-border/30" />

        <SettingRow label="Button Gradient" description="Use a gradient background for primary buttons">
          <Switch checked={buttonGradient} onCheckedChange={(v) => updateSetting('buttonGradient', v)} />
        </SettingRow>

        <div className="border-t border-border/30" />

        <SettingRow label="Button Ripple Effect" description="Material-design ripple on click">
          <Switch checked={buttonRippleEffect} onCheckedChange={(v) => updateSetting('buttonRippleEffect', v)} />
        </SettingRow>

        <div className="border-t border-border/30" />

        <SettingRow label="Button Border Glow" description="Animated glow on button borders">
          <Switch checked={buttonBorderGlow} onCheckedChange={(v) => updateSetting('buttonBorderGlow', v)} />
        </SettingRow>

        {/* Live Preview */}
        <div className="border-t border-border/30 pt-4">
          <span className="text-sm font-medium text-muted-foreground">Live Preview</span>
          <div className="mt-3 flex flex-wrap gap-3 p-5 rounded-xl bg-muted/30 border border-border/30">
            <motion.button
              className={cn('px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-all relative overflow-hidden')}
              style={{
                backgroundColor: buttonGradient ? 'transparent' : accentColor,
                backgroundImage: buttonGradient ? `linear-gradient(135deg, ${accentColor}, ${accentColorSecondary})` : undefined,
                borderRadius,
                boxShadow: buttonGlow ? `0 0 20px ${accentColor}44` : 'none',
                border: buttonBorderGlow ? `1px solid ${accentColor}66` : 'none',
              }}
              whileHover={{ scale: 1.04, boxShadow: buttonGlow ? `0 0 28px ${accentColor}66` : 'none' }}
              whileTap={{ scale: 0.97 }}
            >
              Primary
            </motion.button>

            <motion.button
              className="px-5 py-2.5 text-sm font-medium rounded-lg transition-all"
              style={{
                backgroundColor: `${accentColor}20`,
                color: accentColor,
                borderRadius,
                boxShadow: buttonGlow ? `0 0 16px ${accentColor}22` : 'none',
              }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              Secondary
            </motion.button>

            <motion.button
              className="px-5 py-2.5 text-sm font-medium rounded-lg transition-all"
              style={{
                backgroundColor: 'transparent',
                border: `1.5px solid ${accentColor}55`,
                color: accentColor,
                borderRadius,
                boxShadow: buttonBorderGlow ? `0 0 12px ${accentColor}33` : 'none',
              }}
              whileHover={{ scale: 1.04, borderColor: accentColor }}
              whileTap={{ scale: 0.97 }}
            >
              Outline
            </motion.button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4: TABS
// ═══════════════════════════════════════════════════════════════════════════════

function TabsTab() {
  const { tabStyle, tabIndicatorColor, accentColor, accentColorSecondary, updateSetting } = useThemeStore();
  const [previewActive, setPreviewActive] = useState(0);

  const tabStyles: { value: typeof tabStyle; label: string }[] = [
    { value: 'pill', label: 'Pill' },
    { value: 'underline', label: 'Underline' },
    { value: 'rounded', label: 'Rounded' },
    { value: 'glass', label: 'Glass' },
    { value: 'minimal', label: 'Minimal' },
  ];

  const sampleTabs = ['Tab 1', 'Tab 2', 'Tab 3', 'Tab 4'];

  const renderPreviewTab = (label: string, idx: number) => {
    const isActive = previewActive === idx;
    const baseClasses = 'px-4 py-2 text-sm font-medium transition-all duration-200 cursor-pointer relative';

    switch (tabStyle) {
      case 'pill':
        return (
          <button
            key={label}
            onClick={() => setPreviewActive(idx)}
            className={cn(baseClasses, 'rounded-full', isActive ? 'text-white' : 'text-muted-foreground hover:text-foreground')}
            style={
              isActive
                ? {
                    backgroundColor: accentColor,
                    boxShadow: `0 0 12px ${accentColor}44`,
                  }
                : {}
            }
          >
            {label}
          </button>
        );
      case 'underline':
        return (
          <button
            key={label}
            onClick={() => setPreviewActive(idx)}
            className={cn(baseClasses, 'pb-2', isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            {label}
            {isActive && (
              <motion.div
                layoutId="preview-tab-underline"
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{
                  backgroundColor:
                    tabIndicatorColor === 'gradient'
                      ? `linear-gradient(90deg, ${accentColor}, ${accentColorSecondary})`
                      : tabIndicatorColor === 'white'
                      ? '#ffffff'
                      : accentColor,
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        );
      case 'rounded':
        return (
          <button
            key={label}
            onClick={() => setPreviewActive(idx)}
            className={cn(
              baseClasses,
              'rounded-lg',
              isActive
                ? 'text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
            style={
              isActive
                ? {
                    backgroundColor: accentColor,
                  }
                : {}
            }
          >
            {label}
          </button>
        );
      case 'glass':
        return (
          <button
            key={label}
            onClick={() => setPreviewActive(idx)}
            className={cn(
              baseClasses,
              'rounded-lg',
              isActive
                ? 'text-white'
                : 'text-muted-foreground hover:text-foreground'
            )}
            style={{
              ...(isActive
                ? {
                    backgroundColor: `${accentColor}30`,
                    backdropFilter: 'blur(12px)',
                    border: `1px solid ${accentColor}44`,
                  }
                : {
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }),
            }}
          >
            {label}
          </button>
        );
      case 'minimal':
        return (
          <button
            key={label}
            onClick={() => setPreviewActive(idx)}
            className={cn(baseClasses, isActive ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground')}
            style={isActive ? { color: accentColor } : {}}
          >
            {label}
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LayoutGrid className="w-5 h-5 text-primary" />
          Tab Styles
        </CardTitle>
        <CardDescription>Choose the visual style and indicator color for tab navigation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tab Style Selection */}
        <div className="space-y-3">
          <span className="text-sm font-medium">Tab Style</span>
          <div className="grid grid-cols-5 gap-2">
            {tabStyles.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => updateSetting('tabStyle', value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all duration-200',
                  tabStyle === value
                    ? 'border-primary/50 text-primary'
                    : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
                )}
                style={
                  tabStyle === value
                    ? { backgroundColor: `color-mix(in srgb, var(--primary) 10%, transparent)` }
                    : {}
                }
              >
                {/* Mini visual preview of tab style */}
                <div className="flex gap-0.5">
                  {value === 'pill' && (
                    <>
                      <div className="h-3 w-6 rounded-full" style={{ backgroundColor: accentColor }} />
                      <div className="h-3 w-6 rounded-full bg-muted-foreground/20" />
                      <div className="h-3 w-6 rounded-full bg-muted-foreground/20" />
                    </>
                  )}
                  {value === 'underline' && (
                    <>
                      <div className="h-3 w-6 relative">
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded" style={{ backgroundColor: accentColor }} />
                      </div>
                      <div className="h-3 w-6 bg-muted-foreground/20" />
                      <div className="h-3 w-6 bg-muted-foreground/20" />
                    </>
                  )}
                  {value === 'rounded' && (
                    <>
                      <div className="h-3 w-6 rounded" style={{ backgroundColor: accentColor }} />
                      <div className="h-3 w-6 rounded bg-muted-foreground/20" />
                      <div className="h-3 w-6 rounded bg-muted-foreground/20" />
                    </>
                  )}
                  {value === 'glass' && (
                    <>
                      <div className="h-3 w-6 rounded" style={{ backgroundColor: `${accentColor}44`, border: `0.5px solid ${accentColor}66` }} />
                      <div className="h-3 w-6 rounded" style={{ border: '0.5px solid rgba(255,255,255,0.1)' }} />
                      <div className="h-3 w-6 rounded" style={{ border: '0.5px solid rgba(255,255,255,0.1)' }} />
                    </>
                  )}
                  {value === 'minimal' && (
                    <>
                      <div className="h-3 w-6 bg-foreground" />
                      <div className="h-3 w-6 bg-muted-foreground/30" />
                      <div className="h-3 w-6 bg-muted-foreground/30" />
                    </>
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Indicator Color */}
        <div className="space-y-3">
          <span className="text-sm font-medium">Tab Indicator Color</span>
          <ButtonGroup
            options={['accent', 'white', 'gradient'] as const}
            value={tabIndicatorColor}
            onChange={(v) => updateSetting('tabIndicatorColor', v)}
            renderLabel={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
          />
        </div>

        {/* Live Preview */}
        <div className="space-y-3">
          <span className="text-sm font-medium text-muted-foreground">Live Preview</span>
          <div className="flex gap-1 p-4 rounded-xl bg-muted/20 border border-border/30">
            {sampleTabs.map((t, i) => renderPreviewTab(t, i))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 5: LIGHTING
// ═══════════════════════════════════════════════════════════════════════════════

function LightingTab() {
  const {
    neonGlowEnabled,
    neonGlowIntensity,
    ambientGlowEnabled,
    spotlightOnCards,
    accentColor,
    accentColorSecondary,
    updateSetting,
  } = useThemeStore();

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Lightbulb className="w-5 h-5 text-primary" />
          Lighting Effects
        </CardTitle>
        <CardDescription>
          Neon glows, ambient background blobs, and interactive spotlight effects.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <SettingRow label="Neon Glow" description="Add neon glow effect to active elements">
          <Switch checked={neonGlowEnabled} onCheckedChange={(v) => updateSetting('neonGlowEnabled', v)} />
        </SettingRow>

        <div className="border-t border-border/30" />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Neon Glow Intensity</span>
            <span className="text-xs text-muted-foreground font-mono">{Math.round(neonGlowIntensity * 100)}%</span>
          </div>
          <Slider
            value={[neonGlowIntensity * 100]}
            onValueChange={([v]) => updateSetting('neonGlowIntensity', v / 100)}
            min={0}
            max={100}
            step={1}
            disabled={!neonGlowEnabled}
          />
        </div>

        <div className="border-t border-border/30" />

        <SettingRow label="Ambient Glow" description="Show purple/cyan gradient blobs in the background">
          <Switch checked={ambientGlowEnabled} onCheckedChange={(v) => updateSetting('ambientGlowEnabled', v)} />
        </SettingRow>

        <div className="border-t border-border/30" />

        <SettingRow label="Spotlight on Cards" description="Mouse-following spotlight effect on card surfaces">
          <Switch checked={spotlightOnCards} onCheckedChange={(v) => updateSetting('spotlightOnCards', v)} />
        </SettingRow>

        {/* Live Preview */}
        <div className="border-t border-border/30 pt-4">
          <span className="text-sm font-medium text-muted-foreground">Live Preview</span>
          <div className="mt-3 relative rounded-xl p-5 overflow-hidden bg-muted/20 border border-border/30">
            {/* Ambient glow blobs */}
            {ambientGlowEnabled && (
              <>
                <div
                  className="absolute -top-10 -left-10 w-32 h-32 rounded-full opacity-30 blur-3xl"
                  style={{ backgroundColor: accentColorSecondary }}
                />
                <div
                  className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full opacity-20 blur-3xl"
                  style={{ backgroundColor: accentColor }}
                />
              </>
            )}
            <div
              className="relative rounded-lg p-4 border transition-all duration-300"
              style={{
                borderColor: neonGlowEnabled ? `${accentColor}${Math.round(neonGlowIntensity * 100).toString(16).padStart(2, '0')}` : 'rgba(255,255,255,0.06)',
                boxShadow: neonGlowEnabled
                  ? `0 0 ${20 + neonGlowIntensity * 30}px ${accentColor}${Math.round(neonGlowIntensity * 40).toString(16).padStart(2, '0')}`
                  : 'none',
              }}
            >
              <div className="text-sm font-medium">Sample Card</div>
              <div className="text-xs text-muted-foreground mt-1">
                {neonGlowEnabled ? `Neon glow at ${Math.round(neonGlowIntensity * 100)}%` : 'No neon glow'}
                {ambientGlowEnabled ? ' · Ambient blobs active' : ''}
                {spotlightOnCards ? ' · Spotlight enabled' : ''}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 6: ANIMATIONS
// ═══════════════════════════════════════════════════════════════════════════════

function AnimationsTab() {
  const { animationSpeed, animationEasing, animations, updateSetting, updateAnimation } = useThemeStore();

  const toggleItems: { key: keyof typeof animations; label: string; desc: string; hasSelector?: boolean; selectorOptions?: readonly string[]; selectorKey?: keyof typeof animations }[] = [
    { key: 'pageTransitions', label: 'Page Transitions', desc: 'Smooth transitions between pages' },
    {
      key: 'dropdownOpen',
      label: 'Dropdown Animations',
      desc: 'Animate dropdowns opening and closing',
      hasSelector: true,
      selectorOptions: DROPDOWN_STYLES,
      selectorKey: 'dropdownStyle',
    },
    {
      key: 'cardHover',
      label: 'Card Hover Effects',
      desc: 'Interactive hover animations on cards',
      hasSelector: true,
      selectorOptions: HOVER_STYLES,
      selectorKey: 'cardHoverStyle',
    },
    { key: 'buttonPress', label: 'Button Press Effect', desc: 'Scale-down animation on button click' },
    { key: 'shimmerLoading', label: 'Shimmer Loading', desc: 'Skeleton loading shimmer animation' },
    { key: 'staggerChildren', label: 'Stagger Children', desc: 'Sequential reveal of list items' },
    { key: 'sidebarTransitions', label: 'Sidebar Transitions', desc: 'Smooth open/close sidebar animation' },
    {
      key: 'progressBar',
      label: 'Progress Bar Style',
      desc: 'Visual style for progress indicators',
      hasSelector: true,
      selectorOptions: PROGRESS_STYLES,
      selectorKey: 'progressBar',
    },
    { key: 'uploadPulse', label: 'Upload Pulse Animation', desc: 'Pulsing effect during uploads' },
    { key: 'toastAnimations', label: 'Toast Animations', desc: 'Slide-in animation for notifications' },
    { key: 'fadeInSection', label: 'Fade-in on Scroll', desc: 'Elements fade in as you scroll' },
  ];

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wand2 className="w-5 h-5 text-primary" />
          Animations
        </CardTitle>
        <CardDescription>Fine-grained control over animation speed, easing, and per-component toggles.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Speed */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Animation Speed</span>
            <span className="text-xs text-muted-foreground font-mono">{animationSpeed.toFixed(1)}x</span>
          </div>
          <Slider
            value={[animationSpeed * 100]}
            onValueChange={([v]) => updateSetting('animationSpeed', v / 100)}
            min={50}
            max={200}
            step={10}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0.5x (Faster)</span>
            <span>1x</span>
            <span>2x (Slower)</span>
          </div>
        </div>

        {/* Easing */}
        <div className="space-y-3">
          <span className="text-sm font-medium">Animation Easing</span>
          <ButtonGroup
            options={EASING_OPTIONS}
            value={animationEasing}
            onChange={(v) => updateSetting('animationEasing', v)}
          />
        </div>

        <div className="border-t border-border/30" />

        {/* Per-component toggles */}
        <div className="space-y-1">
          {toggleItems.map((item, idx) => (
            <React.Fragment key={item.key}>
              {idx > 0 && <div className="border-t border-border/20" />}
              <div className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{item.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
                  {item.hasSelector && (
                    <div className="mt-2">
                      <ButtonGroup
                        options={item.selectorOptions!}
                        value={animations[item.selectorKey!] as any}
                        onChange={(v) => updateAnimation(item.selectorKey! as any, v as any)}
                      />
                    </div>
                  )}
                </div>
                {item.key !== 'progressBar' && (
                  <Switch
                    checked={animations[item.key] as boolean}
                    onCheckedChange={(v) => updateAnimation(item.key, v as any)}
                  />
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 7: DENSITY
// ═══════════════════════════════════════════════════════════════════════════════

function DensityTab() {
  const { fontSize, density, borderRadius, shadowIntensity, navbarStyle, accentColor, updateSetting } = useThemeStore();

  const radiusOptions = [
    { label: 'None', value: '0' },
    { label: 'Sm', value: '0.25rem' },
    { label: 'Md', value: '0.5rem' },
    { label: 'Lg', value: '0.75rem' },
    { label: 'Max', value: '9999px' },
  ];

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Ruler className="w-5 h-5 text-primary" />
          Density & Spacing
        </CardTitle>
        <CardDescription>Control font sizes, element density, border radius, shadows, and navbar style.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Font Size */}
        <div className="space-y-3">
          <span className="text-sm font-medium">Font Size</span>
          <div className="flex gap-2">
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <button
                key={size}
                onClick={() => updateSetting('fontSize', size)}
                className={cn(
                  'flex-1 px-3 py-2.5 text-sm font-medium rounded-lg border transition-all duration-200',
                  fontSize === size
                    ? 'border-primary/50 text-primary'
                    : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                )}
                style={
                  fontSize === size
                    ? { backgroundColor: `color-mix(in srgb, var(--primary) 15%, transparent)` }
                    : {}
                }
              >
                {size === 'sm' ? 'Small' : size === 'md' ? 'Medium' : 'Large'}
              </button>
            ))}
          </div>
        </div>

        {/* Density */}
        <div className="space-y-3">
          <span className="text-sm font-medium">Density</span>
          <div className="flex gap-2">
            {(['compact', 'normal', 'comfortable'] as const).map((d) => (
              <button
                key={d}
                onClick={() => updateSetting('density', d)}
                className={cn(
                  'flex-1 px-3 py-2.5 text-sm font-medium rounded-lg border transition-all duration-200',
                  density === d
                    ? 'border-primary/50 text-primary'
                    : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                )}
                style={
                  density === d
                    ? { backgroundColor: `color-mix(in srgb, var(--primary) 15%, transparent)` }
                    : {}
                }
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Border Radius */}
        <div className="space-y-3">
          <span className="text-sm font-medium">Border Radius</span>
          <div className="flex gap-2">
            {radiusOptions.map((r) => (
              <button
                key={r.value}
                onClick={() => updateSetting('borderRadius', r.value)}
                className={cn(
                  'flex-1 px-3 py-2.5 text-xs font-medium rounded-lg border transition-all duration-200',
                  borderRadius === r.value
                    ? 'border-primary/50 text-primary'
                    : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                )}
                style={{
                  ...(borderRadius === r.value
                    ? { backgroundColor: `color-mix(in srgb, var(--primary) 15%, transparent)` }
                    : {}),
                  borderRadius: r.value,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Shadow Intensity */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Shadow Intensity</span>
            <span className="text-xs text-muted-foreground font-mono">{Math.round(shadowIntensity * 100)}%</span>
          </div>
          <Slider
            value={[shadowIntensity * 100]}
            onValueChange={([v]) => updateSetting('shadowIntensity', v / 100)}
            min={0}
            max={100}
            step={1}
          />
        </div>

        {/* Navbar Style */}
        <div className="space-y-3">
          <span className="text-sm font-medium">Navbar Style</span>
          <div className="flex gap-2">
            {(['glass', 'solid', 'transparent'] as const).map((s) => (
              <button
                key={s}
                onClick={() => updateSetting('navbarStyle', s)}
                className={cn(
                  'flex-1 px-3 py-2.5 text-sm font-medium rounded-lg border transition-all duration-200',
                  navbarStyle === s
                    ? 'border-primary/50 text-primary'
                    : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'
                )}
                style={
                  navbarStyle === s
                    ? { backgroundColor: `color-mix(in srgb, var(--primary) 15%, transparent)` }
                    : {}
                }
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Live Preview */}
        <div className="border-t border-border/30 pt-4">
          <span className="text-sm font-medium text-muted-foreground">Live Preview</span>
          <div className="mt-3 flex items-end gap-3 p-5 rounded-xl bg-muted/20 border border-border/30">
            <div
              className="p-3 bg-card border border-border/30 flex-1"
              style={{
                borderRadius,
                boxShadow: `0 ${Math.round(shadowIntensity * 8)}px ${Math.round(shadowIntensity * 24)}px rgba(0,0,0,${shadowIntensity * 0.3})`,
              }}
            >
              <div className="text-xs font-medium">Card Preview</div>
              <div
                className={cn(
                  'text-muted-foreground mt-1',
                  density === 'compact' ? 'text-[10px]' : density === 'comfortable' ? 'text-sm' : 'text-xs'
                )}
              >
                Density: {density}
              </div>
            </div>
            <div
              className="h-2 flex-1 rounded-full"
              style={{
                backgroundColor: `${accentColor}30`,
                borderRadius,
                boxShadow: shadowIntensity > 0.3 ? `0 0 ${shadowIntensity * 12}px ${accentColor}33` : 'none',
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 8: PRESETS
// ═══════════════════════════════════════════════════════════════════════════════

function PresetsTab() {
  const { applyPreset, updateSetting, updateAnimation } = useThemeStore();

  const exportTheme = useCallback(() => {
    const { applyPreset: _, reset: __, updateSetting: ___, updateAnimation: ____, ...cfg } = useThemeStore.getState() as any;
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'theme-config.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importTheme = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string);
          const keys = Object.keys(DEFAULT_THEME_CONFIG);
          for (const key of keys) {
            if (key === 'animations' && parsed.animations) {
              const animKeys = Object.keys(DEFAULT_THEME_CONFIG.animations);
              for (const ak of animKeys) {
                if (parsed.animations[ak] !== undefined) {
                  updateAnimation(ak as any, parsed.animations[ak] as any);
                }
              }
            } else if (parsed[key] !== undefined) {
              updateSetting(key as any, parsed[key] as any);
            }
          }
        } catch {
          // invalid JSON
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [updateSetting, updateAnimation]);

  return (
    <div className="space-y-6">
      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <SwatchBook className="w-5 h-5 text-primary" />
            Theme Presets
          </CardTitle>
          <CardDescription>Choose a curated theme preset to instantly transform the look and feel.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRESET_CARDS.map((preset) => (
              <motion.div
                key={preset.key}
                whileHover={{ y: -2 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <div className="rounded-xl border border-border/40 overflow-hidden bg-card/50 hover:border-border transition-colors">
                  {/* Swatch Preview */}
                  <div
                    className="h-24 relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${preset.accentColor}, ${preset.secondaryColor})`,
                    }}
                  >
                    {preset.glass && (
                      <div
                        className="absolute bottom-2 left-2 right-2 h-8 rounded-lg"
                        style={{
                          backdropFilter: 'blur(10px)',
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.15)',
                        }}
                      />
                    )}
                    <div className="absolute top-2 right-2">
                      <div className="flex gap-1">
                        <div
                          className="w-5 h-5 rounded-md"
                          style={{ backgroundColor: preset.accentColor, border: '1px solid rgba(255,255,255,0.2)' }}
                        />
                        <div
                          className="w-5 h-5 rounded-md"
                          style={{ backgroundColor: preset.secondaryColor, border: '1px solid rgba(255,255,255,0.2)' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4 space-y-3">
                    <div>
                      <div className="text-sm font-semibold">{preset.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{preset.description}</div>
                    </div>
                    <ShimmerButton
                      variant="outline"
                      size="sm"
                      shimmer={false}
                      className="w-full text-xs"
                      onClick={() => applyPreset(preset.key)}
                    >
                      Apply Preset
                    </ShimmerButton>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Export / Import */}
      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Eye className="w-5 h-5 text-primary" />
            Export / Import
          </CardTitle>
          <CardDescription>Share your theme configuration or import one from a JSON file.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <ShimmerButton variant="primary" size="sm" onClick={exportTheme} className="gap-2">
              <Download className="w-3.5 h-3.5" />
              Export Theme
            </ShimmerButton>
            <ShimmerButton variant="outline" size="sm" shimmer={false} onClick={importTheme} className="gap-2">
              <Upload className="w-3.5 h-3.5" />
              Import Theme
            </ShimmerButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
