"use client";


import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Palette, Layers, Eye, Download, Sparkles, Sliders, Brush, Wand2 } from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { NeonButton } from '@/components/premium/NeonButton';
import { Badge } from '@/components/premium/Badge';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTaskManager } from '@/hooks/useTaskManager';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { generationService } from '@/services/generationService';
import type { GenerationConfig } from '@/types';

const MATERIAL_LAYERS = [
  { id: 'albedo', label: 'Albedo', icon: Palette, color: 'text-[hsl(var(--neon-purple))]', enabled: true },
  { id: 'normal', label: 'Normal', icon: Layers, color: 'text-[hsl(var(--neon-blue))]', enabled: true },
  { id: 'roughness', label: 'Roughness', icon: Sliders, color: 'text-[hsl(var(--neon-cyan))]', enabled: true },
  { id: 'metallic', label: 'Metallic', icon: Wand2, color: 'text-[hsl(var(--neon-amber))]', enabled: true },
  { id: 'ao', label: 'AO', icon: Eye, color: 'text-[hsl(var(--neon-green))]', enabled: false },
  { id: 'height', label: 'Height', icon: Brush, color: 'text-[hsl(var(--neon-pink))]', enabled: false },
];

import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import { ViewerScene } from '@/features/workspace/viewer/ViewerScene';
import { useUIStore } from '@/stores/useUIStore';

