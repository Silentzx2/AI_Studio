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
  Maximize2, RotateCcw, AlertCircle, Info, Layers
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
    lowVram, setLowVram,
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
    <div className="flex flex-col h-full bg-tripo-gray-2 text-white overflow-hidden text-xs">
      {/* Tripo Header */}
      <div className="p-3.5 pb-2.5 border-b border-tripo-white-5 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-tripo-yellow-1 fill-tripo-yellow-1" />
            <h2 className="text-xs font-bold tracking-tight text-white">Generate Model</h2>
          </div>
          <button className="p-1 rounded-lg hover:bg-tripo-white-5 text-tripo-gray-400 hover:text-white transition-colors" title="Generation Guide">
            <HelpCircle size={14} />
          </button>
        </div>

        {/* HD Model / Smart Mesh Pill Toggle */}
        <div className="flex p-0.5 rounded-xl bg-tripo-gray-3 border border-tripo-white-5">
          <button
            onClick={() => setMode('image-to-3d')}
            className={cn(
              "flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
              mode === 'image-to-3d'
                ? "bg-white text-black shadow-sm"
                : "text-tripo-gray-300 hover:text-white"
            )}
          >
            HD Model
          </button>
          <button
            onClick={() => setMode('text-to-3d')}
            className={cn(
              "flex-1 py-1 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 cursor-pointer",
              mode === 'text-to-3d'
                ? "bg-white text-black font-bold shadow-sm"
                : "text-tripo-gray-300 hover:text-white"
            )}
          >
            <span>Smart Mesh</span>
            <Zap size={11} className="text-tripo-yellow-1 fill-tripo-yellow-1" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {/* Upload & Prompt Container Card with Purple Glow */}
        <div className="rounded-2xl p-2.5 bg-tripo-gray-3/80 border border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.12)] flex flex-col gap-2.5">
          {/* Mode Sub-Icons Bar (Image, 3D, Multi-view, Text) */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-tripo-gray-4 border border-tripo-white-5">
            <button
              onClick={() => setMode('image-to-3d')}
              className={cn(
                "flex-1 py-1 rounded-lg flex items-center justify-center gap-1 text-[11px] font-semibold transition-all cursor-pointer",
                mode === 'image-to-3d'
                  ? "bg-white text-black shadow font-bold"
                  : "text-tripo-gray-300 hover:text-white"
              )}
              title="Image to 3D"
            >
              <ImageIcon size={13} />
              <span>Image</span>
            </button>
            <button
              onClick={() => setMode('text-to-3d')}
              className={cn(
                "flex-1 py-1 rounded-lg flex items-center justify-center gap-1 text-[11px] font-semibold transition-all cursor-pointer",
                mode === 'text-to-3d'
                  ? "bg-white text-black shadow font-bold"
                  : "text-tripo-gray-300 hover:text-white"
              )}
              title="Text to 3D"
            >
              <Type size={13} />
              <span>Text</span>
            </button>
            <button
              onClick={() => {
                setMode('image-to-3d');
                toast.info('Multi-view mode active');
              }}
              className="flex-1 py-1 rounded-lg flex items-center justify-center gap-1 text-[11px] text-tripo-gray-400 hover:text-white transition-colors cursor-pointer"
              title="Multi-view 3D"
            >
              <Layers size={13} />
              <span>Multi-view</span>
            </button>
          </div>

          {/* Mode Content: Text Prompt */}
          {mode === 'text-to-3d' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-tripo-gray-300 uppercase tracking-wider">Prompt</label>
                <span className="text-[9px] font-mono text-tripo-gray-500">{prompt.length}/1000</span>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your 3D model (e.g. Cyberpunk samurai helmet, realistic details)..."
                rows={3}
                maxLength={1000}
                className="w-full bg-tripo-gray-4 border border-tripo-white-10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-tripo-gray-500 focus:outline-none focus:border-tripo-yellow-1 transition-all resize-none"
              />
            </div>
          )}

          {/* Mode Content: Image Upload */}
          {mode === 'image-to-3d' && (
            <div className="space-y-2">
              {imgUploadProgress && (
                <div className="w-full h-1.5 bg-tripo-gray-4 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-tripo-yellow-1 to-amber-400 rounded-full transition-all duration-300"
                    style={{ width: `${imgUploadProgress.percent}%` }}
                  />
                </div>
              )}

              {uploadedImage ? (
                <div className="group relative rounded-xl overflow-hidden border border-tripo-white-10 bg-tripo-gray-4 transition-all">
                  <img src={uploadedImage.preview} alt="Reference" className="w-full aspect-video object-cover" />
                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                    <div className="flex justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); setUploadedImage(null); }}
                        className="p-1 rounded-md bg-black/80 hover:bg-red-500 text-white transition-all"
                        title="Remove image"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-tripo-gray-300">
                      <span className="font-mono truncate max-w-[130px]">{uploadedImage.file?.name || 'reference'}</span>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2 py-0.5 rounded bg-tripo-yellow-1 text-black font-bold text-[10px]"
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
                      ? 'border-tripo-yellow-1 bg-tripo-yellow-1/10 scale-[0.99]'
                      : 'border-tripo-white-10 hover:border-purple-400/60 bg-tripo-gray-4/50'
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleImgDrop}
                  onDragOver={(e) => { e.preventDefault(); setImgDragOver(true); }}
                  onDragLeave={() => setImgDragOver(false)}
                >
                  <div className="flex flex-col items-center justify-center text-center gap-1.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-300 group-hover:scale-105 transition-all shadow-sm">
                      <Upload size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white group-hover:text-tripo-yellow-1 transition-colors">
                        Upload
                      </p>
                      <p className="text-[9.5px] text-tripo-gray-400 mt-0.5">
                        JPG, PNG, WEBP Size ≤ 20MB
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept={SUPPORTED_IMAGE_FORMATS.join(',')} className="hidden" onChange={handleImageUpload} />

              <button
                type="button"
                onClick={() => {
                  setMode('text-to-3d');
                  toast.info('Switched to prompt generation mode');
                }}
                className="w-full text-center text-[10px] text-purple-300 hover:text-purple-200 font-medium py-1 transition-colors"
              >
                Generate Image for 3D &gt;
              </button>
            </div>
          )}
        </div>

        {/* General Settings Accordion */}
        <div className="rounded-xl bg-tripo-gray-3 border border-tripo-white-5 p-2.5">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-xs font-bold text-tripo-gray-200 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Settings2 size={13} className="text-tripo-yellow-1" />
              General Settings
            </span>
            <span className="text-[10px] font-normal text-tripo-gray-400 flex items-center gap-1">
              Geometry &amp; Texture &gt;
            </span>
          </button>

          {showAdvanced && (
            <div className="mt-2.5 pt-2.5 border-t border-tripo-white-5 space-y-2.5">
              {/* Quality options */}
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-tripo-gray-400">Quality Preset</label>
                <div className="grid grid-cols-3 gap-1">
                  {qualityOptions.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => setQuality(q.id)}
                      className={cn(
                        'py-1 px-1 rounded-lg text-center text-[10px] font-bold border transition-all cursor-pointer',
                        quality === q.id
                          ? 'bg-tripo-yellow-1 text-black border-tripo-yellow-1'
                          : 'bg-tripo-gray-4 text-tripo-gray-300 border-tripo-white-5 hover:text-white'
                      )}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Geometry detail slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-tripo-gray-400">Geometry Detail</span>
                  <span className="font-mono text-tripo-yellow-1 font-bold">{(cfgScale / 10).toFixed(1)}</span>
                </div>
                <input
                  type="range" min="1" max="15" step="1"
                  value={cfgScale}
                  onChange={(e) => setCfgScale(Number(e.target.value))}
                  className="w-full h-1 bg-tripo-gray-4 rounded-full appearance-none cursor-pointer accent-tripo-yellow-1"
                />
              </div>

              {/* Texture & Rigging toggles */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-tripo-gray-300 font-medium">Generate Texture</span>
                <button
                  onClick={() => setGenerateTexture(!generateTexture)}
                  className={cn(
                    'w-7 h-4 rounded-full transition-colors relative cursor-pointer',
                    generateTexture ? 'bg-tripo-yellow-1' : 'bg-tripo-gray-4'
                  )}
                >
                  <div className={cn(
                    'w-3 h-3 rounded-full transition-all absolute top-0.5',
                    generateTexture ? 'right-0.5 bg-black' : 'left-0.5 bg-tripo-gray-300'
                  )} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Members Only Features Card */}
        <div className="rounded-xl bg-tripo-gray-3 border border-tripo-white-5 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
            <Sparkles size={12} className="fill-amber-300" />
            <span>Members Only</span>
          </div>

          <div className="space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between text-tripo-gray-300">
              <span>Generate in Parts</span>
              <span className="text-[9px] text-amber-300 font-semibold bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">Trial x1</span>
            </div>
            <div className="flex items-center justify-between text-tripo-gray-300">
              <span>8K Texture</span>
              <span className="text-[9px] text-amber-300 font-semibold bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">Trial x1</span>
            </div>
            <div className="flex items-center justify-between text-tripo-gray-300">
              <span>Privacy</span>
              <span className="text-[9px] text-tripo-gray-400">Public</span>
            </div>
          </div>
        </div>

        {/* AI Model Selector */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-tripo-gray-400 uppercase tracking-wider">AI Model</label>
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-tripo-gray-3 border border-tripo-white-10 rounded-xl px-3 py-2 text-xs text-white appearance-none cursor-pointer focus:outline-none focus:border-tripo-yellow-1"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.available}>
                  👍 {m.label} {m.available ? '(Best Quality)' : '(Not installed)'}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-tripo-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Footer: Big Yellow Generate Button + Live Progress */}
      <div className="p-3 pt-2 border-t border-tripo-white-5 shrink-0 space-y-2 bg-tripo-gray-2">
        {/* Progress bar during generation */}
        {isGenerating && (
          <div className="space-y-1.5 bg-tripo-gray-3 p-2 rounded-xl border border-tripo-white-5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-bold text-tripo-yellow-1 uppercase tracking-wider">
                {statusLabel === 'queued' ? 'Queued...' : statusLabel === 'generating' ? 'Generating 3D...' : statusLabel}
              </span>
              <span className="font-mono text-white font-bold">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-1.5 bg-tripo-gray-4 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-tripo-yellow-1 to-amber-400 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[9px] text-tripo-gray-400">
              <span>Time: {elapsed}s</span>
              <button onClick={cancel} className="text-red-400 hover:underline font-bold">Cancel</button>
            </div>
          </div>
        )}

        {/* Tripo-style Bright Yellow Generate Button */}
        <button
          onClick={() => generate()}
          disabled={isGenerating || (!prompt.trim() && mode === 'text-to-3d') || (!uploadedImage && mode === 'image-to-3d')}
          className={cn(
            'w-full py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98]',
            isGenerating || (!prompt.trim() && mode === 'text-to-3d') || (!uploadedImage && mode === 'image-to-3d')
              ? 'bg-tripo-yellow-1/40 text-black/50 cursor-not-allowed'
              : 'bg-tripo-yellow-1 hover:bg-yellow-400 text-black shadow-yellow-500/20 hover:scale-[1.01]'
          )}
          id="btn-generate-3d-model"
        >
          {isGenerating ? (
            <>
              <Loader2 size={15} className="animate-spin text-black" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Zap size={14} className="fill-black text-black" />
              <span>Generate ⚡ 55</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
