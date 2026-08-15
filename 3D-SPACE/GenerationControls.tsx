"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * File 3 — Generation + Controls UI
 * Model selector, text/image modes, prompt, upload, settings, progress, cancellation
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Sparkles, HelpCircle, Upload, X, Image as ImageIcon, Type,
  ChevronDown, ChevronRight, Loader2, Square, CircleDot, Settings2,
  RefreshCw, Palette, Activity, Lock, Zap, CheckCircle2,
  Maximize2, RotateCcw, AlertCircle, Info
} from 'lucide-react';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGeneration } from '@/hooks/useGeneration';
import { useRuntimeOptions } from '@/hooks/useBackendData';
import { uploadService, validateImageFile, processImageFile } from '@/services/uploadService';
import { QUALITY_PRESETS, STYLE_PRESETS, SUPPORTED_IMAGE_FORMATS, MAX_IMAGE_SIZE_MB } from '@/constants';
import { cn } from '@/lib/utils';
import { GlowRing } from '@/components/GlowRing';
import type { GenerationMode, QualityPreset, ProviderOption } from '@/types';
import { toast } from 'sonner';
import anime from 'animejs';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface GenerationControlsProps {
  onModelUploadClick?: () => void;
  compact?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Model capability helper                                           */
/* ------------------------------------------------------------------ */

function getCapabilityReason(model: ProviderOption | undefined, cap: 'texture' | 'remesh' | 'rigging' | 'animation'): string {
  if (!model?.available) return 'Model not installed';
  if (cap === 'texture' && !(model as any).supports_texture) return 'This model does not support texture generation';
  return 'Not supported by selected model';
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function GenerationControls({ onModelUploadClick, compact }: GenerationControlsProps) {
  const { options, loading: optionsLoading } = useRuntimeOptions();
  const { generate, cancel, isGenerating, currentJob } = useGeneration();
  const {
    mode, setMode, prompt, setPrompt, negativePrompt, setNegativePrompt,
    quality, setQuality, generateTexture, setGenerateTexture, autoRig, setAutoRig,
    uploadedImage, setUploadedImage, selectedModel, setSelectedModel,
    stylePreset, setStylePreset, steps, setSteps, cfgScale, setCfgScale,
  } = useGenerationStore();
  const { capabilities } = useUIStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNegPrompt, setShowNegPrompt] = useState(false);
  const [imgUploadProgress, setImgUploadProgress] = useState<{ loaded: number; total: number; percent: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Available 3D models from backend
  const models: ProviderOption[] = useMemo(() => options?.three_d_models ?? [], [options]);

  // Get selected model data
  const selectedModelData = useMemo(
    () => models.find((m) => m.id === selectedModel),
    [models, selectedModel]
  );

  // Check model capabilities
  const supportsTexture = (selectedModelData as any)?.supports_texture ?? true;
  const supportsTextTo3D = selectedModelData?.supports_text_to_3d ?? true;
  const supportsImageTo3D = selectedModelData?.supports_image_to_3d ?? true;

  // Auto-select first available model
  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      const first = models.find((m) => m.available);
      if (first) setSelectedModel(first.id);
    }
  }, [models, selectedModel, setSelectedModel]);

  // Progress display
  const progress = currentJob?.progress ?? 0;
  const statusLabel = currentJob?.status ?? 'idle';
  const elapsed = currentJob?.elapsedSeconds ?? 0;

  // Image upload handler with real progress
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateImageFile(file);
    if (error) { (await import('sonner')).toast.error(error); return; }
    
    // Reset progress and start upload
    setImgUploadProgress({ loaded: 0, total: file.size, percent: 0 });
    
try {
       const { promise, cancel } = uploadService.uploadWithProgress(
         file,
         (progress) => setImgUploadProgress(progress),
         '/api/v1/upload/image'
       );
       const result = await promise;
       setUploadedImage({ file, preview: URL.createObjectURL(file), width: result.width ?? 0, height: result.height ?? 0, url: result.url });
       setImgUploadProgress(null);
       (await import('sonner')).toast.success('Image uploaded successfully');
     } catch (err: any) {
       setImgUploadProgress(null);
       if (err.message === 'Upload cancelled') {
         (await import('sonner')).toast.info('Upload cancelled');
       } else {
         (await import('sonner')).toast.error(`Upload failed: ${err?.message || 'Unknown error'}`);
       }
     }
  }, [setUploadedImage]);

