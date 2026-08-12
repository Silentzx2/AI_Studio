"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 3D Generation Page — Tripo-style professional workspace redesign.
 *
 * Layout: [Tool Rail + Tool Panel] | [Central 3D Viewer + overlays] | [Asset/Inspector Panel]
 *         + Bottom Status Bar
 *
 * Reuses: ThreeDViewer, AssetStoragePanel, ExportDialog,
 *         useGeneration, useGenerationStore, useUIStore, useProjectStore,
 *         useWorkspaceModels, uploadService, apiClient.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import anime from 'animejs';
import {
  Box, Upload, Sparkles, Palette, Bone, Layers,
  ChevronDown, ChevronRight, X, Check, Loader2,
  Info, Lock, AlertTriangle, Image as ImageIcon,
  Scissors, RefreshCw, Activity, PanelLeftClose, PanelLeftOpen,
  Settings2, History, ChevronLeft,
  // New icons for reference layout
  MousePointer2, Orbit, Hand, ZoomIn, Maximize2, RotateCcw,
  Grid3x3, BarChart3, Sun, Camera, HelpCircle,
  Pencil, MoreVertical, Search, Filter, Plus, Star,
  Download, Eye,
} from 'lucide-react';

import { useGenerationStore } from '@/stores/useGenerationStore';
import { useUIStore } from '@/stores/useUIStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useGeneration } from '@/hooks/useGeneration';
import { useWorkspaceModels } from '@/hooks/useBackendData';
import { HistoryItem } from '@/types/new-ui';
import { toast } from 'sonner';
import { uploadService } from '@/services/uploadService';
import { apiClient } from '@/services/apiClient';
import { ThreeDViewer } from '../viewer/ThreeDViewer';
import AssetStoragePanel from './AssetStoragePanel';
import ExportDialog from './ExportDialog';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ThreeDGenerationTabProps {
  activeModel: any;
  onUpdateModel: (model: any) => void;
  history: HistoryItem[] | null;
  onLoadProject: (item: HistoryItem) => void;
}

type ToolId = 'model' | 'segment' | 'remesh' | 'texture' | 'rig';

