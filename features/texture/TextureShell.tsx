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

export function TextureShell() {
  const [selectedLayer, setSelectedLayer] = useState('albedo');
  const [roughness, setRoughness] = useState(50);
  const [metallic, setMetallic] = useState(20);
  const [normalStrength, setNormalStrength] = useState(75);
  const [tileable, setTileable] = useState(true);
  const [resolution, setResolution] = useState('2048');
  const [material, setMaterial] = useState('auto');
  const { reconnectToRunningTasks, registerTask, updateTask, completeTask } = useTaskManager();

  useEffect(() => {
    reconnectToRunningTasks();
  }, [reconnectToRunningTasks]);

  const handleGenerate = async () => {
    const store = useGenerationStore.getState();
    const prompt = store.prompt || 'Generate PBR texture set for current model';

    const config: GenerationConfig = {
      mode: 'texture-generation' as GenerationConfig['mode'],
      prompt,
      negativePrompt: store.negativePrompt,
      quality: store.quality,
      generateTexture: true,
      autoRig: false,
      model: store.selectedModel,
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
      await generationService.startGeneration(
        config,
        (progress, status, log) => {
          updateTask(taskId, { progress, status: status as 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' });
          if (log && log !== `Processing... ${progress}%`) console.debug(log);
        },
        () => {},
      );
      completeTask(taskId, 'completed');
      toast.success('Texture generation complete');
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
        <GlassCard className="lg:col-span-2 p-0 overflow-hidden" delay={0.05}>
          <div className="relative aspect-video bg-surface-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--neon-purple)/0.05)] to-[hsl(var(--neon-cyan)/0.05)]" />
            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-2/50 border border-[hsl(var(--border)/0.5)]">
                <Palette className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">Material preview</p>
            </div>
            <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-lg glass border border-[hsl(var(--border)/0.5)]">
              <span className="text-xs font-mono text-muted-foreground">{resolution}×{resolution}</span>
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-2 px-2.5 py-1 rounded-lg glass border border-[hsl(var(--border)/0.5)]">
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
                <button className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground touch-target">
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