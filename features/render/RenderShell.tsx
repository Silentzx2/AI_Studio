"use client";


import { useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Sun, Moon, Aperture, Film, Download, Play, Settings, Image as ImageIcon } from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { NeonButton } from '@/components/premium/NeonButton';
import { Badge } from '@/components/premium/Badge';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CAMERA_PRESETS = [
  { id: 'front', label: 'Front View', icon: Camera },
  { id: 'perspective', label: 'Perspective', icon: Aperture },
  { id: 'top', label: 'Top Down', icon: Sun },
  { id: 'side', label: 'Side View', icon: Moon },
];

const LIGHTING_PRESETS = [
  { id: 'studio', label: 'Studio', description: '3-point lighting' },
  { id: 'sunset', label: 'Sunset', description: 'Warm golden hour' },
  { id: 'night', label: 'Night', description: 'Cool moonlight' },
  { id: 'dramatic', label: 'Dramatic', description: 'High contrast' },
];

const RENDER_QUEUE = [
  { id: '1', name: 'castle_tower.glb', status: 'rendering', progress: 67, time: '00:42' },
  { id: '2', name: 'robot_character.fbx', status: 'queued', progress: 0, time: '—' },
  { id: '3', name: 'dragon_high.glb', status: 'completed', progress: 100, time: '00:58' },
];

export function RenderShell() {
  const [quality, setQuality] = useState('high');
  const [resolution, setResolution] = useState('1920x1080');
  const [samples, setSamples] = useState(128);
  const [denoise, setDenoise] = useState(true);
  const [lighting, setLighting] = useState('studio');
  const [camera, setCamera] = useState('perspective');

  const handleRender = () => {
    toast.info('Render started', { description: `Quality: ${quality} · ${resolution} · ${samples} samples` });
  };

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Render Studio</h1>
        <p className="text-sm text-muted-foreground mt-1">Professional 3D rendering with Cycles & EEVEE</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Preview */}
        <GlassCard className="lg:col-span-2 p-0 overflow-hidden" delay={0.05}>
          <div className="relative aspect-video bg-surface-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--neon-purple)/0.05)] to-[hsl(var(--neon-blue)/0.05)]" />
            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-2/50 border border-[hsl(var(--border)/0.5)]">
                <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">Render preview will appear here</p>
            </div>
            <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-lg glass border border-[hsl(var(--border)/0.5)]">
              <span className="text-xs font-mono text-muted-foreground">{resolution}</span>
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-2 px-2.5 py-1 rounded-lg glass border border-[hsl(var(--border)/0.5)]">
              <span className="text-xs text-muted-foreground">{samples} samples</span>
            </div>
          </div>
        </GlassCard>

        {/* Controls */}
        <div className="space-y-3 sm:space-y-4">
          <GlassCard className="p-4 sm:p-5" delay={0.1}>
            <h3 className="text-sm font-semibold mb-4">Camera Presets</h3>
            <div className="grid grid-cols-2 gap-2">
              {CAMERA_PRESETS.map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.id}
                    onClick={() => setCamera(preset.id)}
                    className={cn(
                      'flex items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all touch-target',
                      camera === preset.id
                        ? 'bg-[hsl(var(--neon-purple)/0.1)] border-[hsl(var(--neon-purple)/0.3)] text-foreground'
                        : 'glass border-[hsl(var(--border)/0.5)] text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="p-4 sm:p-5" delay={0.15}>
            <h3 className="text-sm font-semibold mb-4">Lighting</h3>
            <div className="space-y-2">
              {LIGHTING_PRESETS.map((light) => (
                <button
                  key={light.id}
                  onClick={() => setLighting(light.id)}
                  className={cn(
                    'flex items-center justify-between w-full p-3 rounded-xl border text-left transition-all touch-target',
                    lighting === light.id
                      ? 'bg-[hsl(var(--neon-purple)/0.1)] border-[hsl(var(--neon-purple)/0.3)]'
                      : 'glass border-[hsl(var(--border)/0.5)] hover:border-[hsl(var(--border)/0.8)]'
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{light.label}</p>
                    <p className="text-xs text-muted-foreground">{light.description}</p>
                  </div>
                  {lighting === light.id && <div className="w-2 h-2 rounded-full bg-[hsl(var(--neon-purple))]" />}
                </button>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Quality Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <GlassCard className="p-4 sm:p-5" delay={0.2}>
          <h3 className="text-sm font-semibold mb-4">Quality Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Engine</label>
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger className="w-full bg-surface-2/50 border-[hsl(var(--border)/0.5)]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (EEVEE)</SelectItem>
                  <SelectItem value="medium">Medium (EEVEE)</SelectItem>
                  <SelectItem value="high">High (Cycles)</SelectItem>
                  <SelectItem value="ultra">Ultra (Cycles + OptiX)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Resolution</label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="w-full bg-surface-2/50 border-[hsl(var(--border)/0.5)]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1280x720">1280 × 720 (HD)</SelectItem>
                  <SelectItem value="1920x1080">1920 × 1080 (Full HD)</SelectItem>
                  <SelectItem value="2560x1440">2560 × 1440 (2K)</SelectItem>
                  <SelectItem value="3840x2160">3840 × 2160 (4K)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">Samples</label>
                <span className="text-xs font-mono text-foreground">{samples}</span>
              </div>
              <Slider value={[samples]} min={16} max={512} step={16} onValueChange={(v) => setSamples(v[0])} />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Denoise</label>
              <Switch checked={denoise} onCheckedChange={setDenoise} className="data-[state=checked]:bg-[hsl(var(--neon-purple))]" />
            </div>
          </div>
        </GlassCard>

        {/* Render Queue */}
        <GlassCard className="p-4 sm:p-5 lg:col-span-2" delay={0.25}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Render Queue</h3>
            <NeonButton variant="primary" size="sm" onClick={handleRender}>
              <Play className="w-3.5 h-3.5" />
              Start Render
            </NeonButton>
          </div>
          <div className="space-y-3">
            {RENDER_QUEUE.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-3 p-3 rounded-xl glass border border-[hsl(var(--border)/0.3)]">
                <div className={cn('flex items-center justify-center w-9 h-9 rounded-xl shrink-0', item.status === 'completed' ? 'bg-[hsl(var(--neon-green)/0.1)]' : item.status === 'rendering' ? 'bg-[hsl(var(--neon-purple)/0.1)]' : 'bg-surface-2')}>
                  <Film className={cn('w-4 h-4', item.status === 'completed' ? 'text-[hsl(var(--neon-green))]' : item.status === 'rendering' ? 'text-[hsl(var(--neon-purple))]' : 'text-muted-foreground')} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <ProgressBar value={item.progress} color={item.status === 'completed' ? 'green' : 'purple'} size="xs" showGlow={item.status === 'rendering'} />
                    <span className="text-xs font-mono text-muted-foreground shrink-0">{item.time}</span>
                  </div>
                </div>
                <Badge variant={item.status === 'completed' ? 'success' : item.status === 'rendering' ? 'neon' : 'default'}>
                  {item.status}
                </Badge>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
