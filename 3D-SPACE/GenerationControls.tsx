"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * File 3 — Generation + Controls UI
 * Model selector, text/image modes, prompt, upload, settings, progress, cancellation
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  Sparkles, HelpCircle, Upload, X, Image as ImageIcon, Type,
  ChevronDown, ChevronRight, Loader2, Square, CircleDot, Settings2,
  RefreshCw, Palette, Activity, Lock, Zap, CheckCircle2, ListOrdered,
  Plus, Play, Pause, Trash2, AlertCircle, Box, Scissors, Layers,
  Globe, Info, FileCode, Monitor, Pencil, ImagePlus
} from 'lucide-react';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useUIStore } from '@/stores/useUIStore';
import { useAppStore } from '@/stores/useAppStore';
import { useGeneration } from '@/hooks/useGeneration';
import { useRuntimeOptions } from '@/hooks/useBackendData';
import { uploadService, validateImageFile } from '@/services/uploadService';
import { QUALITY_PRESETS, STYLE_PRESETS, SUPPORTED_IMAGE_FORMATS, MAX_IMAGE_SIZE_MB } from '@/constants';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { GlowRing } from '@/components/GlowRing';
import type { GenerationMode, QualityPreset, ProviderOption, UploadedImage } from '@/types';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ViewType = 'front' | 'left' | 'right' | 'back';
type SidebarTab = 'image' | 'model' | 'segment' | 'retopo' | 'texture' | 'animate';

