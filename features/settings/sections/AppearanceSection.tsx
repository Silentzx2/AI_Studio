'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Check, Sun, Moon, Monitor, Palette, Type, Square, LayoutTemplate, Sparkles,
  Plus, Droplet, Layers, MousePointerClick, Zap, Wand2, RefreshCw, Image, Paintbrush,
} from 'lucide-react';
import { hexToHSLString } from '@/components/AppearanceProvider';
import { useThemeStore, type ThemeConfig } from '@/stores/useThemeStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const ACCENT_PRESETS = [
  '#F5A623', '#A855F7', '#06B6D4', '#10B981', '#F43F5E', '#3B82F6', '#EC4899', '#EAB308',
];

const MASTER_PRESETS = [
  { key: 'default', label: 'Default', desc: 'Amber · Dark · Pill' },
  { key: 'cyberpunk', label: 'Cyberpunk', desc: 'Cyan · Glass · Neon' },
  { key: 'minimalist', label: 'Minimalist', desc: 'Slate · Solid · Calm' },
  { key: 'neon', label: 'Neon', desc: 'Purple · Glass · Glow' },
  { key: 'warm', label: 'Warm', desc: 'Orange · Frosted' },
  { key: 'frost', label: 'Frost', desc: 'Sky · Glass · Soft' },
  { key: 'aurora', label: 'Aurora', desc: 'Cyan · Violet · Glow' },
  { key: 'sunset', label: 'Sunset', desc: 'Rose · Amber · Glow' },
  { key: 'ocean', label: 'Ocean', desc: 'Sky · Teal · Calm' },
  { key: 'midnight', label: 'Midnight', desc: 'Indigo · Solid · Neon' },
  { key: 'emerald', label: 'Emerald', desc: 'Green · Calm · Glow' },
] as const;

const TAB_STYLES = ['pill', 'underline', 'rounded', 'glass', 'minimal'] as const;
const CARD_HOVER = ['lift', 'glow', 'border', 'tilt', 'none'] as const;
const DROPDOWN = ['spring', 'fade', 'slide', 'scale', 'flip'] as const;
const PROGRESS = ['default', 'shimmer', 'gradient', 'neon'] as const;

const BUTTON_SHAPES = [
  { value: '0', label: 'Square' },
  { value: '0.25rem', label: 'Sharp' },
  { value: '0.5rem', label: 'Rounded' },
  { value: '0.75rem', label: 'Soft' },
  { value: '1rem', label: 'Large' },
  { value: '9999px', label: 'Pill' },
] as const;

function SectionHeader({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc?: string }) {
  return (
    <CardHeader className="pb-4">
      <CardTitle className="flex items-center gap-2 text-base">
        <span className="grid place-items-center w-7 h-7 rounded-lg bg-primary/10 text-primary">
          <Icon className="w-4 h-4" />
        </span>
        {title}
      </CardTitle>
      {desc && <CardDescription>{desc}</CardDescription>}
    </CardHeader>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/60 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  options, value, onChange, capitalize = true,
}: { options: readonly T[]; value: T; onChange: (v: T) => void; capitalize?: boolean }) {
  return (
    <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-surface-2 border border-border">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
              active
                ? 'bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.4)]'
                : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            {capitalize ? opt : opt}
          </button>
        );
      })}
    </div>
  );
}

