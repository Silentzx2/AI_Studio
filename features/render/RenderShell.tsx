"use client";


import { useState, useEffect } from 'react';
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
import { useTaskManager } from '@/hooks/useTaskManager';
import { useAppStore } from '@/stores/useAppStore';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { generationService } from '@/services/generationService';
import type { GenerationConfig } from '@/types';

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

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const Canvas = dynamic(() => import('@react-three/fiber').then(m => m.Canvas), { ssr: false })
import { ViewerScene } from '@/features/workspace/viewer/ViewerScene';
import { useUIStore } from '@/stores/useUIStore';
import { AssetPanelHost } from '@/features/workspace/AssetPanelHost';
import { useViewerStore } from '@/stores/useViewerStore';

export function RenderShell() {
  const [quality, setQuality] = useState('high');
  const [resolution, setResolution] = useState('1920x1080');
  const [samples, setSamples] = useState(128);
  const [denoise, setDenoise] = useState(true);
  const [lighting, setLighting] = useState('studio');
  const [camera, setCamera] = useState('perspective');
  const { reconnectToRunningTasks, registerTask, updateTask, completeTask } = useTaskManager();
  const { currentJob } = useGenerationStore();
  const { viewer } = useUIStore();
  const loadedModelUrl = useViewerStore((s) => s.loadedModelUrl);

  const renderTasks = useAppStore((s) =>
    Object.values(s.tasks).filter((t) => t.type === 'render').sort((a, b) => b.createdAt - a.createdAt).slice(0, 10)
  );

  const RENDER_QUEUE = renderTasks.map((t) => ({
    id: t.id,
    name: t.label,
    status: t.status === 'running' ? 'rendering' : t.status,
    progress: t.progress,
    time: t.status === 'completed' ? `${Math.round(t.progress)}%` : '—',
  }));

  useEffect(() => {
    reconnectToRunningTasks();
  }, [reconnectToRunningTasks]);

  const handleRender = async () => {
    const store = useGenerationStore.getState();
    const prompt = store.prompt || 'Render current 3D scene';
    const modelUrl = currentJob?.result?.downloadUrls?.glb || currentJob?.result?.modelUrl;

    const config: GenerationConfig = {
      mode: 'render' as GenerationConfig['mode'],
      prompt: `${prompt} — render quality: ${quality}, resolution: ${resolution}, lighting: ${lighting}, camera: ${camera}, samples: ${samples}`,
      negativePrompt: store.negativePrompt,
      quality: store.quality,
      generateTexture: false,
      autoRig: false,
      model: store.selectedModel,
      referenceImage: modelUrl,
    };

    const taskId = `render-${Date.now()}`;
    registerTask({
      id: taskId,
      type: 'render',
      status: 'queued',
      progress: 0,
      label: `Render: ${resolution} ${quality}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    toast.info('Render started', { description: `Quality: ${quality} · ${resolution} · ${samples} samples` });

    try {
      updateTask(taskId, { status: 'running', progress: 5 });
      await generationService.startGeneration(
        config,
        (progress, status, log) => {
          updateTask(taskId, { progress, status: status as 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' });
        },
        () => {},
      );
      completeTask(taskId, 'completed');
      toast.success('Render complete');
    } catch (error) {
      completeTask(taskId, 'failed');
      toast.error('Render failed', { description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <div className="flex gap-4 p-3 sm:p-4 lg:p-6 max-w-[1700px] mx-auto items-start">
      <div className="flex-1 min-w-0 space-y-4 sm:space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Render Studio</h1>
          <p className="text-sm text-muted-foreground mt-1">Professional 3D rendering with Cycles & EEVEE</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Preview */}
        <GlassCard className="lg:col-span-2 p-0 overflow-hidden min-h-[400px]" delay={0.05}>
          <div className="relative h-full aspect-video bg-surface-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--neon-purple)/0.05)] to-[hsl(var(--neon-blue)/0.05)]" />
            
            <Canvas camera={{ position: [0, 2, 5], fov: 45 }} shadows gl={{ antialias: true, alpha: true }} className="w-full h-full relative z-10">
              <Suspense fallback={null}>
                <ViewerScene />
              </Suspense>
            </Canvas>

            {!currentJob?.result && !loadedModelUrl && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-3 bg-surface-1/50 backdrop-blur-md p-6 rounded-2xl border border-[hsl(var(--border)/0.5)]">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-surface-2/50 border border-[hsl(var(--border)/0.5)]">
                    <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-muted-foreground">Generate a model first to setup rendering</p>
                </div>
              </div>
            )}

            <div className="absolute top-3 left-3 z-30 flex items-center gap-2 px-2.5 py-1 rounded-lg glass border border-[hsl(var(--border)/0.5)] pointer-events-none">
              <span className="text-xs font-mono text-muted-foreground">{resolution}</span>
            </div>
            <div className="absolute top-3 right-3 z-30 flex items-center gap-2 px-2.5 py-1 rounded-lg glass border border-[hsl(var(--border)/0.5)] pointer-events-none">
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
              {LIGHTING_PRESETS.map((light) => {
                return (
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
                );
              })}
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
      <aside className="hidden xl:block w-[260px] shrink-0 sticky top-4 h-[calc(100vh-2rem)]">
        <AssetPanelHost className="h-full" />
      </aside>
    </div>
  );
}