interface UploadProgressState {
  view: ViewType | 'model';
  percent: number;
  loaded: number;
  total: number;
  cancel?: () => void;
}

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
    selectedModel, setSelectedModel,
    stylePreset, setStylePreset, steps, setSteps, cfgScale, setCfgScale,
    hdMode, setHDMode, multiViewImages, setMultiViewImage, referenceModel, setReferenceModel
  } = useGenerationStore();

  const [activeTab, setActiveTab] = useState<SidebarTab>('model');
  const [uploading, setUploading] = useState<UploadProgressState | null>(null);

  const batchGenerationEnabled = useAppStore((s) => s.batchGenerationEnabled);
  const setBatchGenerationEnabled = useAppStore((s) => s.setBatchGenerationEnabled);
  const batchQueue = useAppStore((s) => s.batchQueue);
  const addToBatchQueue = useAppStore((s) => s.addToBatchQueue);
  const removeFromBatchQueue = useAppStore((s) => s.removeFromBatchQueue);
  const clearBatchQueue = useAppStore((s) => s.clearBatchQueue);
  const updateBatchItem = useAppStore((s) => s.updateBatchItem);

  const { capabilities } = useUIStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNegPrompt, setShowNegPrompt] = useState(false);
  const [batchInputText, setBatchInputText] = useState('');
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

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

  // Batch queue computation
  const totalBatchItems = batchQueue.length;
  const completedBatchItems = batchQueue.filter(i => i.status === 'completed').length;
  const failedBatchItems = batchQueue.filter(i => i.status === 'failed').length;
  const pendingBatchItems = batchQueue.filter(i => i.status === 'queued').length;
  const overallBatchProgress = totalBatchItems > 0
    ? Math.round(((completedBatchItems + (isGenerating ? (progress / 100) : 0)) / totalBatchItems) * 100)
    : 0;

  // Handle adding items to batch queue
  const handleAddPromptToBatch = () => {
    const raw = batchInputText.trim() || prompt.trim();
    if (!raw) {
      toast.error('Please enter at least one prompt to queue');
      return;
    }
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    addToBatchQueue(lines);
    setBatchInputText('');
    setPrompt('');
    toast.success(`Queued ${lines.length} prompt(s) for batch generation`);
  };

  // Consecutive Batch Runner
  const runNextBatchItem = useCallback(async () => {
    if (!isBatchRunning) return;
    const nextItemIndex = batchQueue.findIndex(item => item.status === 'queued');
    if (nextItemIndex === -1) {
      setIsBatchRunning(false);
      toast.success('Batch generation complete!', {
        description: `Successfully processed ${completedBatchItems} model(s).`
      });
      return;
    }

    const nextItem = batchQueue[nextItemIndex];
    setCurrentBatchIndex(nextItemIndex);
    updateBatchItem(nextItem.id, { status: 'running', startedAt: new Date(), progress: 5 });
    setPrompt(nextItem.prompt);

    try {
      await generate();
      updateBatchItem(nextItem.id, { status: 'completed', progress: 100, completedAt: new Date() });
    } catch (err: any) {
      updateBatchItem(nextItem.id, { status: 'failed', error: err?.message || 'Generation failed' });
    }
  }, [isBatchRunning, batchQueue, completedBatchItems, generate, setPrompt, updateBatchItem]);

  useEffect(() => {
    if (isBatchRunning && !isGenerating) {
      const timer = setTimeout(() => {
        runNextBatchItem();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isBatchRunning, isGenerating, runNextBatchItem]);

  const handleStartBatch = () => {
    if (batchQueue.length === 0) {
      toast.error('Queue is empty. Add prompts to start batch generation.');
      return;
    }
    setIsBatchRunning(true);
    toast.info('Starting batch queue pipelining...');
  };

  const handlePauseBatch = () => {
    setIsBatchRunning(false);
    toast.info('Batch queue paused');
  };

  // Improved Image upload handler with real progress
  const handleViewUpload = useCallback(async (view: ViewType, file: File) => {
    const error = validateImageFile(file);
    if (error) { toast.error(error); return; }

    const { promise, cancel } = uploadService.uploadWithProgress(
      file,
      (p) => setUploading({ view, ...p, cancel }),
      '/api/v1/upload/image'
    );

    try {
      const result = await promise;
      const img: UploadedImage = {
        file,
        preview: result.url,
        width: result.width || 0,
        height: result.height || 0,
      };
      setMultiViewImage(view, img);
      toast.success(`${view.charAt(0).toUpperCase() + view.slice(1)} view uploaded`);
    } catch (err: any) {
      if (err.message !== 'Upload cancelled') {
        toast.error(`Upload failed: ${err.message}`);
      }
    } finally {
      setUploading(null);
    }
  }, [setMultiViewImage]);

  // Model file upload handler with real progress
  const handleModelUpload = useCallback(async (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const supported = ['.glb', '.gltf', '.fbx', '.obj', '.stl'];
    if (!supported.includes(ext)) {
      toast.error(`Unsupported: ${ext}. Use: ${supported.join(', ')}`);
      return;
    }

    const { promise, cancel } = uploadService.uploadWithProgress(
      file,
      (p) => setUploading({ view: 'model', ...p, cancel }),
      '/api/v1/upload/model' as any
    );

    try {
      const result = await promise;
      if (result?.url) {
        setReferenceModel({
          file,
          name: file.name,
          url: result.url,
          progress: 100
        });
        window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: result.url } }));
        toast.success(`Model uploaded successfully`);
      }
    } catch (err: any) {
      if (err.message !== 'Upload cancelled') {
        toast.error(`Upload failed: ${err.message}`);
      }
    } finally {
      setUploading(null);
    }
  }, [setReferenceModel]);

  const [imgDragOver, setImgDragOver] = useState<ViewType | null>(null);

  const handleDrop = useCallback((e: React.DragEvent, view: ViewType) => {
    e.preventDefault();
    e.stopPropagation();
    setImgDragOver(null);
    const file = e.dataTransfer.files[0];
    if (file) handleViewUpload(view, file);
  }, [handleViewUpload]);

  // Quality presets
  const qualityOptions = QUALITY_PRESETS.map((p) => ({
    id: p.id,
    label: p.label,
    desc: p.time,
  }));

  const pipelineSteps = [
    { id: 'queued', label: 'Queueing', icon: <CircleDot size={14} /> },
    { id: 'generating', label: 'Generating', icon: <Sparkles size={14} /> },
    { id: 'texturing', label: 'Texturing', icon: <Palette size={14} /> },
    { id: 'refining', label: 'Refining', icon: <Activity size={14} /> },
    { id: 'completed', label: 'Completed', icon: <CheckCircle2 size={14} /> },
  ];

  const currentStepIndex = useMemo(() => {
    if (!currentJob) return -1;
    if (currentJob.status === 'queued') return 0;
    if (currentJob.status === 'generating') return 1;
    if (currentJob.status === 'completed') return 4;
    // Heuristic for others based on logs or progress
    if (currentJob.progress > 70) return 3;
    if (currentJob.progress > 30) return 2;
    return 1;
  }, [currentJob]);

  /* ------------------------------------------------------------------ */
  /*  Actionable Error Categorization                                   */
  /* ------------------------------------------------------------------ */

  const getErrorDetail = (msg: string) => {
    const m = msg.toLowerCase();
    if (m.includes("quota") || m.includes("limit")) return {
      title: "Quota Exceeded",
      advice: "Try again later or upgrade your plan to continue generating models.",
      icon: <Lock size={20} className="text-amber-400" />
    };
    if (m.includes("network") || m.includes("fetch") || m.includes("timeout")) return {
      title: "Connection Lost",
      advice: "Your internet connection may be unstable. Please check your network and retry.",
      icon: <Monitor size={20} className="text-sky-400" />
    };
    if (m.includes("input") || m.includes("prompt") || m.includes("image")) return {
      title: "Invalid Input",
      advice: "The prompt or image provided is invalid. Try a clearer description or a different image.",
      icon: <Pencil size={20} className="text-purple-400" />
    };
    return {
      title: "Generation Error",
      advice: "An unexpected error occurred during the 3D generation pipeline.",
      icon: <AlertCircle size={20} className="text-red-400" />
    };
  };

  return (
    <TooltipProvider>
    <div className="flex flex-col h-full bg-[#1a1b1e] text-white overflow-hidden font-sans">
      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#1a1b1e]">
        {/* Header */}
        <div className="p-5 shrink-0 border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#facc15]/10 text-[#facc15] shadow-[inset_0_0_15px_rgba(250,204,21,0.1)] border border-[#facc15]/20">
                <Sparkles size={20} />
              </div>
              <div className="flex flex-col">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Neural Engine</h2>
                <span className="text-[8px] font-bold uppercase tracking-widest text-white/20">3D-SPACE Pipeline v4.2</span>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-2 text-white/20 hover:text-white transition-all hover:bg-white/5 rounded-xl">
                  <HelpCircle size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Generation Help & Documentation</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex p-1 bg-black/40 backdrop-blur-md rounded-2xl border border-white/5 shadow-inner">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setHDMode('hd')}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.15em] transition-all relative overflow-hidden group",
                    hdMode === 'hd' ? "text-[#121214] font-black" : "text-white/40 hover:text-white/60"
                  )}
                >
                  <span className="relative z-10">HD Model</span>
                  {hdMode === 'hd' && (
                    <motion.div layoutId="gen-mode-pill" className="absolute inset-0 bg-[#facc15] shadow-[0_0_15px_rgba(250,204,21,0.3)]" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>High Detail Geometry & Texture</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setHDMode('smart')}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.15em] transition-all relative overflow-hidden group flex items-center justify-center gap-2",
                    hdMode === 'smart' ? "text-[#121214] font-black" : "text-white/40 hover:text-white/60"
                  )}
                >
                  <span className="relative z-10">Smart Mesh</span>
                  <Zap size={10} className={cn("relative z-10", hdMode === 'smart' ? "text-[#121214] fill-[#121214]" : "text-[#facc15] fill-[#facc15]")} />
                  {hdMode === 'smart' && (
                    <motion.div layoutId="gen-mode-pill" className="absolute inset-0 bg-[#facc15] shadow-[0_0_15px_rgba(250,204,21,0.3)]" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Neural Topology Optimization</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 space-y-6 pb-24 pt-6 scrollbar-thin scrollbar-thumb-white/5 hover:scrollbar-thumb-white/10">
          {/* Generation Pipeline Progress Overlay (Active State) */}
          {isGenerating && (
            <div className="p-5 bg-[#121214] rounded-[2rem] border border-[#facc15]/20 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#facc15]">Neural Generation</h3>
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Pipeline Active • {elapsed}s</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black text-white">{progress}%</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#facc15] to-[#fde047] shadow-[0_0_20px_rgba(250,204,21,0.3)] transition-all duration-500 ease-out" 
                  style={{ width: `${progress}%` }} 
                />
              </div>

              {/* Steps Indicator */}
              <div className="flex justify-between items-start pt-2">
                {pipelineSteps.map((step, idx) => (
                  <div key={step.id} className="flex flex-col items-center gap-2 w-1/5">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500",
                      idx < currentStepIndex ? "bg-[#facc15] border-[#facc15] text-[#121214]" :
                      idx === currentStepIndex ? "bg-[#facc15]/10 border-[#facc15] text-[#facc15] animate-pulse" :
                      "bg-[#1a1b1e] border-white/5 text-white/10"
                    )}>
                      {idx < currentStepIndex ? <CheckCircle2 size={16} /> : step.icon}
                    </div>
                    <span className={cn(
                      "text-[8px] font-black uppercase tracking-widest text-center transition-colors duration-500",
                      idx <= currentStepIndex ? "text-white/60" : "text-white/10"
                    )}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Latest Log Message */}
              {currentJob?.logs && currentJob.logs.length > 0 && (
                <div className="p-3 bg-black/20 rounded-xl border border-white/5">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest animate-pulse">
                    {currentJob.logs[currentJob.logs.length - 1].message}
                  </p>
                </div>
              )}

              <button 
                onClick={cancel}
                className="w-full py-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Abort Generation
              </button>
            </div>
          )}

          {/* Error State (Failed Job) */}
          {!isGenerating && currentJob?.status === 'failed' && (() => {
            const errorMsg = currentJob.logs.find(l => l.level === 'error')?.message || "Mesh reconstruction failed.";
            const detail = getErrorDetail(errorMsg);
            return (
              <div className="p-5 bg-red-500/5 rounded-[2rem] border border-red-500/20 space-y-4 animate-in zoom-in-95 duration-300">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-red-500/10 text-red-400">
                    {detail.icon}
                  </div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-red-400">{detail.title}</h3>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-red-100/90 leading-relaxed font-bold">
                    {errorMsg}
                  </p>
                  <p className="text-[9px] text-red-400/50 leading-relaxed font-medium italic">
                    {detail.advice}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => generate()}
                    className="py-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-red-500/20 shadow-lg shadow-red-500/5"
                  >
                    <RefreshCw size={14} /> Retry
                  </button>
                  <button 
                    onClick={() => useGenerationStore.getState().setCurrentJob(null)}
                    className="py-3 rounded-xl bg-white/5 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Multi-View Upload Grid */}
          {!isGenerating && currentJob?.status !== 'failed' && (
            <div className="relative aspect-square max-w-[400px] mx-auto w-full bg-[#121214] rounded-[2rem] border border-white/5 overflow-hidden group shadow-2xl">
            {/* View Grid Overlay */}
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 opacity-[0.03] pointer-events-none">
              <div className="border-r border-b border-white" />
              <div className="border-b border-white" />
              <div className="border-r border-white" />
              <div className="border-white" />
            </div>

            {/* Top Toolbar */}
            <div className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-1.5 bg-[#1a1b1e]/80 backdrop-blur-xl rounded-2xl border border-white/10 z-10 shadow-2xl">
              <button className="p-2 text-[#facc15] bg-[#facc15]/10 rounded-xl transition-all shadow-inner"><ImageIcon size={16} /></button>
              <button className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Box size={16} /></button>
              <button className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Layers size={16} /></button>
              <button className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Pencil size={16} /></button>
            </div>

            {/* Main Front View Upload */}
            <div
              className={cn(
                "absolute inset-0 flex flex-col items-center justify-center transition-all",
                imgDragOver === 'front' ? "bg-[#facc15]/5" : ""
              )}
              onDrop={(e) => handleDrop(e, 'front')}
              onDragOver={(e) => { e.preventDefault(); setImgDragOver('front'); }}
              onDragLeave={() => setImgDragOver(null)}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleViewUpload('front', file);
                };
                input.click();
              }}
            >
              {multiViewImages.front ? (
                <div className="relative w-full h-full p-4">
                  <Image 
                    src={multiViewImages.front.preview} 
                    alt="Front" 
                    fill
                    className="object-contain rounded-2xl p-4" 
                    referrerPolicy="no-referrer"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); setMultiViewImage('front', null); }}
                    className="absolute top-6 right-6 p-1.5 bg-black/60 backdrop-blur-md rounded-full hover:bg-red-500 transition-colors shadow-lg"
                  ><X size={14} /></button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 cursor-pointer group/upload">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center group-hover/upload:scale-110 transition-transform duration-500">
                      <ImagePlus size={32} className="text-white/20 group-hover/upload:text-[#facc15] transition-colors" />
                    </div>
                    <div className="absolute inset-0 animate-ping bg-[#facc15]/10 rounded-full scale-110" />
                  </div>
                  <div className="text-center space-y-1">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Front View</span>
                    <p className="text-[9px] text-white/10 font-bold uppercase tracking-widest">Click or Drag to Upload</p>
                  </div>
                </div>
              )}

              {/* Upload Progress Overlay */}
              {uploading && uploading.view === 'front' && (
                <div className="absolute inset-0 bg-[#121214]/95 backdrop-blur-md flex flex-col items-center justify-center p-8 z-20">
                  <div className="w-full max-w-[220px] space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-[#facc15] uppercase tracking-widest">Uploading...</span>
                      <span className="text-[10px] font-black text-white/40">{uploading.percent}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-[#facc15] shadow-[0_0_10px_rgba(250,204,21,0.5)] transition-all duration-300" style={{ width: `${uploading.percent}%` }} />
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); uploading.cancel?.(); }}
                      className="w-full py-2 text-[10px] font-black text-white/20 hover:text-red-400 transition-colors uppercase tracking-widest"
                    >Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Thumbnail Sidebar (Bottom Views) */}
            <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-3 px-5 z-10">
              {(['left', 'right', 'back'] as ViewType[]).map((view) => (
                <div
                  key={view}
                  className={cn(
                    "w-[86px] aspect-square rounded-2xl bg-[#1a1b1e]/80 backdrop-blur-xl border border-white/10 overflow-hidden cursor-pointer hover:border-[#facc15]/30 transition-all flex flex-col items-center justify-center group/thumb shadow-2xl",
                    imgDragOver === view ? "border-[#facc15] bg-[#facc15]/5" : ""
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (ev) => {
                      const file = (ev.target as HTMLInputElement).files?.[0];
                      if (file) handleViewUpload(view, file);
                    };
                    input.click();
                  }}
                  onDrop={(e) => handleDrop(e, view)}
                  onDragOver={(e) => { e.preventDefault(); setImgDragOver(view); }}
                  onDragLeave={() => setImgDragOver(null)}
                >
                  {multiViewImages[view] ? (
                    <div className="relative w-full h-full p-2">
                      <Image 
                        src={multiViewImages[view]!.preview} 
                        alt={view} 
                        fill
                        className="object-cover rounded-xl p-2" 
                        referrerPolicy="no-referrer"
                      />
                      <button
                        onClick={(ev) => { ev.stopPropagation(); setMultiViewImage(view, null); }}
                        className="absolute top-2 right-2 p-1 bg-black/60 backdrop-blur-md rounded-full hover:bg-red-500 transition-colors opacity-0 group-hover/thumb:opacity-100 shadow-lg"
                      ><X size={10} /></button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-white/20 group-hover/thumb:text-[#facc15] transition-colors">
                      <ImagePlus size={20} />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em]">{view}</span>
                    </div>
                  )}
                  {uploading && uploading.view === view && (
                    <div className="absolute inset-0 bg-black/90 flex items-center justify-center p-3">
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-[#facc15]" style={{ width: `${uploading.percent}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

          {/* Prompt Input */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Text Prompt</label>
              <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{prompt.length} / 1000</span>
            </div>
            <div className="relative group">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your 3D model (e.g. A futuristic mech warrior with neon accents)..."
                rows={4}
                className="w-full bg-[#121214] border border-white/5 rounded-2xl px-5 py-4 text-xs text-white placeholder:text-white/10 focus:outline-none focus:border-[#facc15]/30 focus:bg-black/40 transition-all resize-none leading-relaxed shadow-inner"
              />
              <div className="absolute bottom-4 right-4 text-white/10 group-focus-within:text-[#facc15]/30 transition-all transform group-focus-within:scale-110">
                <Type size={16} />
              </div>
            </div>
          </div>

          {/* Settings Shortcuts */}
          <div className="grid grid-cols-2 gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex items-center justify-between p-4 bg-[#121214] rounded-2xl border border-white/5 hover:border-[#facc15]/20 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-white/5 text-white/40 group-hover:text-[#facc15] transition-colors">
                      <Monitor size={14} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Quality</span>
                  </div>
                  <ChevronRight size={14} className="text-white/20 group-hover:text-[#facc15]/50 transition-colors" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Adjust mesh density and geometry detail</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex items-center justify-between p-4 bg-[#121214] rounded-2xl border border-white/5 hover:border-[#facc15]/20 transition-all group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-white/5 text-white/40 group-hover:text-[#facc15] transition-colors">
                      <Palette size={14} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Texture</span>
                  </div>
                  <ChevronRight size={14} className="text-white/20 group-hover:text-[#facc15]/50 transition-colors" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Configure PBR material generation settings</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Personal Use Info */}
          <div className="p-5 bg-[#121214] rounded-[1.5rem] border border-white/5 space-y-3">
            <div className="flex items-center gap-2 text-white/60">
              <Info size={14} className="text-[#facc15]" />
              <span className="text-[10px] font-black uppercase tracking-widest">Personal Use</span>
            </div>
            <p className="text-[10px] text-white/20 leading-relaxed font-medium">
              This generation is free for personal projects. High-fidelity models are optimized for real-time engines and 3D printing.
            </p>
          </div>
        </div>

        {/* Generate Button Container */}
        <div className="p-5 bg-[#1a1b1e] border-t border-white/5 shrink-0 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
          <Button
            onClick={() => generate()}
            disabled={isGenerating || (Object.values(multiViewImages).every(v => !v) && !prompt.trim())}
            variant="premium"
            className="w-full py-8 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 transition-all shadow-[0_15px_40px_rgba(139,92,246,0.3)] border-white/20"
          >
            {isGenerating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Processing Neural Mesh</span>
              </>
            ) : (
              <>
                <span>Generate 3D Model</span>
                <Zap size={18} className="fill-current" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

// Internal helper for multi-view silhouettes
function UserCircle({ size, className }: { size: number, className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
      <path d="M12 14a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M18.3 18.3a6.5 6.5 0 0 0-12.6 0" />
    </svg>
  );
}