export function TextureShell() {
  const [selectedLayer, setSelectedLayer] = useState('albedo');
  const [roughness, setRoughness] = useState(50);
  const [metallic, setMetallic] = useState(20);
  const [normalStrength, setNormalStrength] = useState(75);
  const [tileable, setTileable] = useState(true);
  const [resolution, setResolution] = useState('2048');
  const [material, setMaterial] = useState('auto');
  const { reconnectToRunningTasks, registerTask, updateTask, completeTask } = useTaskManager();
  const { currentJob } = useGenerationStore();
  const { viewer } = useUIStore();

  useEffect(() => {
    reconnectToRunningTasks();
  }, [reconnectToRunningTasks]);

  const handleGenerate = async () => {
    const store = useGenerationStore.getState();
    const prompt = store.prompt || 'Generate PBR texture set for current model';
    const modelUrl = currentJob?.result?.downloadUrls?.glb || currentJob?.result?.modelUrl;

    const config: GenerationConfig = {
      mode: 'texture-generation' as GenerationConfig['mode'],
      prompt,
      negativePrompt: store.negativePrompt,
      quality: store.quality,
      generateTexture: true,
      autoRig: false,
      model: store.selectedModel,
      referenceImage: modelUrl, // Pass model URL as reference image for re-texturing
    };

    const taskId = `texture-${Date.now()}`;
    registerTask({
      id: taskId,
      type: 'texture',
      status: 'queued',
      progress: 0,
      label: `Texture: ${material} ${resolution}px`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    toast.info('Texture generation started', { description: `Material: ${material} · ${resolution}px` });

    try {
      updateTask(taskId, { status: 'running', progress: 5 });
      const result = await generationService.startGeneration(
        config,
        (progress, status, log) => {
          updateTask(taskId, { progress, status: status as 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' });
          if (log && log !== `Processing... ${progress}%`) console.debug(log);
        },
        (backendId) => {
          // If we want to switch the UI to the new model immediately
          // we could update the store here, but typically we wait for completion
        },
      );
      completeTask(taskId, 'completed');
      toast.success('Texture generation complete');
      
      // Update the current job with the new textured model
      useGenerationStore.setState((s) => ({
        currentJob: s.currentJob ? { ...s.currentJob, result } : s.currentJob
      }));

    } catch (error) {
      completeTask(taskId, 'failed');
      toast.error('Texture generation failed', { description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Material Editor</h1>
        <p className="text-sm text-muted-foreground mt-1">PBR texture generation & material editing</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Preview */}
        <GlassCard className="lg:col-span-2 p-0 overflow-hidden min-h-[400px]" delay={0.05}>
          <div className="relative h-full aspect-video bg-surface-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--neon-purple)/0.05)] to-[hsl(var(--neon-cyan)/0.05)]" />
            
            <Canvas camera={{ position: [0, 2, 5], fov: 45 }} shadows gl={{ antialias: true, alpha: true }} className="w-full h-full relative z-10">
              <Suspense fallback={null}>
                <ViewerScene />
              </Suspense>
            </Canvas>

            {!currentJob?.result && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-3 bg-surface-1/50 backdrop-blur-md p-6 rounded-2xl border border-[hsl(var(--border)/0.5)]">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-surface-2/50 border border-[hsl(var(--border)/0.5)]">
                    <Palette className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-muted-foreground">Generate a model first to edit materials</p>
                </div>
              </div>
            )}

            <div className="absolute top-3 left-3 z-30 flex items-center gap-2 px-2.5 py-1 rounded-lg glass border border-[hsl(var(--border)/0.5)] pointer-events-none">
              <span className="text-xs font-mono text-muted-foreground">{resolution}×{resolution}</span>
            </div>
            <div className="absolute top-3 right-3 z-30 flex items-center gap-2 px-2.5 py-1 rounded-lg glass border border-[hsl(var(--border)/0.5)] pointer-events-none">
              <span className="text-xs text-muted-foreground">Layer:</span>
              <span className="text-xs font-medium text-foreground capitalize">{selectedLayer}</span>
            </div>
          </div>
        </GlassCard>

        {/* Material Layers */}
        <GlassCard className="p-4 sm:p-5" delay={0.1}>
          <h3 className="text-sm font-semibold mb-4">Texture Layers</h3>
          <div className="space-y-2">
            {MATERIAL_LAYERS.map((layer) => {
              const Icon = layer.icon;
              return (
                <button
                  key={layer.id}
                  onClick={() => setSelectedLayer(layer.id)}
                  className={cn(
                    'flex items-center gap-3 w-full p-3 rounded-xl border transition-all touch-target',
                    selectedLayer === layer.id
                      ? 'bg-[hsl(var(--neon-purple)/0.1)] border-[hsl(var(--neon-purple)/0.3)]'
                      : 'glass border-[hsl(var(--border)/0.5)] hover:border-[hsl(var(--border)/0.8)]',
                    !layer.enabled && 'opacity-50'
                  )}
                >
                  <Icon className={cn('w-4 h-4', layer.color)} />
                  <span className="text-sm font-medium text-foreground flex-1 text-left">{layer.label}</span>
                  {layer.enabled && <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-green))]" />}
                </button>
              );
            })}
          </div>
        </GlassCard>
      </div>

      {/* Property Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <GlassCard className="p-4 sm:p-5" delay={0.15}>
          <h3 className="text-sm font-semibold mb-4">Material Properties</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Material Type</label>
              <Select value={material} onValueChange={setMaterial}>
                <SelectTrigger className="w-full bg-surface-2/50 border-[hsl(var(--border)/0.5)]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (AI Generated)</SelectItem>
                  <SelectItem value="metal">Metal</SelectItem>
                  <SelectItem value="wood">Wood</SelectItem>
                  <SelectItem value="stone">Stone</SelectItem>
                  <SelectItem value="fabric">Fabric</SelectItem>
                  <SelectItem value="plastic">Plastic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Resolution</label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="w-full bg-surface-2/50 border-[hsl(var(--border)/0.5)]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1024">1024 × 1024</SelectItem>
                  <SelectItem value="2048">2048 × 2048</SelectItem>
                  <SelectItem value="4096">4096 × 4096</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">Roughness</label>
                <span className="text-xs font-mono text-foreground">{roughness}%</span>
              </div>
              <Slider value={[roughness]} min={0} max={100} onValueChange={(v) => setRoughness(v[0])} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">Metallic</label>
                <span className="text-xs font-mono text-foreground">{metallic}%</span>
              </div>
              <Slider value={[metallic]} min={0} max={100} onValueChange={(v) => setMetallic(v[0])} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">Normal Strength</label>
                <span className="text-xs font-mono text-foreground">{normalStrength}%</span>
              </div>
              <Slider value={[normalStrength]} min={0} max={200} onValueChange={(v) => setNormalStrength(v[0])} />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Tileable</label>
              <Switch checked={tileable} onCheckedChange={setTileable} className="data-[state=checked]:bg-[hsl(var(--neon-purple))]" />
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4 sm:p-5" delay={0.2}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Actions</h3>
            <NeonButton variant="primary" size="sm" onClick={handleGenerate}>
              <Sparkles className="w-3.5 h-3.5" />
              Generate
            </NeonButton>
          </div>
          <div className="space-y-3">
            {MATERIAL_LAYERS.filter((l) => l.enabled).map((layer, i) => {
              const Icon = layer.icon;
              return (
              <motion.div key={layer.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-3 p-3 rounded-xl glass border border-[hsl(var(--border)/0.3)]">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-2 shrink-0">
                    <Icon className={cn('w-4 h-4', layer.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{layer.label} Map</p>
                  <p className="text-xs text-muted-foreground">{resolution}×{resolution} · PNG</p>
                </div>
                <button className="p-1.5 rounded-lg hover:bg-[hsl(var(--surface-2))] text-muted-foreground hover:text-foreground touch-target">
                  <Download className="w-3.5 h-3.5" />
                </button>
              </motion.div>
              );
            })}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}