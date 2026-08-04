"use client";

import React, { useState, useEffect } from 'react';
import { useRuntimeOptions, useSystemSettings } from '@/hooks/useBackendData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/premium/Spinner';
import { Cpu, Sliders, Box, Layers, Save, Check } from 'lucide-react';
import { runtimeService } from '@/services/runtimeService';
import { toast } from 'sonner';
import { useAutoSave } from '@/hooks/useAutoSave';

export function GenerationSection() {
  const { options, loading: optionsLoading, error: optionsError } = useRuntimeOptions();
  const { settings, loading: settingsLoading } = useSystemSettings();

  const [provider, setProvider] = useState<string>('');
  const [quality, setQuality] = useState<string>('high');
  const [outputFormat, setOutputFormat] = useState<string>('glb');
  const [resolution, setResolution] = useState<string>('1024');
  const [steps, setSteps] = useState<number>(30);
  const [saving, setSaving] = useState(false);

  const { Indicator } = useAutoSave({ provider, quality, outputFormat, resolution, steps }, async (data) => {
    if (!data.provider) return;
    try {
      const config = {
        rigging_provider: data.provider,
        render_quality: data.quality,
        output_format: data.outputFormat,
        resolution: data.resolution,
      };
      localStorage.setItem('generationSettings', JSON.stringify(data));
      await runtimeService.updateConfig(config);
    } catch {
      // Fallback: just local storage
    }
  }, 1000, true);

  const providersList = options?.three_d_models || options?.providers || [
    { id: 'triposr', label: 'TripoSR (Fast)' },
    { id: 'hunyuan3d-1.0', label: 'HunYuan 3D' },
    { id: 'trellis', label: 'Trellis' },
  ];

  useEffect(() => {
    const savedGen = localStorage.getItem('generationSettings');
    if (savedGen) {
      try {
        const parsed = JSON.parse(savedGen);
        if (parsed.provider) setProvider(parsed.provider);
        if (parsed.quality) setQuality(parsed.quality);
        if (parsed.outputFormat) setOutputFormat(parsed.outputFormat);
        if (parsed.resolution) setResolution(parsed.resolution);
        if (parsed.steps) setSteps(parsed.steps);
      } catch { /* ignore */ }
    } else if (settings?.default_provider || options?.active_provider) {
      setProvider(settings?.default_provider || options?.active_provider || 'triposr');
    }
  }, [settings, options]);

  if (optionsLoading || settingsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Indicator />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generation Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure default AI models, output formats, and generation parameters.
        </p>
      </div>

      {/* AI Provider */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Cpu className="w-5 h-5 text-[hsl(var(--neon-amber))]" />
            Default 3D Model Provider
          </CardTitle>
          <CardDescription>Select the primary model engine for text-to-3D and image-to-3D generation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <select
            value={provider || (providersList[0]?.id || '')}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--neon-amber))]"
          >
            {providersList.map((p: any) => (
              <option key={p.id || p.name} value={p.id || p.name}>
                {p.label || p.name || p.id} {p.vram_required_mb ? `(${Math.round(p.vram_required_mb / 1024)}GB VRAM)` : ''}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Output Format & Quality */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Box className="w-5 h-5 text-blue-400" />
            Output Format & Quality
          </CardTitle>
          <CardDescription>Specify standard 3D export file formats and render target resolution.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Export Mesh Format</label>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground"
            >
              <option value="glb">GLTF / GLB (Recommended for Web/Three.js)</option>
              <option value="obj">OBJ + MTL (Legacy 3D Editors)</option>
              <option value="fbx">FBX (Unreal / Unity / Maya)</option>
              <option value="usdz">USDZ (Apple AR / iOS)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Texture Resolution</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground"
            >
              <option value="512">512 x 512 (Fast Preview)</option>
              <option value="1024">1024 x 1024 (Standard HD)</option>
              <option value="2048">2048 x 2048 (Ultra High Detail)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Sampling Steps & Preset */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Sliders className="w-5 h-5 text-emerald-400" />
            Inference & Sampling Parameters
          </CardTitle>
          <CardDescription>Control quality vs speed trade-offs during diffusion generation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">Inference Steps: {steps}</label>
              <span className="text-xs text-muted-foreground">Higher = Higher fidelity (longer render time)</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              className="w-full accent-[hsl(var(--neon-amber))]"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-3 block">Quality Preset</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {['low', 'medium', 'high', 'ultra'].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  className={`px-4 py-2.5 rounded-lg border text-sm font-medium capitalize transition-all ${
                    quality === q
                      ? 'bg-[hsl(var(--neon-amber))] text-black border-[hsl(var(--neon-amber))] font-bold shadow-md'
                      : 'bg-background border-input hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
