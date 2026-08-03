import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Sun, Moon, Palette, Monitor, Type, Square, LayoutTemplate, Sparkles, Plus } from 'lucide-react';
import { hexToHSLString } from '@/components/AppearanceProvider';
import { useThemeStore } from '@/stores/useThemeStore';

interface AppearanceConfig {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  fontSize: 'sm' | 'md' | 'lg';
  density: 'compact' | 'normal' | 'comfortable';
  borderRadius: string;
  animations: 'none' | 'reduced' | 'full';
  navbarStyle: 'solid' | 'glass' | 'transparent';
}

const THEME_PRESETS = [
  { name: 'Amber (Default)', value: '#f97316' },
  { name: 'Purple Neon', value: '#a855f7' },
  { name: 'Cyan Tech', value: '#06b6d4' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Blue', value: '#3b82f6' },
];

const MASTER_PRESETS = [
  { name: 'Default', key: 'default' as const, accentColor: '#f97316', borderRadius: '0.75rem', theme: 'dark' as const },
  { name: 'Cyberpunk', key: 'cyberpunk' as const, accentColor: '#06b6d4', borderRadius: '0', theme: 'dark' as const },
  { name: 'Minimalist', key: 'minimalist' as const, accentColor: '#2979fa', borderRadius: '0.5rem', theme: 'light' as const },
];

export function AppearanceSection() {
  const storeConfig = useThemeStore();
  const error = null;
  
  const config: AppearanceConfig = {
    theme: storeConfig.theme,
    accentColor: storeConfig.accentColor,
    fontSize: storeConfig.fontSize,
    density: storeConfig.density,
    borderRadius: storeConfig.borderRadius,
    animations: storeConfig.animationSpeed === 0 ? 'none' : storeConfig.animationSpeed >= 2 ? 'reduced' : 'full',
    navbarStyle: storeConfig.navbarStyle,
  };

  const setConfig = (newCfg: Partial<AppearanceConfig>) => {
    if (newCfg.theme !== undefined) storeConfig.updateSetting('theme', newCfg.theme);
    if (newCfg.accentColor !== undefined) storeConfig.updateSetting('accentColor', newCfg.accentColor);
    if (newCfg.fontSize !== undefined) storeConfig.updateSetting('fontSize', newCfg.fontSize);
    if (newCfg.density !== undefined) storeConfig.updateSetting('density', newCfg.density);
    if (newCfg.borderRadius !== undefined) storeConfig.updateSetting('borderRadius', newCfg.borderRadius);
    if (newCfg.navbarStyle !== undefined) storeConfig.updateSetting('navbarStyle', newCfg.navbarStyle);
    if (newCfg.animations !== undefined) {
      if (newCfg.animations === 'none') storeConfig.updateSetting('animationSpeed', 0);
      else if (newCfg.animations === 'reduced') storeConfig.updateSetting('animationSpeed', 2);
      else storeConfig.updateSetting('animationSpeed', 1);
    }
  };

  const applyMasterPreset = (presetName: string) => {
    if (!config) return;
    let newConfig = { ...config };
    switch (presetName) {
      case 'default':
        newConfig = { ...newConfig, accentColor: '#f97316', borderRadius: '0.75rem', animations: 'full', navbarStyle: 'glass', theme: 'dark' };
        break;
      case 'cyberpunk':
        newConfig = { ...newConfig, accentColor: '#06b6d4', borderRadius: '0', animations: 'full', navbarStyle: 'transparent', theme: 'dark' };
        break;
      case 'minimalist':
        newConfig = { ...newConfig, accentColor: '#3b82f6', borderRadius: '0.5rem', animations: 'reduced', navbarStyle: 'solid', theme: 'light' };
        break;
    }
    setConfig(newConfig);
  };

  const isPresetActive = (presetKey: string) => {
    if (!config) return false;
    const p = MASTER_PRESETS.find(mp => mp.key === presetKey);
    if (!p) return false;
    return config.accentColor === p.accentColor && config.borderRadius === p.borderRadius && config.theme === p.theme;
  };

  const fontSizeMap = { sm: { label: 'Small', px: '14px', desc: '14px' }, md: { label: 'Medium', px: '16px', desc: '16px' }, lg: { label: 'Large', px: '18px', desc: '18px' } };
  const densityMap = { compact: { label: 'Compact', icon: '≡', desc: 'Tight spacing' }, normal: { label: 'Normal', icon: '☰', desc: 'Balanced layout' }, comfortable: { label: 'Comfortable', icon: '☰', desc: 'Roomy spacing' } };

  if (!config) {
    return null;
  }

  const previewRadius = config.borderRadius;
  const previewHsl = hexToHSLString(config.accentColor);
  const densitySpacing = config.density === 'compact' ? 'p-3 gap-2' : config.density === 'comfortable' ? 'p-5 gap-4' : 'p-4 gap-3';
  const previewFontPx = config.fontSize === 'sm' ? '13px' : config.fontSize === 'lg' ? '17px' : '15px';

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Theme Manager</h1>
          <p className="text-muted-foreground mt-2">Tune the full UI without changing layout structure: color, density, motion, radius, and navbar feel.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {MASTER_PRESETS.map((preset) => {
            const active = isPresetActive(preset.key);
            return (
              <button
                key={preset.key}
                onClick={() => applyMasterPreset(preset.key)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'border-primary/50 bg-primary/10 text-primary shadow-[0_0_12px_-2px_var(--primary)]'
                    : 'border-border bg-card text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent/5'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-1 ring-white/10"
                  style={{ backgroundColor: preset.accentColor }}
                />
                {preset.name}
                {active && <Check className="w-3.5 h-3.5" />}
              </button>
            );
          })}
          <div className="w-px bg-border mx-1 hidden sm:block" />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setConfig({
              theme: 'dark',
              accentColor: '#f97316',
              fontSize: 'md',
              density: 'normal',
              borderRadius: '0.75rem',
              animations: 'full',
              navbarStyle: 'glass',
            })}
          >
            Reset
          </Button>
        </div>
      </div>

      {/* Colors Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            UI Accent Color
          </CardTitle>
          <CardDescription>Primary color for buttons, active states, and accents.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 mb-6">
            {THEME_PRESETS.map((color) => (
              <button
                key={color.value}
                onClick={() => setConfig({ ...config, accentColor: color.value })}
                className={`group h-12 rounded-xl transition-all flex flex-col items-center justify-center gap-2 relative overflow-hidden ${
                  config.accentColor === color.value
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105'
                    : 'hover:scale-105 shadow-sm'
                }`}
                style={{ backgroundColor: color.value }}
                title={`${color.name}`}
              >
                {config.accentColor === color.value && <Check className="w-5 h-5 text-white drop-shadow-md" />}
              </button>
            ))}
            
            <div className="relative h-12 rounded-xl overflow-hidden shadow-sm group hover:scale-105 transition-all">
              <input
                type="color"
                value={config.accentColor}
                onChange={(e) => setConfig({ ...config, accentColor: e.target.value })}
                className="absolute inset-[-10px] w-[calc(100%+20px)] h-[calc(100%+20px)] cursor-pointer"
              />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/20 text-white font-bold drop-shadow-md">
                <Plus className="w-5 h-5" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Font Size & Density */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Type className="w-5 h-5 text-primary" />
              Font Size
            </CardTitle>
            <CardDescription>Adjust the base text size across the interface.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {(['sm', 'md', 'lg'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setConfig({ ...config, fontSize: size })}
                  className={`flex-1 relative rounded-lg border py-3 px-2 text-center transition-all duration-200 ${
                    config.fontSize === size
                      ? 'border-primary/50 bg-primary/10 text-primary shadow-[0_0_16px_-4px_var(--primary)]'
                      : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground hover:bg-accent/5'
                  }`}
                >
                  <span
                    className="block font-semibold leading-none"
                    style={{ fontSize: fontSizeMap[size].px }}
                  >
                    {fontSizeMap[size].label}
                  </span>
                  <span className="block mt-1.5 opacity-60" style={{ fontSize: '10px' }}>
                    {fontSizeMap[size].desc}
                  </span>
                  {config.fontSize === size && (
                    <span className="absolute top-1.5 right-1.5">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Square className="w-5 h-5 text-primary" />
              Density
            </CardTitle>
            <CardDescription>Control spacing and padding density of UI elements.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {(['compact', 'normal', 'comfortable'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setConfig({ ...config, density: d })}
                  className={`flex-1 relative rounded-lg border py-3 px-2 text-center transition-all duration-200 ${
                    config.density === d
                      ? 'border-primary/50 bg-primary/10 text-primary shadow-[0_0_16px_-4px_var(--primary)]'
                      : 'border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground hover:bg-accent/5'
                  }`}
                >
                  <span className="block font-semibold text-sm leading-none">
                    {densityMap[d].label}
                  </span>
                  <span className="block mt-1.5 text-[10px] opacity-60">
                    {densityMap[d].desc}
                  </span>
                  {/* Visual density indicator */}
                  <div className="flex justify-center gap-0.5 mt-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="rounded-sm bg-current opacity-30"
                        style={{
                          width: d === 'compact' ? '6px' : d === 'comfortable' ? '12px' : '9px',
                          height: d === 'compact' ? '6px' : d === 'comfortable' ? '12px' : '9px',
                          marginRight: d === 'compact' ? '1px' : d === 'comfortable' ? '4px' : '2px',
                        }}
                      />
                    ))}
                  </div>
                  {config.density === d && (
                    <span className="absolute top-1.5 right-1.5">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Border Radius & Animations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Square className="w-5 h-5 text-primary" />
              Border Radius
            </CardTitle>
            <CardDescription>Adjust the roundness of UI elements.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 w-full">
              {[
                { label: 'None', val: '0' },
                { label: 'Sm', val: '0.25rem' },
                { label: 'Md', val: '0.5rem' },
                { label: 'Lg', val: '0.75rem' },
                { label: 'Max', val: '9999px' },
              ].map(r => (
                <Button 
                  key={r.val} 
                  variant={config.borderRadius === r.val ? 'default' : 'outline'}
                  onClick={() => setConfig({ ...config, borderRadius: r.val })}
                  className="flex-1"
                  style={{ borderRadius: r.val }}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Animations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Animations
            </CardTitle>
            <CardDescription>Control UI motion and visual effects.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {[
                { label: 'None', val: 'none' },
                { label: 'Reduced', val: 'reduced' },
                { label: 'Full', val: 'full' }
              ].map(a => (
                <Button 
                  key={a.val} 
                  variant={config.animations === a.val ? 'default' : 'outline'}
                  onClick={() => setConfig({ ...config, animations: a.val as any })}
                  className="flex-1"
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Navbar & Theme */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-primary" />
              Navbar Style
            </CardTitle>
            <CardDescription>Choose the material for top and side navigation.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {[
                { label: 'Glass', val: 'glass' },
                { label: 'Solid', val: 'solid' },
                { label: 'Transparent', val: 'transparent' }
              ].map(a => (
                <Button 
                  key={a.val} 
                  variant={config.navbarStyle === a.val ? 'default' : 'outline'}
                  onClick={() => setConfig({ ...config, navbarStyle: a.val as any })}
                  className="flex-1"
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-primary" />
              Theme Mode
            </CardTitle>
            <CardDescription>Switch between dark and light modes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                variant={config.theme === 'dark' ? 'default' : 'outline'}
                className="flex-1 gap-2"
                onClick={() => setConfig({ ...config, theme: 'dark' })}
              >
                <Moon className="w-4 h-4" /> Dark
              </Button>
              <Button
                variant={config.theme === 'light' ? 'default' : 'outline'}
                className="flex-1 gap-2"
                onClick={() => setConfig({ ...config, theme: 'light' })}
              >
                <Sun className="w-4 h-4" /> Light
              </Button>
              <Button
                variant={config.theme === 'system' ? 'default' : 'outline'}
                className="flex-1 gap-2"
                onClick={() => setConfig({ ...config, theme: 'system' })}
              >
                <Monitor className="w-4 h-4" /> System
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Live Preview
          </CardTitle>
          <CardDescription>See how your current theme settings look in real time.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`rounded-lg border border-border bg-card ${densitySpacing}`}
            style={{
              borderRadius: previewRadius,
              fontSize: previewFontPx,
            }}
          >
            {/* Preview Header Bar */}
            <div
              className={`flex items-center gap-3 ${config.density === 'compact' ? 'pb-2' : config.density === 'comfortable' ? 'pb-4' : 'pb-3'}`}
              style={{ borderBottom: '1px solid hsl(var(--border))' }}
            >
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
              </div>
              <div
                className="flex-1 h-5 rounded-full bg-muted/60"
                style={{ borderRadius: previewRadius }}
              />
            </div>

            {/* Preview Content */}
            <div className={`flex flex-col ${config.density === 'compact' ? 'gap-2' : config.density === 'comfortable' ? 'gap-4' : 'gap-3'}`}>
              {/* Preview text */}
              <div>
                <h3
                  className="font-semibold text-foreground"
                  style={{ fontSize: previewFontPx }}
                >
                  Sample Heading
                </h3>
                <p className="text-muted-foreground mt-1 leading-relaxed" style={{ fontSize: `${parseInt(previewFontPx) - 2}px` }}>
                  This is a preview of your current typography and density settings. Adjust the controls above to see changes reflected here instantly.
                </p>
              </div>

              {/* Preview buttons row */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="px-4 py-1.5 text-white font-medium text-sm transition-colors"
                  style={{
                    backgroundColor: `hsl(${previewHsl})`,
                    borderRadius: previewRadius,
                  }}
                >
                  Primary Button
                </button>
                <button
                  className="px-4 py-1.5 font-medium text-sm border transition-colors bg-transparent text-foreground"
                  style={{
                    borderColor: `hsl(${previewHsl})`,
                    borderRadius: previewRadius,
                  }}
                >
                  Outline Button
                </button>
                <button
                  className="px-4 py-1.5 font-medium text-sm transition-colors bg-transparent text-foreground"
                  style={{
                    color: `hsl(${previewHsl})`,
                    borderRadius: previewRadius,
                  }}
                >
                  Ghost Button
                </button>
              </div>

              {/* Preview mini cards row */}
              <div className="grid grid-cols-3 gap-2">
                {['Card A', 'Card B', 'Card C'].map((label) => (
                  <div
                    key={label}
                    className={`rounded-lg border border-border bg-muted/30 flex flex-col items-center justify-center text-muted-foreground ${config.density === 'compact' ? 'py-2' : config.density === 'comfortable' ? 'py-4' : 'py-3'}`}
                    style={{ borderRadius: previewRadius }}
                  >
                    <div
                      className="w-6 h-6 rounded-full mb-1.5"
                      style={{ backgroundColor: `hsl(${previewHsl})`, opacity: 0.7 }}
                    />
                    <span className="text-xs font-medium">{label}</span>
                  </div>
                ))}
              </div>

              {/* Preview badge / tag row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {['Design', 'UI Kit', 'Preview'].map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: `hsl(${previewHsl} / 0.12)`,
                      color: `hsl(${previewHsl})`,
                      borderRadius: previewRadius,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}