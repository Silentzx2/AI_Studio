import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  Crop,
  Wand2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Zap,
  Globe,
  Sliders,
  RefreshCw,
  Dices,
  Trash2,
  AlertCircle,
  Info,
  X,
  Loader2,
  Wrench,
  Box,
  Check,
  Package,
  Layers,
  AlertTriangle,
  Gauge
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useWorkspace } from '../store/WorkspaceContext';
import { useManifestModels, type ManifestModel } from '@/hooks/useManifestModels';
import { useUploadProgress } from '@/hooks/useUploadProgress';
import { apiClient } from '@/services/apiClient';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

export const GeneratePanel: React.FC = () => {
  const router = useRouter();
  const {
    isExecuting,
    executionProgress,
    executionStep,
    generateImageTo3D,
    generationSettings,
    setGenerationSettings
  } = useWorkspace();

  // Manifest-driven: only mesh-capable models with weights + repo present
  const { meshCapableModels, loading: optionsLoading, gpuAvailable, freeVramMb } = useManifestModels();
  const providersList = meshCapableModels;

  // Status pill logic — shows what's wrong with the selected model
  const getStatusInfo = () => {
    const selected = providersList.find(m => m.id === generationSettings.aiModel);
    if (!selected) {
      if (providersList.length === 0) return { label: 'No models installed', tone: 'warn' as const };
      return null;
    }
    if (selected.available) return null; // ready → no pill
    if (selected.status === 'weights_missing') return { label: 'Weights missing', tone: 'warn' as const };
    if (!selected.installed) return { label: 'Model not installed', tone: 'warn' as const };
    if (selected.status) return { label: selected.status, tone: 'warn' as const };
    return { label: 'Not ready', tone: 'warn' as const };
  };

  const statusInfo = getStatusInfo();

  const [generalSettingsOpen, setGeneralSettingsOpen] = useState(true);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [subAction, setSubAction] = useState<'upload' | 'crop' | 'wand' | 'edit'>('upload');
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { progress: uploadProgress, startUpload, updateProgress, finishUpload, failUpload } = useUploadProgress();

  // Toggles & Settings
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [privacyMenuOpen, setPrivacyMenuOpen] = useState(false);
  const [generateInParts, setGenerateInParts] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentMode = generationSettings.mode || 'image-to-3d';
  const activeModelId = generationSettings.aiModel || providersList[0]?.id || '';
  const activeModelObj = providersList.find(m => m.id === activeModelId) || providersList[0];

  // Texture toggle: only meaningful for models whose manifest declares a
  // texture capability. The active-mode VRAM comes from the manifest
  // (shape-only vs shape+texture), so disabling texture can drop the
  // footprint dramatically (e.g. TRELLIS 16 GB -> 8 GB).
  const supportsTexture = Boolean(
    activeModelObj?.supports_texture ?? activeModelObj?.supports?.texture_generation
  );
  // Low VRAM toggle: only supported when model manifest explicitly enables low_vram_supported
  const supportsLowVram = Boolean(activeModelObj?.low_vram_supported);
  const activeVramMb = generationSettings.generateTexture !== false
    ? (activeModelObj?.texture_vram_mb || activeModelObj?.vram_required_mb || 0)
    : (activeModelObj?.shape_vram_mb || activeModelObj?.vram_required_mb || 0);
  const vramSufficient = !gpuAvailable || !activeVramMb || freeVramMb >= activeVramMb;
  const vramNotice = vramSufficient
    ? null
    : `Texture needs ~${Math.round(activeVramMb / 1024)} GB, only ${Math.round(freeVramMb / 1024)} GB available — disable texture to generate mesh-only (~${Math.round((activeModelObj?.shape_vram_mb || 0) / 1024)} GB) or switch model.`;

  // Spring transition for tactile feel
  const springTransition = { type: 'spring' as const, stiffness: 400, damping: 25 };

  // Sync the texture toggle with the selected model. Only ever force the
  // toggle OFF for models whose manifest has no texture capability (e.g.
  // TripoSG) — never force it ON, so a user's deliberate mesh-only choice on
  // a texture-capable model survives a model switch.
  useEffect(() => {
    if (!activeModelId || !activeModelObj || supportsTexture) return;
    setGenerationSettings(prev => {
      if (prev.generateTexture === false) return prev;
      return { ...prev, generateTexture: false };
    });
  }, [activeModelId, supportsTexture]);

  useEffect(() => {
    if (!activeModelId && providersList.length > 0) {
      const firstAvailable = providersList.find(m => m.installed) || providersList[0];
      setGenerationSettings(prev => ({ ...prev, aiModel: firstAvailable.id }));
    }
  }, [providersList, activeModelId, setGenerationSettings]);

  const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
  const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  const processImageFile = async (file: File) => {
    setUploadError(null);

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUploadError('Invalid file type. Use JPG, PNG, or WEBP.');
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setUploadError('File too large. Maximum size is 20MB.');
      return;
    }

    try {
      startUpload(file.name, file.size);
      const res = await apiClient.uploadFile<{ url: string; width?: number; height?: number; filename?: string; size_bytes?: number }>(
        '/api/v1/upload/image',
        file,
        (loaded, total) => updateProgress(loaded)
      );
      finishUpload();
      const cleanPrompt = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setGenerationSettings(prev => ({
        ...prev,
        image: res.url,
        prompt: cleanPrompt,
        imageName: cleanPrompt,
      }));
    } catch (err) {
      failUpload();
      setUploadError('Failed to upload image.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  const handleImageTo3DTabClick = () => {
    setGenerationSettings(prev => ({ ...prev, mode: 'image-to-3d' }));
  };

  const handleModelSelect = (model: ManifestModel) => {
    setGenerationSettings(prev => ({
      ...prev,
      aiModel: model.id,
      lowVram: model.low_vram_supported ? prev.lowVram : false,
    }));
  };

  const SAMPLE_PRESETS = [
    {
      id: 'mech-sentinel',
      name: 'Mech Sentinel',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%231a1c23"/><polygon points="150,40 230,100 210,240 90,240 70,100" fill="%232e3440" stroke="%23F9CF00" stroke-width="4"/><circle cx="150" cy="120" r="35" fill="%23F9CF00"/><circle cx="150" cy="120" r="15" fill="%23111"/><rect x="110" y="180" width="80" height="40" rx="8" fill="%23434c5e" stroke="%23d8dee9" stroke-width="2"/><text x="150" y="270" text-anchor="middle" fill="%23eceff4" font-family="sans-serif" font-size="12" font-weight="bold">MECH SENTINEL</text></svg>',
    },
    {
      id: 'cyber-drone',
      name: 'Cyber Drone',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%231a1c23"/><circle cx="150" cy="140" r="70" fill="%232b303c" stroke="%2338bdf8" stroke-width="4"/><path d="M120,130 Q150,110 180,130" stroke="%2338bdf8" stroke-width="8" stroke-linecap="round" fill="none"/><circle cx="130" cy="155" r="8" fill="%23F9CF00"/><circle cx="170" cy="155" r="8" fill="%23F9CF00"/><text x="150" y="260" text-anchor="middle" fill="%23eceff4" font-family="sans-serif" font-size="12" font-weight="bold">CYBER DROID</text></svg>',
    },
    {
      id: 'sci-fi-helmet',
      name: 'Sci-Fi Helmet',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%231a1c23"/><path d="M90,80 Q150,30 210,80 Q240,160 210,230 Q150,260 90,230 Q60,160 90,80 Z" fill="%232e3440" stroke="%23a855f7" stroke-width="4"/><path d="M100,120 Q150,90 200,120 Q210,160 195,180 Q150,200 105,180 Z" fill="%23F9CF00"/><text x="150" y="270" text-anchor="middle" fill="%23eceff4" font-family="sans-serif" font-size="12" font-weight="bold">HELMET MK-IV</text></svg>',
    },
    {
      id: 'obsidian-blade',
      name: 'Obsidian Blade',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="%231a1c23"/><path d="M150,30 L175,170 L150,190 L125,170 Z" fill="%233b4252" stroke="%2310b981" stroke-width="3"/><rect x="110" y="190" width="80" height="12" rx="4" fill="%234c566a"/><rect x="142" y="202" width="16" height="60" rx="3" fill="%232e3440" stroke="%23F9CF00" stroke-width="2"/><circle cx="150" cy="272" r="10" fill="%23F9CF00"/><text x="150" y="292" text-anchor="middle" fill="%23eceff4" font-family="sans-serif" font-size="11" font-weight="bold">OBSIDIAN BLADE</text></svg>',
    },
  ];

  const handleGenerate = () => {
    if (vramNotice) {
      setNoticeMessage(vramNotice);
      setTimeout(() => setNoticeMessage(null), 5000);
      return;
    }
    if (!generationSettings.image) {
      setNoticeMessage('Please upload or select a reference image first before generating.');
      setTimeout(() => setNoticeMessage(null), 4000);
      return;
    }
    generateImageTo3D(generationSettings.image);
  };

  return (
    <div id="panel-generate-model" className="flex flex-col h-full bg-[#191A1D] text-xs select-none">
      {/* Panel Header */}
      <div className="px-3 py-2.5 border-b border-white/[0.08] flex items-center justify-between">
        <span className="font-bold text-[11px] text-white flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#F9CF00]" />
          <span>Generate Model</span>
        </span>
        {statusInfo && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-bold">
            <AlertTriangle className="w-2.5 h-2.5" />
            {statusInfo.label}
          </span>
        )}
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-3 no-scrollbar">
        {/* Notice Message Toast/Banner */}
        <AnimatePresence>
          {noticeMessage && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-2 rounded-xl bg-[#F9CF00]/15 border border-[#F9CF00]/40 text-[#F9CF00] text-[10px] flex items-center justify-between gap-2 overflow-hidden"
            >
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="leading-tight font-medium">{noticeMessage}</span>
              </div>
              <button 
                onClick={() => setNoticeMessage(null)}
                className="text-zinc-400 hover:text-white p-0.5 rounded transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Box (Border with Stylized Outline) */}
        <div className="rounded-xl border border-white/[0.12] bg-[#141518] p-2 space-y-2">
          {/* Sub-Action Icon Bar (Single Image, Multiview, Text, Sketch) */}
          <div className="flex items-center justify-between px-1 py-1 rounded-lg bg-[#1A1B1F] border border-white/[0.06]">
            <SimpleTooltip label="Single Image to 3D">
              <button
                onClick={() => { setSubAction('upload'); fileInputRef.current?.click(); }}
                className={`p-1 rounded-md transition-all ${
                  subAction === 'upload' ? 'bg-[#25262A] text-[#F9CF00]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip label="Multiview Images / Mesh">
              <button
                onClick={() => setSubAction('crop')}
                className={`p-1 rounded-md transition-all ${
                  subAction === 'crop' ? 'bg-[#25262A] text-[#F9CF00]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip label="Text Prompt to 3D">
              <button
                onClick={() => setSubAction('wand')}
                className={`p-1 rounded-md transition-all ${
                  subAction === 'wand' ? 'bg-[#25262A] text-[#F9CF00]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
              </button>
            </SimpleTooltip>

            <SimpleTooltip label="Draw / Sketch to 3D">
              <button
                onClick={() => setSubAction('edit')}
                className={`p-1 rounded-md transition-all ${
                  subAction === 'edit' ? 'bg-[#25262A] text-[#F9CF00]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </SimpleTooltip>
          </div>

          {/* Image Dropzone Area */}
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/jpeg,image/png,image/webp" 
            className="hidden" 
            onChange={handleFileUpload} 
          />
          
          <motion.div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            animate={{ 
              scale: isDragOver ? 1.02 : 1,
              borderColor: isDragOver ? '#F9CF00' : uploadError ? '#ef4444' : 'rgba(255,255,255,0.08)',
            }}
            transition={springTransition}
            className="relative w-full h-36 rounded-lg border border-dashed border-white/[0.1] cursor-pointer overflow-hidden flex flex-col items-center justify-center p-2 group/dropzone bg-[#191A1D]/50 hover:bg-[#191A1D]"
          >
            {uploadProgress.active ? (
              <div className="text-center space-y-2 w-full px-2 z-10">
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-[#F9CF00]" />
                <div className="font-bold text-[10px] text-white">Uploading...</div>
                <div className="w-full bg-[#25262A] rounded-full h-1 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress.percent}%` }}
                    className="bg-[#F9CF00] h-full rounded-full"
                  />
                </div>
              </div>
            ) : generationSettings.image ? (
              <div className="relative w-full h-full group z-10">
                <motion.img 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  src={generationSettings.image} 
                  alt="Source reference" 
                  className="w-full h-full object-contain" 
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-[10px] font-bold text-[#F9CF00] gap-1">
                  <RefreshCw className="w-4 h-4" />
                  <span>Replace</span>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-1.5 z-10">
                <div className={`w-8 h-8 mx-auto rounded-full bg-[#25262A] border border-white/[0.08] flex items-center justify-center transition-all ${
                  isDragOver ? 'text-[#F9CF00] border-[#F9CF00]' : 'text-zinc-400 group-hover/dropzone:text-[#F9CF00]'
                }`}>
                  <Upload className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <div className="font-bold text-[10px] text-zinc-200">
                    Upload JPG, PNG, WEBP
                  </div>
                  <div className="text-[9px] text-zinc-500">
                    Size ≤ 20MB
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Quick Presets / Generate Image for 3D link */}
          <div className="flex items-center justify-between text-[9px] pt-0.5">
            <span className="text-zinc-400">Sample Concept</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (SAMPLE_PRESETS[0]) {
                  setGenerationSettings(prev => ({
                    ...prev,
                    image: SAMPLE_PRESETS[0].url,
                    prompt: SAMPLE_PRESETS[0].name,
                    imageName: SAMPLE_PRESETS[0].name,
                  }));
                }
              }}
              className="text-[#F9CF00] hover:underline"
            >
              Load Sample &gt;
            </button>
          </div>
        </div>

        {/* Geometry & Texture — Texture toggle + active-mode VRAM */}
        <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-300">
            <span>Geometry &amp; Texture</span>
            <span className="text-[8px] text-zinc-500 font-normal">
              {activeVramMb ? `${Math.round(activeVramMb / 1024)} GB active` : '—'}
            </span>
          </div>

          {supportsTexture ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-zinc-300 flex items-center gap-1">
                  <span>Generate Texture</span>
                  <SimpleTooltip
                    label={
                      generationSettings.generateTexture !== false
                        ? `Runs the texture_pbr capability (~${Math.round((activeModelObj?.texture_vram_mb || 0) / 1024)} GB). Disable to generate mesh-only (~${Math.round((activeModelObj?.shape_vram_mb || 0) / 1024)} GB).`
                        : `Mesh-only mode: runs the shape capability only (~${Math.round((activeModelObj?.shape_vram_mb || 0) / 1024)} GB).`
                    }
                  >
                    <Info className="w-3 h-3 text-zinc-500" />
                  </SimpleTooltip>
                </span>
                <button
                  id="btn-toggle-texture"
                  type="button"
                  onClick={() => setGenerationSettings(prev => ({
                    ...prev,
                    generateTexture: prev.generateTexture === false ? true : false,
                  }))}
                  className={`w-7 h-3.5 rounded-full p-0.5 transition-colors relative ${
                    generationSettings.generateTexture !== false ? 'bg-emerald-500' : 'bg-[#25262A]'
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full bg-white transition-transform ${
                    generationSettings.generateTexture !== false ? 'translate-x-3.5' : 'translate-x-0'
                  }`} />
                </button>
              </div>
              {vramNotice && (
                <div className="flex items-start gap-1.5 px-1.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[9px] text-amber-300">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span className="leading-tight">{vramNotice}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[9px] text-zinc-500 px-1">
              {activeModelObj?.label || 'This model'} does not support texture generation.
            </div>
          )}

          {/* Low VRAM Mode Toggle — Conditionally rendered: hidden if model doesn't support low VRAM */}
          {supportsLowVram && (
            <div className="pt-2 border-t border-white/[0.06] space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-zinc-300 flex items-center gap-1 font-medium">
                  <Gauge className="w-3 h-3 text-[#F9CF00]" />
                  <span>Low VRAM Mode</span>
                  <SimpleTooltip
                    label={`Enables sequential layer offloading and memory optimization for ${activeModelObj?.label || 'this model'} (<${activeModelObj?.low_vram_required_mb ? Math.round(activeModelObj.low_vram_required_mb / 1024) : 4} GB VRAM).`}
                  >
                    <Info className="w-3 h-3 text-zinc-500" />
                  </SimpleTooltip>
                </span>
                <button
                  id="btn-toggle-low-vram"
                  type="button"
                  role="switch"
                  aria-checked={Boolean(generationSettings.lowVram)}
                  onClick={() => setGenerationSettings(prev => ({ ...prev, lowVram: !prev.lowVram }))}
                  className={`w-7 h-3.5 rounded-full p-0.5 transition-colors relative cursor-pointer ${
                    generationSettings.lowVram ? 'bg-[#F9CF00]' : 'bg-[#25262A]'
                  }`}
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full bg-black transition-transform ${
                      generationSettings.lowVram ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <div className="text-[9px] text-zinc-400">
                {generationSettings.lowVram ? (
                  <span className="text-[#F9CF00]">Sequential offload active (&lt;8GB GPU mode)</span>
                ) : (
                  <span>Full VRAM mode (~{Math.round((activeVramMb || 0) / 1024)} GB required)</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Members Only Section (Tripo Style) */}
        <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2 space-y-2">
          <div className="flex items-center gap-1 text-[10px] font-bold text-[#F9CF00]">
            <Sparkles className="w-3 h-3" />
            <span>Members Only</span>
          </div>

          {/* Generate in Parts Toggle */}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-300 flex items-center gap-1">
              <span>Generate in Parts</span>
              <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">Trial x1</span>
            </span>
            <button
              type="button"
              onClick={() => setGenerateInParts(prev => !prev)}
              className={`w-7 h-3.5 rounded-full p-0.5 transition-colors relative cursor-pointer ${generateInParts ? 'bg-[#F9CF00]' : 'bg-[#25262A]'}`}
            >
              <div className={`w-2.5 h-2.5 rounded-full bg-black transition-transform ${generateInParts ? 'translate-x-3.5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Privacy Dropdown */}
          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-white/[0.06]">
            <span className="text-zinc-400">Privacy</span>
            <span className="text-zinc-300 font-semibold flex items-center gap-1">
              <span>Public</span>
              <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
            </span>
          </div>
        </div>

        {/* AI Model Generator Choice (Interactive Available Models Selector) */}
        <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2 space-y-1 relative">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wider">AI 3D Model</span>
            <button
              onClick={() => router.push('/settings?section=models')}
              className="text-[9px] text-[#F9CF00] hover:underline flex items-center gap-0.5"
            >
              <Package className="w-2.5 h-2.5" />
              <span>Manage Models</span>
            </button>
          </div>

          {/* Model Selector Button */}
          <button
            id="btn-select-ai-model"
            type="button"
            onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
            className="w-full flex items-center justify-between p-1.5 rounded-lg bg-[#191A1D] border border-white/[0.08] hover:border-white/[0.16] hover:bg-[#202125] transition-all text-left cursor-pointer"
          >
            <div className="flex flex-col min-w-0 pr-2">
              <span className="font-bold text-[10px] text-white flex items-center gap-1.5 truncate">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  (activeModelObj?.available || activeModelObj?.installed)
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                    : 'bg-zinc-500'
                }`} />
                <span className="truncate">{activeModelObj?.label || activeModelId || 'No model available'}</span>
              </span>
              <span className="text-[8px] text-zinc-400 truncate">
                {activeModelObj?.available ? 'Ready for generation' : activeModelObj?.installed ? 'Installed · ready' : 'Not installed · click to configure'}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${modelDropdownOpen ? 'rotate-180 text-[#F9CF00]' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {modelDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-[#191A1D] border border-white/[0.12] rounded-xl p-1.5 shadow-2xl z-50 space-y-1 max-h-56 overflow-y-auto">
              <div className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 px-1 py-0.5">
                Mesh-Capable Models ({providersList.length})
              </div>
              {providersList.length === 0 ? (
                <div className="px-2 py-3 text-[10px] text-zinc-400 text-center">
                  No mesh-capable models installed. Install a model to generate 3D.
                </div>
              ) : (
                providersList.map((m) => {
                  const isSelected = m.id === (activeModelObj?.id || activeModelId);
                  // ponytail: color-code readiness — ready=green,
                  // installed-but-not-preflight=amber, not-installed=gray.
                  // The list is complete (useManifestModels no longer hides
                  // uninstalled models), so the user always sees every option.
                  const isReady = m.available === true;
                  const isInstalled = m.installed === true;
                  const rowBase = isSelected
                    ? 'bg-[#F9CF00] text-black shadow-sm font-bold'
                    : isReady
                      ? 'text-white hover:bg-[#25262A]'
                      : isInstalled
                        ? 'text-amber-300/90 hover:bg-[#25262A]'
                        : 'text-zinc-500 opacity-70 hover:bg-[#25262A] hover:opacity-100';
                  const badgeText = isReady ? 'Ready' : isInstalled ? 'Installed' : 'Not installed';
                  const badgeClass = isSelected
                    ? 'bg-black/15 text-black'
                    : isReady
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : isInstalled
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-white/[0.06] text-zinc-500';
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setGenerationSettings(prev => ({ ...prev, aiModel: m.id }));
                        setModelDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-all ${
                        isSelected
                          ? 'bg-[#F9CF00] text-black shadow-sm font-bold'
                          : rowBase
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            isSelected
                              ? 'bg-black'
                              : isReady || isInstalled
                                ? 'bg-emerald-400'
                                : 'bg-zinc-500'
                          }`} />
                          <span className="text-[10px] font-bold truncate">{m.label}</span>
                          <span className={`text-[7px] px-1 py-0.2 rounded font-mono border ${badgeClass}`}>
                            {badgeText}
                          </span>
                          {m.vram_required_mb ? (
                            <span className={`text-[7px] px-1 py-0.2 rounded font-mono ${
                              isSelected ? 'bg-black/15 text-black' : 'bg-white/[0.08] text-zinc-400'
                            }`}>
                              {Math.round(m.vram_required_mb / 1024)}GB
                            </span>
                          ) : null}
                        </div>
                        <span className={`text-[8px] truncate ${isSelected ? 'text-black/80' : 'text-zinc-400'}`}>
                          {m.low_vram_supported ? 'Low VRAM supported' : `Requires ${Math.round((m.vram_required_mb || 0) / 1024)}GB VRAM`}
                        </span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-black flex-shrink-0" />}
                    </button>
                  );
                })
              )}

              <div className="pt-1 border-t border-white/[0.08]">
                <button
                  onClick={() => {
                    setModelDropdownOpen(false);
                    router.push('/settings?section=models');
                  }}
                  className="w-full py-1.5 px-2 rounded-lg bg-[#141518] hover:bg-[#202125] text-zinc-300 hover:text-[#F9CF00] text-[9px] font-bold flex items-center justify-center gap-1 transition-colors"
                >
                  <Package className="w-3 h-3" />
                  <span>Download / Manage Model Weights</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sticky Action Button */}
      <div className="p-3 border-t border-white/[0.08] bg-[#16181D]">
        <button
          id="btn-generate-model-action"
          onClick={handleGenerate}
          disabled={isExecuting}
          className={`w-full h-10 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
            isExecuting 
              ? 'bg-[#25262A] text-[#F9CF00] border border-[#F9CF00]/20' 
              : 'bg-[#F9CF00] text-black hover:bg-[#ffe033]'
          }`}
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{executionStep || 'Generating 3D Model...'}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 stroke-[2.5]" />
              <span>GENERATE 3D MODEL</span>
            </>
          )}
        </button>
        {isExecuting && (
          <div className="mt-2 w-full bg-[#25262A] h-1.5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${executionProgress || 0}%` }}
              className="bg-[#F9CF00] h-full rounded-full"
            />
          </div>
        )}
      </div>
    </div>
  );
};