interface ToolDef {
  id: ToolId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TOOLS: ToolDef[] = [
  { id: 'model', label: 'Model', icon: Box },
  { id: 'segment', label: 'Segment', icon: Scissors },
  { id: 'remesh', label: 'Retopology', icon: RefreshCw },
  { id: 'texture', label: 'Texture', icon: Palette },
  { id: 'rig', label: 'Rig / Animate', icon: Bone },
];

const SUPPORTED_3D_FORMATS = ['.glb', '.gltf', '.obj', '.fbx', '.stl'];

const LOCAL_MODELS = [
  {
    id: 'hunyuan3d-2-mini', name: 'Hunyuan3D-2 Mini', label: 'Hunyuan3D-2 Mini',
    installed: false, status: 'not_installed', vram_required_mb: 6144, speed_seconds: 45,
    supports: { text_to_3d: false, image_to_3d: true, texture_generation: true, rigging_animation: false, detail_enhancement: false, part_separation: false },
    stats: { triangles: '0', vertices: '0', objects: '1', materials: '1', size: '0 MB' },
    colab_incompatible: false, colab_skip_reason: null,
  },
  {
    id: 'hunyuan3d-2', name: 'Hunyuan3D-2', label: 'Hunyuan3D-2',
    installed: true, status: 'ready', vram_required_mb: 7168, speed_seconds: 24,
    supports: { text_to_3d: true, image_to_3d: true, texture_generation: true, rigging_animation: false, detail_enhancement: true, part_separation: false },
    stats: { triangles: '1,504,233', vertices: '1,120,490', objects: '1', materials: '4', size: '72 MB' },
    colab_incompatible: false, colab_skip_reason: null,
  },
  {
    id: 'detailgen3d', name: 'DetailGen3D', label: 'DetailGen3D',
    installed: false, status: 'not_installed', vram_required_mb: 4096, speed_seconds: 60,
    supports: { text_to_3d: false, image_to_3d: false, texture_generation: false, rigging_animation: false, detail_enhancement: true, part_separation: false },
    stats: { triangles: '0', vertices: '0', objects: '1', materials: '1', size: '0 MB' },
    colab_incompatible: false, colab_skip_reason: null,
  },
  {
    id: 'triposg', name: 'TripoSG', label: 'TripoSG',
    installed: false, status: 'not_installed', vram_required_mb: 8192, speed_seconds: 60,
    supports: { text_to_3d: false, image_to_3d: true, texture_generation: false, rigging_animation: false, detail_enhancement: false, part_separation: false },
    stats: { triangles: '0', vertices: '0', objects: '1', materials: '1', size: '0 MB' },
    colab_incompatible: false, colab_skip_reason: null,
  },
];

// ─── Model Tool Panel (RESTRUCTURED) ────────────────────────────────────────

function ModelToolPanel({
  modelsList, activeModel, selectedModel, setSelectedModel,
  mode, setMode, prompt, setPrompt, negativePrompt, setNegativePrompt,
  uploadedImage, setUploadedImage,
  isGenerating, generate, cancel, currentJob,
}: {
  modelsList: any[]; activeModel: any; selectedModel: string | null;
  setSelectedModel: (id: string) => void;
  mode: string; setMode: (m: string) => void;
  prompt: string; setPrompt: (p: string) => void;
  negativePrompt: string; setNegativePrompt: (p: string) => void;
  uploadedImage: any; setUploadedImage: (img: any) => void;
  isGenerating: boolean; generate: () => void; cancel: () => void;
  currentJob: any;
}) {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNegPrompt, setShowNegPrompt] = useState(false);
  const [quality, setQuality] = useState('standard');
  const [geometryDetail, setGeometryDetail] = useState(0.5);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [modelUploadProgress, setModelUploadProgress] = useState(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const supportsText = activeModel?.supports?.text_to_3d ?? false;
  const supportsImage = activeModel?.supports?.image_to_3d ?? false;
  const canGenerate = mode === 'text-to-3d' ? (supportsText && prompt.trim()) : (supportsImage && uploadedImage);

  // Auto-switch mode when model doesn't support current
  useEffect(() => {
    if (!supportsText && mode === 'text-to-3d' && supportsImage) setMode('image-to-3d');
    else if (!supportsImage && mode === 'image-to-3d' && supportsText) setMode('text-to-3d');
  }, [activeModel, mode, setMode, supportsText, supportsImage]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
    setIsUploadingImage(true);
    try {
      const { url, width, height } = await uploadService.uploadWithProgress(file, () => {}, '/api/v1/upload/image');
      setUploadedImage({ file, preview: url, width: width || 512, height: height || 512 });
      setMode('image-to-3d');
      toast.success('Image loaded');
    } catch { toast.error('Failed to upload image'); }
    finally { setIsUploadingImage(false); }
  };

  const handleModelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!SUPPORTED_3D_FORMATS.some(f => file.name.toLowerCase().endsWith(f))) {
      toast.error(`Unsupported format. Use: ${SUPPORTED_3D_FORMATS.join(', ')}`);
      return;
    }
    if (file.size > 100 * 1024 * 1024) { toast.error('Model too large. Max 100MB.'); return; }
    setIsUploadingModel(true);
    setModelUploadProgress(0);
    try {
      await uploadService.uploadWithProgress(file, (p) => setModelUploadProgress(p.percent), '/api/v1/upload/model');
      const blobUrl = URL.createObjectURL(file);
      window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: blobUrl } }));
      toast.success(`Model loaded: ${file.name}`);
    } catch { toast.error('Failed to upload model'); }
    finally { setIsUploadingModel(false); setModelUploadProgress(0); }
  };

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImage({ file, preview: reader.result as string, width: 512, height: 512 });
      setMode('image-to-3d');
      toast.success('Reference image loaded');
    };
    reader.readAsDataURL(file);
  };

  // Progress bar
  const jobProgress = currentJob?.progress ?? null;
  const jobStatus = currentJob?.status ?? 'idle';
  const isJobActive = ['queued', 'processing', 'loading_model'].includes(jobStatus);

  // Estimated time from model speed
  const estimatedMinutes = activeModel?.speed_seconds
    ? (activeModel.speed_seconds / 60).toFixed(1)
    : '—';

  // Capability chips for the reference layout
  const capabilityChips: { label: string; active: boolean; color: string }[] = [
    { label: 'Mesh', active: !!activeModel?.supports?.text_to_3d || !!activeModel?.supports?.image_to_3d, color: 'neon-cyan' },
    { label: 'Texture', active: !!activeModel?.supports?.texture_generation, color: 'neon-amber' },
    { label: 'PBR', active: !!activeModel?.supports?.texture_generation, color: 'neon-green' },
  ];

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto flex-1 min-h-0">
      {/* Header: "MODEL GENERATION" */}
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-[hsl(var(--foreground))] uppercase tracking-widest">Model Generation</h2>
          <button className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors" title="Help">
            <HelpCircle size={13} />
          </button>
        </div>
        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Generate 3D model from text or image</p>
      </div>

      {/* Generation Mode segmented control */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Generation Mode</label>
        <div className="flex gap-1">
          <button
            disabled={!supportsText}
            onClick={() => setMode('text-to-3d')}
            className={cn(
              'flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all border',
              mode === 'text-to-3d'
                ? 'bg-[hsl(var(--primary))/0.1] border-[hsl(var(--primary))/0.3] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-2))] border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
              !supportsText && 'opacity-40 cursor-not-allowed'
            )}
          >
            Text to 3D
          </button>
          <button
            disabled={!supportsImage}
            onClick={() => setMode('image-to-3d')}
            className={cn(
              'flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all border',
              mode === 'image-to-3d'
                ? 'bg-[hsl(var(--primary))/0.1] border-[hsl(var(--primary))/0.3] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-2))] border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
              !supportsImage && 'opacity-40 cursor-not-allowed'
            )}
          >
            Image to 3D
          </button>
        </div>
      </div>

      {/* Model dropdown with green Ready status badge */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Model</label>
        <div className="relative">
          <button
            onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] text-xs hover:border-[hsl(var(--border))] transition-all"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0',
                activeModel?.status === 'ready'
                  ? 'bg-[hsl(var(--neon-green))/0.1] text-[hsl(var(--neon-green))] border border-[hsl(var(--neon-green)/0.3)]'
                  : 'bg-[hsl(var(--surface-3))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border)/0.3)]'
              )}>
                {activeModel?.status === 'ready' ? 'Ready' : 'N/A'}
              </span>
              <span className="truncate font-medium">{activeModel?.name || 'Select model...'}</span>
            </div>
            <ChevronDown size={12} className={cn('text-[hsl(var(--muted-foreground))] transition-transform flex-shrink-0', modelDropdownOpen && 'rotate-180')} />
          </button>
          {modelDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-xl overflow-hidden shadow-xl">
              <div className="max-h-48 overflow-y-auto custom-scrollbar">
                {modelsList.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedModel(m.id); setModelDropdownOpen(false); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-[hsl(var(--foreground)/0.03)] transition-all border-b border-[hsl(var(--border)/0.3)] last:border-0',
                      selectedModel === m.id && 'bg-[hsl(var(--primary))/0.05]'
                    )}
                  >
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0', m.status === 'ready' ? 'bg-[hsl(var(--neon-green))]' : 'bg-[hsl(var(--muted-foreground))]/30')} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{m.label}</div>
                      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{m.status === 'ready' ? 'Ready' : 'Not installed'} · {(m.vram_required_mb / 1024).toFixed(1)}GB VRAM</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Capability chips row + Change button */}
        {activeModel && (
          <div className="flex items-center gap-1.5 mt-1">
            <div className="flex flex-wrap gap-1 flex-1">
              {capabilityChips.map((chip) => (
                <span
                  key={chip.label}
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all',
                    chip.active
                      ? chip.color === 'neon-cyan'
                        ? 'bg-[hsl(var(--neon-cyan)/0.1)] text-[hsl(var(--neon-cyan))] border-[hsl(var(--neon-cyan)/0.2)]'
                        : chip.color === 'neon-amber'
                          ? 'bg-[hsl(var(--neon-amber)/0.1)] text-[hsl(var(--neon-amber))] border-[hsl(var(--neon-amber)/0.2)]'
                          : 'bg-[hsl(var(--neon-green)/0.1)] text-[hsl(var(--neon-green))] border-[hsl(var(--neon-green)/0.2)]'
                      : 'bg-[hsl(var(--surface-3))] text-[hsl(var(--muted-foreground))/40 border-[hsl(var(--border)/0.3)]'
                  )}
                >
                  {chip.label}
                </span>
              ))}
            </div>
            <button
              onClick={() => setModelDropdownOpen(true)}
              className="px-2 py-0.5 rounded text-[9px] font-bold text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border)/0.3)] hover:border-[hsl(var(--border))] hover:text-[hsl(var(--foreground))] transition-all"
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* Prompt textarea with character counter */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Prompt</label>
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your 3D model..."
            rows={4}
            maxLength={1000}
            className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] text-xs text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))/40 resize-none focus:outline-none focus:border-[hsl(var(--primary)/0.4)] transition-all pr-12"
          />
          <span className="absolute bottom-2 right-2 text-[9px] font-mono text-[hsl(var(--muted-foreground))/50]">
            {prompt.length}/1000
          </span>
        </div>
      </div>

      {/* Negative Prompt collapsible section with counter */}
      <div className="space-y-1.5">
        <button
          onClick={() => setShowNegPrompt(!showNegPrompt)}
          className="flex items-center gap-1.5 text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest hover:text-[hsl(var(--foreground))] transition-colors w-full text-left"
        >
          <ChevronRight size={10} className={cn('transition-transform', showNegPrompt && 'rotate-90')} />
          Negative Prompt
        </button>
        {showNegPrompt && (
          <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
            <textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="Things to avoid..."
              rows={2}
              maxLength={1000}
              className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] text-xs text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))/40 resize-none focus:outline-none focus:border-[hsl(var(--primary)/0.4)] transition-all pr-12"
            />
            <span className="absolute bottom-2 right-2 text-[9px] font-mono text-[hsl(var(--muted-foreground))/50]">
              {negativePrompt.length}/1000
            </span>
          </div>
        )}
      </div>

      {/* Reference Image upload zone (dashed border, PNG/JPG up to 10MB) */}
      {mode === 'image-to-3d' && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Reference Image</label>
          {uploadedImage ? (
            <div className="relative rounded-lg overflow-hidden border border-[hsl(var(--border)/0.5)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={uploadedImage.preview} alt="Reference" className="w-full h-32 object-cover" />
              <button
                onClick={() => setUploadedImage(null)}
                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-all"
              >
                <X size={10} className="text-white" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleImageDrop}
              className={cn(
                'flex flex-col items-center justify-center gap-2 py-6 rounded-lg border-2 border-dashed cursor-pointer transition-all',
                isDragOver
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]'
                  : 'border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface-2))] hover:border-[hsl(var(--border))]',
              )}
              onClick={() => imageInputRef.current?.click()}
            >
              {isUploadingImage ? (
                <Loader2 size={16} className="animate-spin text-[hsl(var(--primary))]" />
              ) : (
                <>
                  <ImageIcon size={16} className="text-[hsl(var(--muted-foreground))]" />
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Drop image or click to upload</span>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))/50]">PNG, JPG up to 10MB</span>
                </>
              )}
            </div>
          )}
          <input ref={imageInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleImageUpload} />
        </div>
      )}

      {/* Quality: Low, Medium, High buttons */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Quality</label>
        <div className="flex gap-1">
          {['low', 'medium', 'high'].map((q) => (
            <button key={q} onClick={() => setQuality(q)}
              className={cn('flex-1 px-2 py-1.5 rounded text-[10px] font-semibold border transition-all capitalize',
                quality === q
                  ? 'bg-[hsl(var(--primary))/0.1] border-[hsl(var(--primary))/0.3] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-2))] border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]' ,
              )}
            >{q}</button>
          ))}
        </div>
      </div>

      {/* Geometry Detail: horizontal slider (0-1 range) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Geometry Detail</label>
          <span className="text-[10px] font-mono text-[hsl(var(--muted-foreground))]">{geometryDetail.toFixed(2)}</span>
        </div>
        <input
          type="range" min={0} max={1} step={0.01} value={geometryDetail}
          onChange={(e) => setGeometryDetail(Number(e.target.value))}
          className="w-full accent-[hsl(var(--primary))] h-1.5"
        />
      </div>

      {/* Advanced Settings: collapsible accordion */}
      <div className="space-y-1.5">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest hover:text-[hsl(var(--foreground))] transition-colors w-full text-left"
        >
          <Settings2 size={10} />
          Advanced Settings
          <ChevronDown size={10} className={cn('transition-transform ml-auto', showAdvanced && 'rotate-180')} />
        </button>
        {showAdvanced && (
          <div className="space-y-2 pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="space-y-1">
              <label className="text-[10px] text-[hsl(var(--muted-foreground))]">Style Preset</label>
              <div className="flex gap-1">
                {['Realistic', 'Stylized', 'Low-poly'].map((s) => (
                  <button key={s} className="flex-1 px-2 py-1 rounded text-[10px] font-medium border bg-[hsl(var(--surface-2))] border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Job Progress */}
      {isJobActive && (
        <div className="space-y-1.5 p-3 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Generating</span>
            <span className="text-[10px] font-mono text-[hsl(var(--primary))]">{jobProgress !== null ? `${jobProgress}%` : jobStatus}</span>
          </div>
          <div className="w-full h-1.5 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-cyan))] transition-all duration-300"
              style={{ width: jobProgress !== null ? `${jobProgress}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Full-width Generate button with sparkle icon */}
      <div className="mt-auto pt-2">
        {isGenerating ? (
          <button
            onClick={cancel}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[hsl(var(--destructive))/0.15] border border-[hsl(var(--destructive))/0.3] text-[hsl(var(--destructive))] text-xs font-bold hover:bg-[hsl(var(--destructive))/0.2] transition-all"
          >
            <X size={14} />
            Cancel Generation
          </button>
        ) : (
          <button
            onClick={generate}
            disabled={!canGenerate}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all',
              canGenerate
                ? 'bg-[hsl(var(--primary))] text-white shadow-lg shadow-[hsl(var(--primary))/0.25] hover:shadow-[hsl(var(--primary))/0.4]' : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border)/0.5)] cursor-not-allowed'
            )}
          >
            <Sparkles size={14} />
            Generate
          </button>
        )}
        {/* Estimated time + VRAM info */}
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-[9px] text-[hsl(var(--muted-foreground))]">
            Estimated: ~{estimatedMinutes} min
          </span>
          <span className="text-[9px] text-[hsl(var(--muted-foreground))]">
            {activeModel?.vram_required_mb ? `${(activeModel.vram_required_mb / 1024).toFixed(1)} GB VRAM` : ''}
          </span>
        </div>
      </div>

      {/* Import 3D Model section */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Import 3D Model</label>
        <button
          onClick={() => modelInputRef.current?.click()}
          disabled={isUploadingModel}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[hsl(var(--border)/0.5)] bg-[hsl(var(--surface-2))] text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--border))] transition-all disabled:opacity-50"
        >
          {isUploadingModel ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              <span>Uploading {modelUploadProgress}%</span>
            </>
          ) : (
            <>
              <Upload size={12} />
              <span>Import Model ({SUPPORTED_3D_FORMATS.slice(0, 3).join(', ')}...)</span>
            </>
          )}
        </button>
        <input ref={modelInputRef} type="file" accept={SUPPORTED_3D_FORMATS.join(',')} className="hidden" onChange={handleModelUpload} />
        {isUploadingModel && (
          <div className="w-full h-1 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
            <div className="h-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${modelUploadProgress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Segment Tool Panel ──────────────────────────────────────────────────────

function SegmentToolPanel({ activeModel }: { activeModel: any }) {
  const [isRunning, setIsRunning] = useState(false);
  const supported = activeModel?.supports?.part_separation ?? false;

  const runSegmentation = async () => {
    if (!supported) return;
    setIsRunning(true);
    try {
      await apiClient.post('/api/v1/generation/segment', { model_id: activeModel?.id });
      toast.success('Segmentation complete');
    } catch { toast.error('Segmentation not available'); }
    finally { setIsRunning(false); }
  };

  if (!supported) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center flex-1">
        <div className="w-12 h-12 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] flex items-center justify-center">
          <Lock size={18} className="text-[hsl(var(--muted-foreground))/40" />
        </div>
        <div>
          <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Segmentation Unavailable</p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))/60 mt-1">Current model does not support part separation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 flex-1">
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Segmentation</label>
        <p className="text-[10px] text-[hsl(var(--muted-foreground))/60]">Separate the model into individual parts for editing.</p>
      </div>
      <button
        onClick={runSegmentation}
        disabled={isRunning}
        className="mt-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-xs font-bold shadow-lg shadow-[hsl(var(--primary))/0.25] hover:shadow-[hsl(var(--primary))/0.4] transition-all disabled:opacity-50"
      >
        {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
        {isRunning ? 'Processing...' : 'Run Segmentation'}
      </button>
    </div>
  );
}

// ─── Remesh Tool Panel ───────────────────────────────────────────────────────

function RemeshToolPanel({ activeModel }: { activeModel: any }) {
  const [topologyMode, setTopologyMode] = useState('auto');
  const [targetPolygons, setTargetPolygons] = useState(50000);
  const [isRunning, setIsRunning] = useState(false);

  const runRemesh = async () => {
    setIsRunning(true);
    try {
      await apiClient.post('/api/v1/generation/remesh', {
        model_id: activeModel?.id,
        target_faces: targetPolygons,
        mode: topologyMode,
      });
      toast.success('Remesh complete');
    } catch { toast.error('Remesh operation failed'); }
    finally { setIsRunning(false); }
  };

  return (
    <div className="flex flex-col gap-3 p-3 flex-1">
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Retopology</label>
        <p className="text-[10px] text-[hsl(var(--muted-foreground))/60]">Optimize mesh topology for better deformation and rendering.</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] text-[hsl(var(--muted-foreground))]">Mode</label>
        <div className="flex gap-1">
          {['auto', 'manual'].map((m) => (
            <button key={m} onClick={() => setTopologyMode(m)}
              className={cn('flex-1 px-2 py-1 rounded text-[10px] font-medium border transition-all capitalize',
                topologyMode === m
                  ? 'bg-[hsl(var(--primary))/0.1] border-[hsl(var(--primary))/0.3] text-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-2))] border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))]' ,
              )}
            >{m}</button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] text-[hsl(var(--muted-foreground))]">Target Polygons: {targetPolygons.toLocaleString()}</label>
        <input
          type="range" min={1000} max={200000} step={1000} value={targetPolygons}
          onChange={(e) => setTargetPolygons(Number(e.target.value))}
          className="w-full accent-[hsl(var(--primary))]"
        />
      </div>
      <button
        onClick={runRemesh}
        disabled={isRunning}
        className="mt-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-xs font-bold shadow-lg shadow-[hsl(var(--primary))/0.25] hover:shadow-[hsl(var(--primary))/0.4] transition-all disabled:opacity-50"
      >
        {isRunning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {isRunning ? 'Processing...' : 'Run Retopology'}
      </button>
    </div>
  );
}

// ─── Texture Tool Panel ──────────────────────────────────────────────────────

function TextureToolPanel({ activeModel }: { activeModel: any }) {
  const [isRunning, setIsRunning] = useState(false);
  const supported = activeModel?.supports?.texture_generation ?? false;

  const runTextureGen = async () => {
    setIsRunning(true);
    try {
      await apiClient.post('/api/v1/generation/texture', { model_id: activeModel?.id });
      toast.success('Texture generation complete');
    } catch { toast.error('Texture generation not available'); }
    finally { setIsRunning(false); }
  };

  return (
    <div className="flex flex-col gap-3 p-3 flex-1">
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Texture Generation</label>
        <p className="text-[10px] text-[hsl(var(--muted-foreground))/60]">Generate PBR textures for the current model.</p>
      </div>
      {!supported && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--neon-amber)/0.05)] border border-[hsl(var(--neon-amber)/0.2)]">
          <AlertTriangle size={12} className="text-[hsl(var(--neon-amber))]" />
          <span className="text-[10px] text-[hsl(var(--neon-amber))]">Current model doesn't support texture generation. A compatible texture provider will be used.</span>
        </div>
      )}
      <button
        onClick={runTextureGen}
        disabled={isRunning}
        className="mt-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-xs font-bold shadow-lg shadow-[hsl(var(--primary))/0.25] hover:shadow-[hsl(var(--primary))/0.4] transition-all disabled:opacity-50"
      >
        {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Palette size={14} />}
        {isRunning ? 'Generating...' : 'Generate Texture'}
      </button>
    </div>
  );
}

// ─── Rig / Animate Tool Panel ────────────────────────────────────────────────

function RigToolPanel({ activeModel }: { activeModel: any }) {
  const [hasRig, setHasRig] = useState(false);
  const [isRigging, setIsRigging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const rigSupported = activeModel?.supports?.rigging_animation ?? false;

  const runRigging = async () => {
    setIsRigging(true);
    try {
      await apiClient.post('/api/v1/generation/rig', { model_id: activeModel?.id });
      setHasRig(true);
      toast.success('Rigging complete');
    } catch { toast.error('Rigging not available'); }
    finally { setIsRigging(false); }
  };

  const runAnimation = async () => {
    if (!hasRig) return;
    setIsAnimating(true);
    try {
      await apiClient.post('/api/v1/generation/animate', { model_id: activeModel?.id });
      toast.success('Animation applied');
    } catch { toast.error('Animation not available'); }
    finally { setIsAnimating(false); }
  };

  return (
    <div className="flex flex-col gap-3 p-3 flex-1">
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Rig / Animate</label>
      </div>

      {/* Rig Status */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)]">
        {hasRig ? (
          <>
            <Check size={12} className="text-[hsl(var(--neon-green))]" />
            <span className="text-[11px] font-medium text-[hsl(var(--neon-green))]">Rig Applied</span>
          </>
        ) : (
          <>
            <X size={12} className="text-[hsl(var(--muted-foreground))/40" />
            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">No Rig</span>
          </>
        )}
      </div>

      {/* Rig Button */}
      <button
        onClick={runRigging}
        disabled={isRigging || hasRig}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-xs font-bold shadow-lg shadow-[hsl(var(--primary))/0.25] hover:shadow-[hsl(var(--primary))/0.4] transition-all disabled:opacity-50"
      >
        {isRigging ? <Loader2 size={14} className="animate-spin" /> : <Bone size={14} />}
        {isRigging ? 'Rigging...' : hasRig ? 'Rig Applied' : 'Generate Rig'}
      </button>

      {/* Animation — requires rig */}
      <div className="space-y-1.5">
        <button
          onClick={runAnimation}
          disabled={!hasRig || isAnimating}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all',
            hasRig
              ? 'bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground)/0.03)]' : 'bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] text-[hsl(var(--muted-foreground))/40 cursor-not-allowed'
          )}
        >
          {isAnimating ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
          {isAnimating ? 'Animating...' : !hasRig ? 'Animation — requires rig' : 'Apply Animation'}
        </button>
        {!rigSupported && (
          <p className="text-[9px] text-[hsl(var(--muted-foreground))/50]">Rigging/animation not supported by current model</p>
        )}
      </div>
    </div>
  );
}

// ─── Viewer Drop Overlay ─────────────────────────────────────────────────────

function ViewerDropOverlay({ isDragOver, isUploading, uploadProgress }: { isDragOver: boolean; isUploading: boolean; uploadProgress: number }) {
  if (!isDragOver && !isUploading) return null;
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
      {isUploading ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-[hsl(var(--primary))]" />
          <span className="text-xs font-medium text-white">Uploading... {uploadProgress}%</span>
          <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 border-2 border-dashed border-[hsl(var(--primary))/0.6] rounded-2xl p-12">
          <Upload size={32} className="text-[hsl(var(--primary))]" />
          <span className="text-sm font-semibold text-white">Drop 3D model here</span>
          <span className="text-[10px] text-white/50">GLB, GLTF, OBJ, FBX, STL</span>
        </div>
      )}
    </div>
  );
}

// ─── Viewport Top Bar (NEW) ──────────────────────────────────────────────────

function ViewportTopBar() {
  const { currentProject } = useProjectStore();
  const { viewer, setViewerMode, resetCamera } = useUIStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const projectName = currentProject?.name || 'Untitled Project';

  const handleStartEdit = () => {
    setEditName(projectName);
    setIsEditing(true);
  };

  const handleFinishEdit = () => {
    setIsEditing(false);
    // Could dispatch name change to project store here
  };

  const viewportTools: { id: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; active: boolean; action: () => void }[] = [
    { id: 'select', label: 'Select', icon: MousePointer2, active: viewer.mode === 'solid', action: () => setViewerMode('solid') },
    { id: 'orbit', label: 'Orbit', icon: Orbit, active: true, action: () => {} },
    { id: 'reset', label: 'Reset View', icon: RotateCcw, active: false, action: resetCamera },
  ];

  return (
    <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
      {/* Left: Project name */}
      <div className="pointer-events-auto flex items-center gap-1.5 bg-[hsl(var(--surface-1))/80] backdrop-blur-md border border-[hsl(var(--border)/0.5)] rounded-lg px-3 py-1.5">
        {isEditing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={(e) => e.key === 'Enter' && handleFinishEdit()}
            className="text-xs font-medium text-[hsl(var(--foreground))] bg-transparent outline-none w-32"
          />
        ) : (
          <button onClick={handleStartEdit} className="flex items-center gap-1.5 group">
            <span className="text-xs font-medium text-[hsl(var(--foreground))]">{projectName}</span>
            <Pencil size={11} className="text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>

      {/* Center: Viewport navigation tools */}
      <div className="pointer-events-auto flex items-center gap-0.5 bg-[hsl(var(--surface-1))/80] backdrop-blur-md border border-[hsl(var(--border)/0.5)] rounded-lg p-0.5">
        {viewportTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={tool.action}
              title={tool.label}
              className={cn(
                'w-7 h-7 rounded-md flex items-center justify-center transition-all',
                tool.active
                  ? 'bg-[hsl(var(--primary))/0.12] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground)/0.05)]'
              )}
            >
              <Icon size={13} />
            </button>
          );
        })}
      </div>

      {/* Right spacer for axis gizmo area */}
      <div className="w-[100px]" />
    </div>
  );
}

// ─── Viewer Right Toolbar (NEW — floating vertical) ──────────────────────────

function ViewerRightToolbar() {
  const { toggleGrid, toggleFullscreen, resetCamera } = useUIStore();

  const tools: { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; action: () => void }[] = [
    { label: 'Lighting', icon: Sun, action: () => toast.info('Lighting panel coming soon') },
    { label: 'Camera', icon: Camera, action: resetCamera },
    { label: 'Grid', icon: Grid3x3, action: toggleGrid },
    { label: 'Help', icon: HelpCircle, action: () => toast.info('Keyboard shortcuts and controls coming soon') },
  ];

  return (
    <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5">
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <button
            key={tool.label}
            onClick={tool.action}
            title={tool.label}
            className="w-8 h-8 rounded-full bg-[hsl(var(--surface-1))/80] backdrop-blur-md border border-[hsl(var(--border)/0.5)] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground)/0.05)] transition-all shadow-lg"
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}

// ─── Material Bar (NEW — bottom material previews) ──────────────────────────

const MATERIAL_PRESETS = [
  { id: 'default', color: '#888888', label: 'Default' },
  { id: 'clay', color: '#c4a882', label: 'Clay' },
  { id: 'metal', color: '#c0c0c0', label: 'Metal' },
  { id: 'glass', color: '#a8d8ea', label: 'Glass' },
  { id: 'plastic', color: '#e85d75', label: 'Plastic' },
  { id: 'ceramic', color: '#f5f0eb', label: 'Ceramic' },
  { id: 'wood', color: '#8b6914', label: 'Wood' },
];

function MaterialBar() {
  const [activeMaterial, setActiveMaterial] = useState('default');

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-[hsl(var(--surface-1))/80] backdrop-blur-md border border-[hsl(var(--border)/0.5)] rounded-xl px-2 py-1.5">
      {MATERIAL_PRESETS.map((mat) => (
        <button
          key={mat.id}
          onClick={() => setActiveMaterial(mat.id)}
          title={mat.label}
          className={cn(
            'w-7 h-7 rounded-full border-2 transition-all shadow-sm hover:scale-110',
            activeMaterial === mat.id
              ? 'border-[hsl(var(--primary))] scale-110'
              : 'border-transparent hover:border-[hsl(var(--border))]',
          )}
          style={{ backgroundColor: mat.color }}
        />
      ))}
    </div>
  );
}

// ─── Bottom Dock (NEW — 10 tools with icons AND labels) ─────────────────────

interface DockTool {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  getActive: () => boolean;
  action: () => void;
}

function BottomDock() {
  const { viewer, setViewerMode, toggleAutoRotate, toggleGrid, toggleWireframe, toggleStats, toggleFullscreen, resetCamera } = useUIStore();

  const tools: DockTool[] = [
    { id: 'select', label: 'Select', icon: MousePointer2, getActive: () => viewer.mode === 'solid', action: () => setViewerMode('solid') },
    { id: 'orbit', label: 'Orbit', icon: Orbit, getActive: () => true, action: () => {} },
    { id: 'pan', label: 'Pan', icon: Hand, getActive: () => false, action: () => {} },
    { id: 'zoom', label: 'Zoom', icon: ZoomIn, getActive: () => false, action: () => {} },
    { id: 'fit', label: 'Fit', icon: Maximize2, getActive: () => false, action: resetCamera },
    { id: 'auto-rotate', label: 'Auto Rotate', icon: RotateCcw, getActive: () => viewer.autoRotate, action: toggleAutoRotate },
    { id: 'wireframe', label: 'Wireframe', icon: Grid3x3, getActive: () => viewer.showWireframe, action: toggleWireframe },
    { id: 'grid', label: 'Grid', icon: Grid3x3, getActive: () => viewer.showGrid, action: toggleGrid },
    { id: 'stats', label: 'Stats', icon: BarChart3, getActive: () => viewer.showStats, action: toggleStats },
    { id: 'fullscreen', label: 'Fullscreen', icon: Maximize2, getActive: () => viewer.fullscreen, action: toggleFullscreen },
  ];

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 bg-[hsl(var(--surface-1))/85] backdrop-blur-md border border-[hsl(var(--border)/0.5)] rounded-xl px-1.5 py-1">
      {tools.map((tool) => {
        const Icon = tool.icon;
        const active = tool.getActive();
        return (
          <button
            key={tool.id}
            onClick={tool.action}
            title={tool.label}
            className={cn(
              'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-all min-w-[42px]',
              active
                ? 'bg-[hsl(var(--primary))/0.12] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground)/0.05)]'
            )}
          >
            <Icon size={13} />
            <span className="text-[8px] font-medium leading-none">{tool.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Status Bar (NEW) ────────────────────────────────────────────────────────

function StatusBar({ jobHistory }: { jobHistory: any[] }) {
  const { currentJob } = useGenerationStore();

  const currentTaskText = currentJob
    ? (() => {
        const status = currentJob.status;
        if (status === 'queued') return 'Queued';
        if ((status as string) === 'processing' || (status as string) === 'loading_model') return `Processing (${currentJob.progress ?? 0}%)`;
        if (status === 'completed') return 'Completed';
        if (status === 'failed' || status === 'cancelled') return status.charAt(0).toUpperCase() + status.slice(1);
        return 'Idle';
      })()
    : 'None';

  return (
    <div className="flex items-center gap-4 px-4 py-1 bg-[hsl(var(--surface-1))] border-t border-[hsl(var(--border))] text-[9px] font-mono text-[hsl(var(--muted-foreground))] flex-shrink-0">
      <span>
        Generation History (<span className="text-[hsl(var(--neon-cyan))]">{jobHistory?.length ?? 0}</span>)
      </span>
      <span className="text-[hsl(var(--border))]">|</span>
      <span>
        Current Task: <span className={cn('font-medium', currentJob && ['queued', 'processing', 'loading_model'].includes(currentJob.status) ? 'text-[hsl(var(--neon-amber))]' : 'text-[hsl(var(--muted-foreground))]')}>{currentTaskText}</span>
      </span>
      <span className="text-[hsl(var(--border))]">|</span>
      <span>
        System Status: <span className="text-[hsl(var(--neon-green))]">All Systems Operational</span>
      </span>
    </div>
  );
}

// ─── Right Panel Wrapper (RESTRUCTURED) ───────────────────────────────────────

type RightTab = 'assets' | 'inspector' | 'history';

type AssetFilter = 'all' | 'models' | 'images' | 'favorites';

function RightPanelWrapper({
  history, onLoadProject, activeModel, onUpdateModel,
}: {
  history: HistoryItem[] | null; onLoadProject: (item: HistoryItem) => void;
  activeModel: any; onUpdateModel: (m: any) => void;
}) {
  const [activeTab, setActiveTab] = useState<RightTab>('assets');
  const [searchQuery, setSearchQuery] = useState('');
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all');

  const tabs: { id: RightTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: 'assets', label: 'Assets', icon: Layers },
    { id: 'inspector', label: 'Inspector', icon: Info },
    { id: 'history', label: 'History', icon: History },
  ];

  const filterChips: { id: AssetFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'models', label: '3D Models' },
    { id: 'images', label: 'Images' },
    { id: 'favorites', label: 'Favorites' },
  ];

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--surface-1))] border-l border-[hsl(var(--border))]">
      {/* Tab Bar */}
      <div className="flex items-center border-b border-[hsl(var(--border))] flex-shrink-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2',
                activeTab === tab.id
                  ? 'text-[hsl(var(--primary))] border-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] border-transparent hover:text-[hsl(var(--foreground))]',
              )}
            >
              <Icon size={11} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {activeTab === 'assets' && (
          <>
            {/* Search bar with filter icon + refresh icon */}
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[hsl(var(--border)/0.5)] flex-shrink-0">
              <div className="flex-1 relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))/50" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search assets..."
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] text-[10px] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))/40 focus:outline-none focus:border-[hsl(var(--primary)/0.4)] transition-all"
                />
              </div>
              <button
                title="Filter"
                className="w-7 h-7 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all"
              >
                <Filter size={12} />
              </button>
              <button
                title="Refresh"
                className="w-7 h-7 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all"
              >
                <RefreshCw size={12} />
              </button>
            </div>
            {/* Category filter chips */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-[hsl(var(--border)/0.5)] flex-shrink-0">
              {filterChips.map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => setAssetFilter(chip.id)}
                  className={cn(
                    'px-2 py-0.5 rounded-md text-[9px] font-semibold transition-all border',
                    assetFilter === chip.id
                      ? 'bg-[hsl(var(--primary))/0.1] border-[hsl(var(--primary))/0.3] text-[hsl(var(--primary))]' : 'bg-transparent border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]' ,
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {/* AssetStoragePanel handles its own data */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <AssetStoragePanel />
            </div>
            {/* + Add Asset dropdown button at bottom */}
            <div className="flex-shrink-0 px-3 py-2 border-t border-[hsl(var(--border)/0.5)]">
              <button className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] text-[10px] font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--border))] transition-all">
                <Plus size={12} />
                Add Asset
                <ChevronDown size={10} />
              </button>
            </div>
          </>
        )}
        {activeTab === 'inspector' && (
          <InspectorTab activeModel={activeModel} />
        )}
        {activeTab === 'history' && (
          <HistoryTabContent history={history} onLoadProject={onLoadProject} />
        )}
      </div>
    </div>
  );
}

// ─── Inspector Tab (enhanced) ─────────────────────────────────────────────────

function InspectorTab({ activeModel }: { activeModel: any }) {
  const [showExport, setShowExport] = useState(false);

  if (!activeModel) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Info size={20} className="text-[hsl(var(--muted-foreground))/30 mb-2" />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Select a model to inspect</p>
      </div>
    );
  }

  const stats = activeModel.stats || {};

  // Metadata section
  const metadataFields = [
    { label: 'Format', value: 'GLB' },
    { label: 'Size', value: stats.size || '—' },
    { label: 'Created', value: '—' },
    { label: 'ID', value: activeModel.id || '—' },
    { label: 'Provider', value: activeModel.name || '—' },
  ];

  // Stats section
  const statsFields = [
    { label: 'Vertices', value: stats.vertices || '—' },
    { label: 'Faces', value: stats.triangles || '—' },
    { label: 'Materials', value: stats.materials || '—' },
    { label: 'UVs', value: 'Yes' },
    { label: 'Textures', value: activeModel.supports?.texture_generation ? 'PBR' : '—' },
    { label: 'Rigged', value: activeModel.supports?.rigging_animation ? 'Yes' : 'No' },
  ];

  return (
    <div className="p-3 overflow-y-auto h-full custom-scrollbar space-y-4">
      {/* Thumbnail + filename header */}
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] flex items-center justify-center flex-shrink-0">
          <Box size={20} className="text-[hsl(var(--muted-foreground))/40" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[hsl(var(--foreground))] truncate">{activeModel.name || activeModel.label || 'Untitled'}</p>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{activeModel.id}</p>
        </div>
      </div>

      {/* Metadata */}
      <div className="space-y-2">
        <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Metadata</span>
        <div className="bg-[hsl(var(--surface-2))] rounded-lg border border-[hsl(var(--border)/0.3)] divide-y divide-[hsl(var(--border)/0.2)]">
          {metadataFields.map((f) => (
            <div key={f.label} className="flex items-center justify-between px-3 py-2">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{f.label}</span>
              <span className="text-[10px] font-medium text-[hsl(var(--foreground))] font-mono truncate max-w-[120px]">{f.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-2">
        <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Stats</span>
        <div className="bg-[hsl(var(--surface-2))] rounded-lg border border-[hsl(var(--border)/0.3)] divide-y divide-[hsl(var(--border)/0.2)]">
          {statsFields.map((f) => (
            <div key={f.label} className="flex items-center justify-between px-3 py-2">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{f.label}</span>
              <span className="text-[10px] font-medium text-[hsl(var(--foreground))] font-mono">{f.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Capabilities */}
      <div className="space-y-2">
        <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Capabilities</span>
        <div className="flex flex-wrap gap-1">
          {Object.entries(activeModel.supports || {}).map(([key, val]) => (
            <span
              key={key}
              className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-bold border',
                val
                  ? 'bg-[hsl(var(--neon-green)/0.08)] text-[hsl(var(--neon-green))] border-[hsl(var(--neon-green)/0.2)]' : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))/40 border-[hsl(var(--border)/0.3)]'
              )}
            >
              {key.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] text-[10px] font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground)/0.03)] transition-all">
          <Eye size={12} />
          Preview
        </button>
        <button
          onClick={() => setShowExport(true)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[hsl(var(--primary))] text-white text-[10px] font-semibold shadow-lg shadow-[hsl(var(--primary))/0.2] hover:shadow-[hsl(var(--primary))/0.35] transition-all"
        >
          <Download size={12} />
          Export
        </button>
      </div>

      {showExport && <ExportDialog isOpen={showExport} onClose={() => setShowExport(false)} />}
    </div>
  );
}

// ─── History Tab Content ─────────────────────────────────────────────────────

function HistoryTabContent({ history, onLoadProject }: { history: HistoryItem[] | null; onLoadProject: (item: HistoryItem) => void }) {
  if (!history || history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <History size={20} className="text-[hsl(var(--muted-foreground))/30 mb-2" />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">No generation history yet</p>
      </div>
    );
  }

  return (
    <div className="p-3 overflow-y-auto h-full space-y-2 custom-scrollbar">
      {history.map((item) => (
        <button
          key={item.id}
          onClick={() => onLoadProject(item)}
          className="w-full text-left p-2.5 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] hover:border-[hsl(var(--border))] transition-all group"
        >
          <div className="flex items-start gap-2">
            <div className="w-10 h-10 rounded-lg bg-[hsl(var(--surface-3))] flex items-center justify-center flex-shrink-0 overflow-hidden">
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnailUrl} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <Box size={14} className="text-[hsl(var(--muted-foreground))/30" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium truncate group-hover:text-[hsl(var(--primary))] transition-colors">{item.name}</p>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5 truncate">{item.prompt}</p>
              <p className="text-[9px] text-[hsl(var(--muted-foreground))/50 mt-0.5">{item.timestamp} · {item.format}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ThreeDGenerationTab({
  activeModel: parentActiveModel,
  onUpdateModel,
  history,
  onLoadProject,
}: ThreeDGenerationTabProps) {
  const { prompt, setPrompt, negativePrompt, setNegativePrompt, uploadedImage, setUploadedImage, mode, setMode, selectedModel, setSelectedModel, jobHistory } = useGenerationStore();
  const { generate, cancel, isGenerating, currentJob } = useGeneration();
  const { toggleFullscreen } = useUIStore();
  const { setProject } = useProjectStore();

  const { models: workspaceModels, loading: isLoadingWorkspaceModels, error: workspaceModelsError } = useWorkspaceModels('mesh-generation');

  // Build model list from backend + local fallback
  const modelsList = useMemo(() => {
    if (workspaceModelsError || !workspaceModels || workspaceModels.length === 0) return LOCAL_MODELS;
    return workspaceModels.map((m: any) => {
      const mid = String(m.id ?? '');
      const label = m.label || m.name || mid;
      const local = LOCAL_MODELS.find(l => l.id === mid.toLowerCase() || l.name.toLowerCase() === String(label).toLowerCase());
      const supports = m.supports || {};
      return {
        id: mid, name: label, label,
        installed: m.installed ?? m.status === 'ready',
        status: m.status || (m.installed ? 'ready' : 'not_installed'),
        vram_required_mb: m.vram_required_mb ?? local?.vram_required_mb ?? 0,
        speed_seconds: local?.speed_seconds ?? 0,
        supports: {
          text_to_3d: supports.text_to_3d ?? local?.supports.text_to_3d ?? false,
          image_to_3d: supports.image_to_3d ?? local?.supports.image_to_3d ?? false,
          texture_generation: supports.texture_generation ?? local?.supports.texture_generation ?? false,
          rigging_animation: supports.rigging_animation ?? local?.supports.rigging_animation ?? false,
          detail_enhancement: supports.detail_enhancement ?? local?.supports.detail_enhancement ?? false,
          part_separation: supports.part_separation ?? local?.supports.part_separation ?? false,
        },
        stats: local?.stats ?? { triangles: '0', vertices: '0', objects: '0', materials: '0', size: '0 MB' },
        colab_incompatible: m.colab_incompatible ?? false, colab_skip_reason: null,
      };
    });
  }, [workspaceModels, workspaceModelsError]);

  const activeModel = useMemo(() => {
    return modelsList.find((m) => m.id === selectedModel) || modelsList[0];
  }, [modelsList, selectedModel]);

  // Default model selection
  useEffect(() => {
    if (!selectedModel && modelsList.length > 0) setSelectedModel(modelsList[0].id);
  }, [selectedModel, modelsList, setSelectedModel]);

  // Default prompt
  useEffect(() => {
    if (!prompt) setPrompt('Futuristic mecha robot, highly detailed, PBR, cinematic lighting');
  }, [prompt, setPrompt]);

  // Sync model to parent
  useEffect(() => {
    if (activeModel && onUpdateModel && parentActiveModel?.id !== activeModel.id) {
      onUpdateModel({ ...activeModel, accentColor: 'hsl(var(--neon-cyan))' });
    }
  }, [activeModel, onUpdateModel, parentActiveModel]);

  // Sync completed job to project store
  useEffect(() => {
    if (currentJob?.status === 'completed' && currentJob?.result) {
      const r = currentJob.result as any;
      setProject({
        id: currentJob.id,
        name: activeModel?.name || 'Generated Model',
        modelUrl: r.modelUrl || r.downloadUrls?.glb || null,
        modelData: r, layers: [],
        metadata: { prompt: prompt || '', model: selectedModel || activeModel?.id, quality: 'standard', createdAt: new Date() },
      });
    }
  }, [currentJob?.status, currentJob?.result]);

  // ── Tool Panel State ──
  const [activeTool, setActiveTool] = useState<ToolId>('model');
  const [toolPanelCollapsed, setToolPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  // Mobile: tool panel as sheet
  const [mobileToolSheetOpen, setMobileToolSheetOpen] = useState(false);
  const [mobileRightSheetOpen, setMobileRightSheetOpen] = useState(false);

  // ── Viewer Drag & Drop ──
  const [viewerDragOver, setViewerDragOver] = useState(false);
  const [viewerUploading, setViewerUploading] = useState(false);
  const [viewerUploadProgress, setViewerUploadProgress] = useState(0);
  const viewerRef = useRef<HTMLDivElement>(null);

  const handleViewerDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && SUPPORTED_3D_FORMATS.some(f => file.name.toLowerCase().endsWith(f))) {
      setViewerDragOver(true);
    }
  }, []);

  const handleViewerDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setViewerDragOver(false);
  }, []);

  const handleViewerDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setViewerDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!SUPPORTED_3D_FORMATS.some(f => file.name.toLowerCase().endsWith(f))) {
      toast.error(`Unsupported format. Use: ${SUPPORTED_3D_FORMATS.join(', ')}`);
      return;
    }
    if (file.size > 100 * 1024 * 1024) { toast.error('File too large. Max 100MB.'); return; }
    setViewerUploading(true); setViewerUploadProgress(0);
    try {
      await uploadService.uploadWithProgress(file, (p) => setViewerUploadProgress(p.percent), '/api/v1/upload/model');
      const blobUrl = URL.createObjectURL(file);
      window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: blobUrl } }));
      toast.success(`Model loaded: ${file.name}`);
    } catch { toast.error('Failed to upload model'); }
    finally { setViewerUploading(false); setViewerUploadProgress(0); }
  }, []);

  // ── Tool panel content renderer ──
  const renderToolContent = () => {
    switch (activeTool) {
      case 'model':
        return (
          <ModelToolPanel
            modelsList={modelsList} activeModel={activeModel}
            selectedModel={selectedModel} setSelectedModel={setSelectedModel}
            mode={mode} setMode={setMode as (m: string) => void}
            prompt={prompt} setPrompt={setPrompt}
            negativePrompt={negativePrompt} setNegativePrompt={setNegativePrompt}
            uploadedImage={uploadedImage} setUploadedImage={setUploadedImage}
            isGenerating={isGenerating} generate={generate} cancel={cancel}
            currentJob={currentJob}
          />
        );
      case 'segment':
        return <SegmentToolPanel activeModel={activeModel} />;
      case 'remesh':
        return <RemeshToolPanel activeModel={activeModel} />;
      case 'texture':
        return <TextureToolPanel activeModel={activeModel} />;
      case 'rig':
        return <RigToolPanel activeModel={activeModel} />;
      default:
        return null;
    }
  };

  // Entrance animation
  useEffect(() => {
    anime({
      targets: '#tool-strip button',
      opacity: [0, 1], translateX: [-12, 0],
      delay: anime.stagger(60), easing: 'easeOutQuad', duration: 400,
    });
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[hsl(var(--surface-0))] text-[hsl(var(--foreground))]" id="redesigned-3d-workspace">
      {/* ═══ Main workspace area (without status bar) ═══ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ═══ LEFT: Tool Rail + Tool Panel ═══ */}

        {/* Mobile tool panel toggle */}
        <button
          onClick={() => setMobileToolSheetOpen(true)}
          className="lg:hidden fixed bottom-4 left-4 z-40 w-10 h-10 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] flex items-center justify-center shadow-lg"
          aria-label="Open tool panel"
        >
          <PanelLeftOpen size={16} className="text-[hsl(var(--foreground))]" />
        </button>

        {/* Mobile tool sheet overlay */}
        {mobileToolSheetOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileToolSheetOpen(false)} />
            <div className="relative ml-0 w-[300px] max-w-[85vw] bg-[hsl(var(--surface-1))] border-r border-[hsl(var(--border))] flex flex-col animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between p-3 border-b border-[hsl(var(--border))]">
                <span className="text-xs font-bold">Tools</span>
                <button onClick={() => setMobileToolSheetOpen(false)}><X size={14} /></button>
              </div>
              {/* Mobile tool selector */}
              <div className="flex border-b border-[hsl(var(--border))]">
                {TOOLS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button key={t.id} onClick={() => setActiveTool(t.id)}
                      className={cn('flex-1 flex flex-col items-center gap-1 py-2 text-[9px] font-medium transition-all border-b-2',
                        activeTool === t.id
                          ? 'text-[hsl(var(--primary))] border-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] border-transparent'
                      )}
                    >
                      <Icon size={14} />{t.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {renderToolContent()}
              </div>
            </div>
          </div>
        )}

        {/* Desktop tool rail + panel */}
        <div className="hidden lg:flex h-full flex-shrink-0">
          {/* Icon rail — narrow vertical strip */}
          <div className="w-12 bg-[hsl(var(--surface-1))] border-r border-[hsl(var(--border))] flex flex-col items-center py-3 gap-1 flex-shrink-0" id="tool-strip">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  title={tool.label}
                  className={cn(
                    'relative w-9 h-9 rounded-xl flex items-center justify-center transition-all group',
                    isActive
                      ? 'bg-[hsl(var(--primary))/0.12] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground)/0.03)]'
                  )}
                >
                  {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-[hsl(var(--primary))]"></div>}
                  <Icon size={16} />
                </button>
              );
            })}
            {/* Collapse toggle */}
            <div className="mt-auto mb-1">
              <button
                onClick={() => setToolPanelCollapsed(!toolPanelCollapsed)}
                title={toolPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--foreground)/0.03)] transition-all"
              >
                {toolPanelCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
              </button>
            </div>
          </div>
          {/* Expanded tool content panel */}
          {!toolPanelCollapsed && (
            <div className="w-[270px] bg-[hsl(var(--surface-1))] border-r border-[hsl(var(--border))] flex flex-col min-h-0 flex-shrink-0 animate-in slide-in-from-left duration-200">
              {renderToolContent()}
            </div>
          )}
        </div>

        {/* ═══ CENTER: 3D Viewer ═══ */}
        <div
          ref={viewerRef}
          className="flex-1 relative min-w-0 min-h-0"
          onDragOver={handleViewerDragOver}
          onDragLeave={handleViewerDragLeave}
          onDrop={handleViewerDrop}
        >
          {/* The real Three.js viewer */}
          <ThreeDViewer showToolbar={false} />

          {/* Viewport Top Bar */}
          <ViewportTopBar />

          {/* Right-side floating vertical toolbar */}
          <ViewerRightToolbar />

          {/* Bottom material bar */}
          <MaterialBar />

          {/* Bottom center floating dock — 10 tools with icons AND labels */}
          <BottomDock />

          {/* Drag-drop overlay */}
          <ViewerDropOverlay
            isDragOver={viewerDragOver}
            isUploading={viewerUploading}
            uploadProgress={viewerUploadProgress}
          />

          {/* Mobile right panel toggle */}
          <button
            onClick={() => setMobileRightSheetOpen(true)}
            className="lg:hidden fixed bottom-4 right-4 z-40 w-10 h-10 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] flex items-center justify-center shadow-lg"
            aria-label="Open assets panel"
          >
            <Layers size={16} className="text-[hsl(var(--foreground))]" />
          </button>
        </div>

        {/* ═══ RIGHT: Asset / Inspector / History Panel ═══ */}
        {/* Mobile right sheet overlay */}
        {mobileRightSheetOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileRightSheetOpen(false)} />
            <div className="relative w-[320px] max-w-[85vw] bg-[hsl(var(--surface-1))] border-l border-[hsl(var(--border))] flex flex-col animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between p-3 border-b border-[hsl(var(--border))]">
                <span className="text-xs font-bold">Assets & Inspector</span>
                <button onClick={() => setMobileRightSheetOpen(false)}><X size={14} /></button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <RightPanelWrapper
                  history={history}
                  onLoadProject={onLoadProject}
                  activeModel={activeModel}
                  onUpdateModel={onUpdateModel!}
                />
              </div>
            </div>
          </div>
        )}
        {/* Desktop right panel */}
        {!rightPanelCollapsed && (
          <div className="hidden lg:block w-[290px] flex-shrink-0 h-full animate-in slide-in-from-right duration-200">
            <RightPanelWrapper
              history={history}
              onLoadProject={onLoadProject}
              activeModel={activeModel}
              onUpdateModel={onUpdateModel!}
            />
          </div>
        )}
        {/* Desktop collapse toggle for right panel */}
        <div className="hidden lg:flex flex-col items-center justify-center w-5 flex-shrink-0 bg-[hsl(var(--surface-0))] cursor-pointer hover:bg-[hsl(var(--foreground)/0.02)]" onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}>
          <ChevronLeft size={12} className={cn('text-[hsl(var(--muted-foreground))] transition-transform', rightPanelCollapsed && 'rotate-180')} />
        </div>
      </div>

      {/* ═══ BOTTOM STATUS BAR ═══ */}
      <StatusBar jobHistory={jobHistory || []} />
    </div>
  );
}