// Drag & drop for images
   const [imgDragOver, setImgDragOver] = useState(false);
   const handleImgDrop = useCallback(async (e: React.DragEvent) => {
     e.preventDefault(); e.stopPropagation(); setImgDragOver(false);
     
     // Check if it's a file drop
     const file = e.dataTransfer.files[0];
     if (file) {
       const error = validateImageFile(file);
       if (error) { (await import('sonner')).toast.error(error); return; }
       
       // Reset progress and start upload
       setImgUploadProgress({ loaded: 0, total: file.size, percent: 0 });
       
       try {
         const { promise, cancel } = uploadService.uploadWithProgress(
           file,
           (progress) => setImgUploadProgress(progress),
           '/api/v1/upload/image'
         );
         const result = await promise;
         setUploadedImage({ file, preview: URL.createObjectURL(file), width: result.width ?? 0, height: result.height ?? 0 });
         setImgUploadProgress(null);
         (await import('sonner')).toast.success('Image uploaded successfully');
       } catch (err: any) {
         setImgUploadProgress(null);
         if (err.message === 'Upload cancelled') {
           (await import('sonner')).toast.info('Upload cancelled');
         } else {
           (await import('sonner')).toast.error(`Upload failed: ${err?.message || 'Unknown error'}`);
         }
       }
       return;
     }
     
     // Check if it's a URL drop (from dragging image asset from asset panel)
     const url = e.dataTransfer.getData('text/plain');
     if (url) {
       // Validate that it's likely an image URL
       if (url.match(/\.(png|jpe?g|webp)$/i)) {
         try {
           // Create a temporary File object from the URL for processing
           const response = await fetch(url);
           if (!response.ok) throw new Error('Failed to fetch image');
           const blob = await response.blob();
           const file = new File([blob], 'asset-image.' + url.split('.').pop(), { type: response.headers.get('content-type') || 'image/png' });
           const img = await processImageFile(file);
           setUploadedImage(img);
         } catch (err) {
           const errorMessage = err instanceof Error ? err.message : 'Unknown error';
           (await import('sonner')).toast.error('Failed to process image from asset: ' + errorMessage);
         }
       } else {
         (await import('sonner')).toast.error('Invalid image URL');
       }
       return;
     }
   }, [setUploadedImage]);

  // Quality presets — driven by the shared QUALITY_PRESETS constant
  const qualityOptions: { id: QualityPreset; label: string; desc: string; credits: number }[] = QUALITY_PRESETS.map((p) => ({
    id: p.id,
    label: p.label,
    desc: p.time,
    credits: p.credits,
  }));

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--surface-1))] border-r border-[hsl(var(--border))] overflow-hidden">
      {/* Header */}
      <div className="p-4 pb-3 border-b border-[hsl(var(--border)/0.5)] shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xs font-black uppercase tracking-widest text-[hsl(var(--foreground))]">Model Generation</h2>
          <button className="p-1 rounded hover:bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] transition-colors" title="Help">
            <HelpCircle size={14} />
          </button>
        </div>
        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Generate 3D model from text or image</p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* Mode toggle */}
        <div className="flex gap-1 p-1 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)]">
          <button
            onClick={() => setMode('text-to-3d')}
            disabled={!supportsTextTo3D}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all',
              mode === 'text-to-3d'
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--foreground))] shadow-lg shadow-[hsl(var(--primary))/0.2]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
              !supportsTextTo3D && 'opacity-40 cursor-not-allowed'
            )}
          >
            <Type size={12} /> Text → 3D
          </button>
          <button
            onClick={() => setMode('image-to-3d')}
            disabled={!supportsImageTo3D}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all',
              mode === 'image-to-3d'
                ? 'bg-[hsl(var(--primary))] text-[hsl(var(--foreground))] shadow-lg shadow-[hsl(var(--primary))/0.2]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
              !supportsImageTo3D && 'opacity-40 cursor-not-allowed'
            )}
          >
            <ImageIcon size={12} /> Image → 3D
          </button>
        </div>

        {/* Model selector */}
        <div className="space-y-1.5">
          <label className="text-label">Model</label>
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="select-field-sm w-full"
            >
              <option value="">Select model...</option>
              {models.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.available}>
                  {m.label} {!m.available ? '(Not installed)' : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] pointer-events-none" />
          </div>
          {selectedModelData && (
            <div className="flex items-center gap-1.5">
              {selectedModelData.available ? (
                <span className="flex items-center gap-1 text-[9px] text-[hsl(var(--neon-green))] font-bold">
                  <CheckCircle2 size={10} /> Ready
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[9px] text-[hsl(var(--neon-amber))] font-bold">
                  <Loader2 size={10} className="animate-spin" /> Not installed
                </span>
              )}
              {selectedModelData.vram_required_mb && (
                <span className="text-[8px] text-[hsl(var(--muted-foreground))]/60 font-mono">
                  ~{selectedModelData.vram_required_mb > 1024 ? `${(selectedModelData.vram_required_mb / 1024).toFixed(1)}GB` : `${selectedModelData.vram_required_mb}MB`} VRAM
                </span>
              )}
            </div>
          )}
        </div>

        {/* Text → 3D: Prompt */}
        {mode === 'text-to-3d' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-label">Prompt</label>
              <span className="text-[8px] font-mono text-[hsl(var(--muted-foreground))]/50">{prompt.length}/1000</span>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the 3D model you want to generate..."
              rows={4}
              maxLength={1000}
              className="textarea-field w-full resize-none"
            />
          </div>
        )}

        {/* Image → 3D: Image upload */}
        {mode === 'image-to-3d' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                Reference Image
              </label>
              {uploadedImage && (
                <span className="text-[8px] font-mono text-[hsl(var(--neon-green))] flex items-center gap-1">
                  <CheckCircle2 size={10} /> Loaded
                </span>
              )}
              {imgUploadProgress && (
                <span className="text-[8px] font-mono text-[hsl(var(--neon-blue))] flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> {imgUploadProgress.percent}%
                </span>
              )}
            </div>

            {imgUploadProgress && (
              <div className="w-full h-1.5 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[hsl(var(--neon-blue))] to-[hsl(var(--neon-cyan))] rounded-full transition-all duration-300"
                  style={{ width: `${imgUploadProgress.percent}%` }}
                />
              </div>
            )}

            {uploadedImage ? (
              <div className="group relative rounded-xl overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] transition-all shadow-inner">
                <img src={uploadedImage.preview} alt="Reference" className="w-full aspect-video object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                  <div className="flex justify-end">
                    <button
                      onClick={(e) => { e.stopPropagation(); setUploadedImage(null); }}
                      className="p-1 rounded-md bg-black/60 hover:bg-[hsl(var(--destructive))] text-[hsl(var(--foreground))] transition-all backdrop-blur-sm"
                      title="Remove image"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[8px] text-[hsl(var(--muted-foreground))]">
                    <span className="font-mono truncate max-w-[140px]">{uploadedImage.file?.name || 'reference_image'}</span>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2 py-0.5 rounded bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-2))] backdrop-blur font-bold uppercase transition-all"
                    >
                      Replace
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  'relative group overflow-hidden rounded-xl border border-dashed transition-all duration-200 cursor-pointer p-4',
                  imgDragOver
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))/0.08] shadow-[0_0_20px_hsl(var(--primary)/0.15)] scale-[0.99]'
                    : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)] bg-gradient-to-b from-[hsl(var(--surface-2)/0.6)] to-[hsl(var(--surface-2)/0.2)]'
                )}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleImgDrop}
                onDragOver={(e) => { e.preventDefault(); setImgDragOver(true); }}
                onDragLeave={() => setImgDragOver(false)}
              >
                <div className="flex flex-col items-center justify-center text-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-[hsl(var(--surface-3))] border border-[hsl(var(--border)/0.6)] flex items-center justify-center text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] group-hover:border-[hsl(var(--primary)/0.4)] group-hover:scale-105 transition-all shadow-sm">
                    <Upload size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
                      Choose reference image
                    </p>
                    <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-0.5">
                      Drag &amp; drop or browse
                    </p>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {['PNG', 'JPG', 'WEBP'].map((fmt) => (
                      <span key={fmt} className="px-1.5 py-0.5 rounded text-[7px] font-mono font-bold bg-[hsl(var(--surface-3))] border border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))]">
                        {fmt}
                      </span>
                    ))}
                    <span className="text-[8px] text-[hsl(var(--muted-foreground))]/60 ml-1">
                      Max {MAX_IMAGE_SIZE_MB}MB
                    </span>
                  </div>
                </div>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept={SUPPORTED_IMAGE_FORMATS.join(',')} className="hidden" onChange={handleImageUpload} />
          </div>
        )}

        {/* Negative prompt (collapsible) */}
        {mode === 'text-to-3d' && (
          <div>
            <button
              onClick={() => setShowNegPrompt(!showNegPrompt)}
              className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors w-full"
            >
              {showNegPrompt ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              Negative Prompt
            </button>
            {showNegPrompt && (
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="Things to avoid in the generation..."
                rows={2}
                maxLength={1000}
                className="mt-1.5 w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-lg px-3 py-2 text-[11px] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-all resize-none"
              />
            )}
          </div>
        )}

        {/* Quality */}
        <div className="space-y-1.5">
          <label className="text-[9px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Quality</label>
          <div className="flex gap-1.5">
            {qualityOptions.map((q) => (
              <button
                key={q.id}
                onClick={() => setQuality(q.id)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg border transition-all',
                  quality === q.id
                    ? 'bg-[hsl(var(--primary))/0.1] text-[hsl(var(--primary))] border-[hsl(var(--primary))/0.3]'
                    : 'bg-transparent text-[hsl(var(--muted-foreground))] border-[hsl(var(--border)/0.5)] hover:text-[hsl(var(--foreground))]',
                  isGenerating && 'opacity-50 pointer-events-none'
                )}
                disabled={isGenerating}
              >
                <span className="text-[10px] font-bold">{q.label}</span>
                <span className="text-[7px] opacity-60">{q.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Geometry detail slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Geometry Detail</label>
            <span className="text-[9px] font-mono text-[hsl(var(--foreground))]">{(cfgScale / 10).toFixed(1)}</span>
          </div>
          <input
            type="range" min="1" max="15" step="1"
            value={cfgScale}
            onChange={(e) => setCfgScale(Number(e.target.value))}
            className="w-full h-1 rounded-full appearance-none cursor-pointer bg-[hsl(var(--surface-3))]
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--primary))] [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-[hsl(var(--primary))/0.3]"
          />
        </div>

        {/* Advanced Settings (collapsible) */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors w-full"
          >
            {showAdvanced ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Advanced Settings
          </button>
          {showAdvanced && (
            <div className="mt-2 space-y-3 p-3 rounded-xl bg-[hsl(var(--surface-2))/0.5] border border-[hsl(var(--border)/0.3)]">
              {/* Style preset */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Style</label>
<div className="relative">
              <select
                value={stylePreset}
                onChange={(e) => setStylePreset(e.target.value)}
                className="select-field-sm w-full"
              >
                {STYLE_PRESETS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] pointer-events-none" />
            </div>
              </div>

              {/* Generate Texture toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Palette size={12} className="text-[hsl(var(--muted-foreground))]" />
                  <span className="text-[10px] font-semibold text-[hsl(var(--foreground))]">Generate Texture</span>
                </div>
                <button
                  onClick={() => setGenerateTexture(!generateTexture)}
                  disabled={!supportsTexture}
                  className={cn(
                    'w-8 h-4 rounded-full transition-all relative',
                    generateTexture ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-3))]',
                    !supportsTexture && 'opacity-40 cursor-not-allowed'
                  )}
                  title={!supportsTexture ? getCapabilityReason(selectedModelData, 'texture') : undefined}
                >
                  <div className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-[hsl(var(--surface-2))] shadow transition-all', generateTexture ? 'left-4.5' : 'left-0.5')} />
                </button>
              </div>

              {/* Auto Rig toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Activity size={12} className="text-[hsl(var(--muted-foreground))]" />
                  <span className="text-[10px] font-semibold text-[hsl(var(--foreground))]">Auto Rig</span>
                </div>
                <button
                  onClick={() => setAutoRig(!autoRig)}
                  disabled={!capabilities.riggingAnimation}
                  className={cn(
                    'w-8 h-4 rounded-full transition-all relative',
                    autoRig ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-3))]',
                    !capabilities.riggingAnimation && 'opacity-40 cursor-not-allowed'
                  )}
                  title={!capabilities.riggingAnimation ? 'Rigging not available' : undefined}
                >
                  <div className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-[hsl(var(--surface-2))] shadow transition-all', autoRig ? 'left-4.5' : 'left-0.5')} />
                </button>
              </div>

              {/* Steps */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Steps</label>
                  <span className="text-[9px] font-mono text-[hsl(var(--foreground))]">{steps}</span>
                </div>
                <input
                  type="range" min="10" max="100" step="5"
                  value={steps}
                  onChange={(e) => setSteps(Number(e.target.value))}
                  className="w-full h-1 rounded-full appearance-none cursor-pointer bg-[hsl(var(--surface-3))]
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[hsl(var(--primary))]"
                />
              </div>

              {/* Seed */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Seed (optional)</label>
                <input
                  type="text"
                  value={useGenerationStore.getState().seed}
                  onChange={(e) => useGenerationStore.getState().setSeed(e.target.value)}
                  placeholder="Random"
                  className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-lg px-3 py-1.5 text-[11px] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/40 focus:outline-none focus:border-[hsl(var(--primary))] transition-all font-mono"
                />
              </div>
            </div>
          )}
        </div>

      
      </div>

      {/* Footer: Generate button + progress */}
      <div className="p-4 pt-3 border-t border-[hsl(var(--border)/0.5)] shrink-0 space-y-3">
        {/* Progress bar during generation */}
        {isGenerating && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                {statusLabel === 'queued' ? 'Queued' : statusLabel === 'uploading' ? 'Uploading...' : statusLabel === 'generating' ? 'Generating...' : statusLabel === 'texturing' ? 'Texturing...' : statusLabel === 'rigging' ? 'Rigging...' : statusLabel}
              </span>
              <span className="text-[9px] font-mono text-[hsl(var(--foreground))]">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-1.5 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-cyan))] rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-mono text-[hsl(var(--muted-foreground))]/50">Elapsed: {elapsed}s</span>
              <button
                onClick={cancel}
                className="text-[9px] font-bold text-[hsl(var(--destructive))] hover:underline"
              >Cancel</button>
            </div>
          </div>
        )}

        {/* Generate button (wrapped in rotating glow ring) */}
        <button
          onClick={() => generate()}
          disabled={isGenerating || (!prompt.trim() && mode === 'text-to-3d') || (!uploadedImage && mode === 'image-to-3d')}
          className={cn(
            'w-full btn-primary',
            isGenerating && 'cursor-not-allowed opacity-50'
          )}
        >
          {isGenerating ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Generating...
            </>
          ) : (
            <>
              <Sparkles size={14} /> Generate 3D Model
            </>
          )}
        </button>

        {/* Estimated info — sourced from QUALITY_PRESETS constant */}
        <div className="flex items-center justify-between text-[8px] text-[hsl(var(--muted-foreground))]/50">
          <span className="font-mono">Est. {qualityOptions.find((q) => q.id === quality)?.desc ?? '—'}</span>
          <span className="font-mono">~{qualityOptions.find((q) => q.id === quality)?.credits ?? '—'} credits</span>
        </div>
      </div>
    </div>
  );
}