export function AppearanceSection() {
  const store = useThemeStore();
  const cfg = store;

  const set = <K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) => store.updateSetting(key, value);
  const setAnim = <K extends keyof ThemeConfig['animations']>(key: K, value: ThemeConfig['animations'][K]) =>
    store.updateAnimation(key, value);

  const previewHsl = hexToHSLString(cfg.accentColor);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Appearance</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Tune the entire studio — color, motion, glass, and layout — and watch it update live.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {MASTER_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => store.applyPreset(p.key)}
              title={p.desc}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium border-border bg-card text-muted-foreground transition-all hover:text-foreground hover:border-primary/40"
            >
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: previewColorFor(p.key) }} />
              {p.label}
            </button>
          ))}
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => store.reset()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reset
          </Button>
        </div>
      </motion.div>

      {/* ── Colors ── */}
      <Card>
        <SectionHeader icon={Palette} title="Accent Color" desc="Primary color for buttons, active states, glows, and highlights." />
        <CardContent className="space-y-5">
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {ACCENT_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => set('accentColor', c)}
                className={`group h-11 rounded-xl relative transition-all ${
                  cfg.accentColor.toLowerCase() === c.toLowerCase()
                    ? 'ring-2 ring-offset-2 ring-offset-background scale-105'
                    : 'hover:scale-105 shadow-sm'
                }`}
                style={{ backgroundColor: c, boxShadow: cfg.accentColor.toLowerCase() === c.toLowerCase() ? `0 0 18px ${c}` : undefined }}
                title={c}
              >
                {cfg.accentColor.toLowerCase() === c.toLowerCase() && <Check className="w-5 h-5 text-[hsl(var(--foreground))] drop-shadow" />}
              </button>
            ))}
            <div className="relative h-11 rounded-xl overflow-hidden shadow-sm group hover:scale-105 transition-all">
              <input
                type="color"
                value={cfg.accentColor}
                onChange={(e) => set('accentColor', e.target.value)}
                className="absolute inset-[-10px] w-[calc(100%+20px)] h-[calc(100%+20px)] cursor-pointer"
              />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-[hsl(var(--surface-0)/0.2)] text-[hsl(var(--foreground))]">
                <Plus className="w-5 h-5" />
              </div>
            </div>
          </div>
          <Row label="Secondary Accent" hint="Used for gradients and progress bars.">
            <input
              type="color"
              value={cfg.accentColorSecondary}
              onChange={(e) => set('accentColorSecondary', e.target.value)}
              className="h-9 w-16 rounded-lg cursor-pointer bg-transparent border border-border"
            />
          </Row>
        </CardContent>
      </Card>

      {/* ── Theme Mode & Shadows ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <SectionHeader icon={Sun} title="Theme Mode" desc="Switch between dark and light, or follow the system." />
          <CardContent>
            <div className="flex gap-2">
              {([['dark', Moon, 'Dark'], ['light', Sun, 'Light'], ['system', Monitor, 'System']] as const).map(([val, Icon, lbl]) => (
                <button
                  key={val}
                  onClick={() => set('theme', val)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    cfg.theme === val
                      ? 'border-primary/50 bg-primary/10 text-primary shadow-[0_0_16px_hsl(var(--primary)/0.3)]'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {lbl}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <SectionHeader icon={Droplet} title="Shadows & Navigation" desc="Glow intensity and the navbar material." />
          <CardContent className="space-y-1">
            <Row label="Shadow Intensity" hint={`${Math.round(cfg.shadowIntensity * 100)}%`}>
              <div className="w-40">
                <Slider value={[cfg.shadowIntensity * 100]} min={0} max={100} step={5}
                  onValueChange={([v]) => set('shadowIntensity', v / 100)} />
              </div>
            </Row>
            <Row label="Navbar Style">
              <Segmented options={['glass', 'solid', 'transparent'] as const} value={cfg.navbarStyle}
                onChange={(v) => set('navbarStyle', v)} />
            </Row>
          </CardContent>
        </Card>
      </div>

      {/* ── Typography & Density & Radius ── */}
      <Card>
        <SectionHeader icon={Type} title="Typography, Density & Radius" />
        <CardContent className="space-y-1">
          <Row label="Font Size">
            <Segmented options={['sm', 'md', 'lg'] as const} value={cfg.fontSize} onChange={(v) => set('fontSize', v)} />
          </Row>
          <Row label="Layout Density">
            <Segmented options={['compact', 'normal', 'comfortable'] as const} value={cfg.density} onChange={(v) => set('density', v)} />
          </Row>
          <Row label="Border Radius" hint={`Current: ${cfg.borderRadius}`}>
            <Segmented<string>
              options={['0', '0.25rem', '0.5rem', '0.75rem', '1rem', '9999px']}
              value={cfg.borderRadius}
              onChange={(v) => set('borderRadius', v as string)}
            />
          </Row>
        </CardContent>
      </Card>

      {/* ── Glass & Lighting ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <SectionHeader icon={Layers} title="Glassmorphism" desc="Frosted blur for surfaces and panels." />
          <CardContent className="space-y-1">
            <Row label="Enable Glass" hint="Toggle frosted surfaces app-wide.">
              <Switch checked={cfg.glassEnabled} onCheckedChange={(v) => set('glassEnabled', v)} />
            </Row>
            <Row label="Glass Blur" hint={`${cfg.glassBlur}px`}>
              <div className="w-40">
                <Slider value={[cfg.glassBlur]} min={0} max={32} step={1} onValueChange={([v]) => set('glassBlur', v)} />
              </div>
            </Row>
          </CardContent>
        </Card>

        <Card>
          <SectionHeader icon={Zap} title="Lighting & Glow" desc="Neon glow and ambient lighting effects." />
          <CardContent className="space-y-1">
            <Row label="Neon Glow" hint="Accent glow on cards, borders, and focus.">
              <Switch checked={cfg.neonGlowEnabled} onCheckedChange={(v) => set('neonGlowEnabled', v)} />
            </Row>
            <Row label="Neon Glow Intensity" hint={`${Math.round(cfg.neonGlowIntensity * 100)}%`}>
              <div className="w-40">
                <Slider value={[cfg.neonGlowIntensity * 100]} min={0} max={100} step={5}
                  onValueChange={([v]) => set('neonGlowIntensity', v / 100)} />
              </div>
            </Row>
            <Row label="Ambient Glow" hint="Soft background color wash.">
              <Switch checked={cfg.ambientGlowEnabled} onCheckedChange={(v) => set('ambientGlowEnabled', v)} />
            </Row>
            <Row label="Spotlight on Cards" hint="Cursor-following glow on hover.">
              <Switch checked={cfg.spotlightOnCards} onCheckedChange={(v) => set('spotlightOnCards', v)} />
            </Row>
          </CardContent>
        </Card>
      </div>

      {/* ── Tab & Button Styling ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <SectionHeader icon={LayoutTemplate} title="Tabs & Dropdowns" />
          <CardContent className="space-y-1">
            <Row label="Tab Style">
              <Segmented options={TAB_STYLES} value={cfg.tabStyle} onChange={(v) => set('tabStyle', v)} />
            </Row>
            <Row label="Dropdown Animation">
              <Segmented options={DROPDOWN} value={cfg.animations.dropdownStyle} onChange={(v) => setAnim('dropdownStyle', v)} />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <SectionHeader icon={MousePointerClick} title="Buttons" />
          <CardContent className="space-y-1">
            <Row label="Button Shape" hint="Applies to every button across the studio in one click.">
              <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-surface-2 border border-border">
                {BUTTON_SHAPES.map((s) => {
                  const active = cfg.borderRadius === s.value;
                  return (
                    <button
                      key={s.value}
                      onClick={() => set('borderRadius', s.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        active
                          ? 'bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.4)]'
                          : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </Row>
            <Row label="Glow on Buttons">
              <Switch checked={cfg.buttonGlow} onCheckedChange={(v) => set('buttonGlow', v)} />
            </Row>
            <Row label="Gradient Buttons">
              <Switch checked={cfg.buttonGradient} onCheckedChange={(v) => set('buttonGradient', v)} />
            </Row>
            <Row label="Ripple Effect">
              <Switch checked={cfg.buttonRippleEffect} onCheckedChange={(v) => set('buttonRippleEffect', v)} />
            </Row>
            <Row label="Border Glow">
              <Switch checked={cfg.buttonBorderGlow} onCheckedChange={(v) => set('buttonBorderGlow', v)} />
            </Row>
            <Row label="Press Animation">
              <Switch checked={cfg.animations.buttonPress} onCheckedChange={(v) => setAnim('buttonPress', v)} />
            </Row>
          </CardContent>
        </Card>
      </div>

      {/* ── Motion & Animation Speed ── */}
      <Card>
        <SectionHeader icon={Sparkles} title="Motion & Animation" desc="Control every animation across the studio." />
        <CardContent className="space-y-1">
          <Row label="Animation Speed" hint={`${cfg.animationSpeed === 0 ? 'Off' : `${cfg.animationSpeed.toFixed(1)}x`}`}>
            <div className="w-48">
              <Slider value={[cfg.animationSpeed]} min={0} max={2} step={0.1} onValueChange={([v]) => set('animationSpeed', v)} />
            </div>
          </Row>
          <Row label="Easing">
            <Segmented options={['spring', 'smooth', 'snappy', 'dramatic'] as const} value={cfg.animationEasing} onChange={(v) => set('animationEasing', v)} />
          </Row>
          <Row label="Progress Bar Style">
            <Segmented options={PROGRESS} value={cfg.animations.progressBar} onChange={(v) => setAnim('progressBar', v)} />
          </Row>
          <Row label="Card Hover Effect">
            <Segmented options={CARD_HOVER} value={cfg.animations.cardHoverStyle} onChange={(v) => setAnim('cardHoverStyle', v)} />
          </Row>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3">
            {([
              ['pageTransitions', 'Page Transitions'],
              ['cardHover', 'Card Hover'],
              ['shimmerLoading', 'Shimmer Loading'],
              ['staggerChildren', 'Staggered Lists'],
              ['sidebarTransitions', 'Sidebar Transitions'],
              ['uploadPulse', 'Upload Pulse'],
              ['toastAnimations', 'Toast Animations'],
              ['fadeInSection', 'Fade-In Sections'],
              ['dropdownOpen', 'Dropdown Open'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2 cursor-pointer hover:bg-surface-3/50">
                <span className="text-xs font-medium text-foreground/90">{label}</span>
                <Switch checked={(cfg.animations as any)[key]} onCheckedChange={(v) => setAnim(key as keyof ThemeConfig['animations'], v)} />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>


      {/* ── App Background ── */}
      <Card>
        <SectionHeader icon={Image} title="App Background" desc="Set a global background — solid color, gradient, or wallpaper — applied app-wide." />
        <CardContent className="space-y-4">
          <Row label="Enable Custom Background" hint="Override the default studio backdrop.">
            <Switch checked={cfg.appBackgroundEnabled} onCheckedChange={(v) => set('appBackgroundEnabled', v)} />
          </Row>

          <div className={cn("space-y-4", cfg.appBackgroundEnabled ? "" : "opacity-50 pointer-events-none")}>
            <Row label="Background Type">
              <Segmented
                options={['solid', 'gradient', 'wallpaper'] as const}
                value={cfg.appBackgroundType}
                onChange={(v) => set('appBackgroundType', v)}
              />
            </Row>

            {cfg.appBackgroundType === 'solid' && (
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(cfg.appBackground) ? cfg.appBackground : '#0a0e14'}
                  onChange={(e) => set('appBackground', e.target.value)}
                  className="h-10 w-16 rounded-lg cursor-pointer bg-transparent border border-border"
                />
                <input
                  value={cfg.appBackground}
                  onChange={(e) => set('appBackground', e.target.value)}
                  placeholder="#0a0e14"
                  className="h-10 flex-1 rounded-lg glass text-sm border border-[hsl(var(--border)/0.5)] px-3 focus:outline-none font-mono"
                />
              </div>
            )}

            {cfg.appBackgroundType === 'gradient' && (
              <div className="grid grid-cols-1 gap-2">
                {[
                  { label: 'Aurora', value: 'radial-gradient(1100px 700px at 12% 8%, rgba(34,211,238,0.22), transparent), radial-gradient(900px 600px at 88% 92%, rgba(167,139,250,0.20), transparent), linear-gradient(160deg, #04121a, #0a0f1f)' },
                  { label: 'Sunset', value: 'radial-gradient(1000px 700px at 10% 0%, rgba(251,113,133,0.25), transparent), radial-gradient(900px 700px at 90% 100%, rgba(245,158,11,0.22), transparent), linear-gradient(180deg, #1a0e12, #120a10)' },
                  { label: 'Ocean', value: 'radial-gradient(1200px 800px at 20% 100%, rgba(14,165,233,0.22), transparent), radial-gradient(800px 600px at 90% 10%, rgba(20,184,166,0.18), transparent), linear-gradient(200deg, #04141a, #061018)' },
                  { label: 'Emerald', value: 'radial-gradient(1000px 700px at 15% 5%, rgba(52,211,153,0.20), transparent), radial-gradient(900px 700px at 85% 95%, rgba(16,185,129,0.18), transparent), linear-gradient(180deg, #04130d, #07120c)' },
                  { label: 'Midnight', value: '#070912' },
                  { label: 'Storm', value: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)' },
                ].map((g) => (
                  <button
                    key={g.label}
                    onClick={() => set('appBackground', g.value)}
                    className={cn(
                      'flex items-center gap-3 p-2 rounded-lg border transition-all text-left',
                      cfg.appBackground === g.value
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border hover:border-primary/30'
                    )}
                  >
                    <span className="w-10 h-8 rounded-md border border-border shrink-0" style={{ background: g.value }} />
                    <span className="text-xs font-medium">{g.label}</span>
                  </button>
                ))}
              </div>
            )}

            {cfg.appBackgroundType === 'wallpaper' && (
              <div className="space-y-2">
                <input
                  value={cfg.appBackground}
                  onChange={(e) => set('appBackground', e.target.value)}
                  placeholder="https://… or /wallpaper.png"
                  className="h-10 w-full rounded-lg glass text-sm border border-[hsl(var(--border)/0.5)] px-3 focus:outline-none font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Enter an image URL. Tip: drop a file in <code className="font-mono">backend/storage</code> and use its path.
                </p>
                {/^https?:\/\//.test(cfg.appBackground) || cfg.appBackground.startsWith('/') ? (
                  <div
                    className="h-24 rounded-lg border border-border bg-cover bg-center"
                    style={{ backgroundImage: `url(${cfg.appBackground})` }}
                  />
                ) : null}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Live Preview ── */}
      <Card className="overflow-hidden">
        <SectionHeader icon={Wand2} title="Live Preview" desc="A real-time snapshot of your theme choices." />
        <CardContent>
          <div className="rounded-2xl border border-border p-5" style={{ background: 'hsl(var(--card))', borderRadius: cfg.borderRadius }}>
            <div className="flex items-center gap-2 mb-4" style={{ borderBottom: '1px solid hsl(var(--border))', paddingBottom: '0.75rem' }}>
              <span className="w-3 h-3 rounded-full bg-[hsl(var(--destructive)/0.7)]" />
              <span className="w-3 h-3 rounded-full bg-[hsl(var(--neon-amber)/0.7)]" />
              <span className="w-3 h-3 rounded-full bg-[hsl(var(--neon-green)/0.7)]" />
              <div className="flex-1 h-5 rounded-full bg-surface-2 ml-2" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold" style={{ color: `hsl(${previewHsl})` }}>Sample Heading</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  This preview reflects your typography, density, and color choices instantly.
                </p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button className="px-4 py-1.5 text-[hsl(var(--foreground))] text-sm font-medium rounded-lg"
                    style={{ background: `hsl(${previewHsl})`, borderRadius: cfg.borderRadius, boxShadow: cfg.buttonGlow ? `0 0 18px hsl(${previewHsl}/0.5)` : undefined }}>
                    Primary
                  </button>
                  <button className="px-4 py-1.5 text-sm font-medium rounded-lg border"
                    style={{ borderColor: `hsl(${previewHsl})`, color: `hsl(${previewHsl})`, borderRadius: cfg.borderRadius }}>
                    Outline
                  </button>
                </div>
                <div className="mt-3 flex gap-1.5 flex-wrap">
                  {['Design', 'UI Kit', 'Preview'].map((t) => (
                    <span key={t} className="px-2 py-0.5 text-xs font-medium rounded-full"
                      style={{ background: `hsl(${previewHsl}/0.12)`, color: `hsl(${previewHsl})`, borderRadius: cfg.borderRadius }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div data-tab-style={cfg.tabStyle} className="inline-flex gap-1 rounded-lg bg-surface-2 p-1 self-start">
                  {['Tab A', 'Tab B', 'Tab C'].map((t, i) => (
                    <span key={t} data-state={i === 0 ? 'active' : 'inactive'}
                      className={`px-3 py-1 text-xs font-medium rounded-md ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {t}
                    </span>
                  ))}
                </div>
                <div className="h-2 rounded-full overflow-hidden bg-surface-2">
                  <div className={`h-full ${cfg.animations.progressBar === 'neon' ? 'progress-neon' : cfg.animations.progressBar === 'gradient' ? 'progress-gradient' : cfg.animations.progressBar === 'shimmer' ? 'shimmer-loading' : ''}`}
                    style={{ width: '65%', background: cfg.animations.progressBar === 'default' || cfg.animations.progressBar === 'shimmer' ? `hsl(${previewHsl})` : undefined }} />
                </div>
                <div
                  className={`rounded-xl border border-border p-3 flex items-center gap-3 ${cfg.animations.cardHover ? (cfg.animations.cardHoverStyle === 'glow' ? 'card-hover-glow' : cfg.animations.cardHoverStyle === 'border' ? 'card-hover-border' : cfg.animations.cardHoverStyle === 'none' ? '' : 'card-hover-lift') : ''}`}>
                  <span className="w-8 h-8 rounded-lg" style={{ background: `hsl(${previewHsl}/0.7)` }} />
                  <div className="text-sm font-medium">Hoverable Card</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function previewColorFor(preset: string): string {
  const map: Record<string, string> = {
    default: '#F5A623', cyberpunk: '#06B6D4', minimalist: '#64748B', neon: '#A855F7', warm: '#F97316', frost: '#38BDF8',
    aurora: '#22D3EE', sunset: '#FB7185', ocean: '#0EA5E9', midnight: '#818CF8', emerald: '#34D399',
  };
  return map[preset] ?? '#F5A623';
}
