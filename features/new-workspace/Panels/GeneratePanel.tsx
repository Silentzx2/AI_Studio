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
    generate3DModel,
    generationSettings,
    setGenerationSettings
  } = useWorkspace();

  const [isEnhancing, setIsEnhancing] = useState(false);

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

  const [panelTab, setPanelTab] = useState<'create' | 'mesh' | 'engine'>('create');
  const [generalSettingsOpen, setGeneralSettingsOpen] = useState(true);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [subAction, setSubAction] = useState<'upload' | 'crop' | 'wand' | 'edit'>('upload');
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { progress: uploadProgress, startUpload, updateProgress, finishUpload, failUpload } = useUploadProgress();

  // Close model dropdown on outside click or Escape key
  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [modelDropdownOpen]);

  // Toggles & Settings
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [privacyMenuOpen, setPrivacyMenuOpen] = useState(false);
  const [generateInParts, setGenerateInParts] = useState(false);
  const [meshSettingsOpen, setMeshSettingsOpen] = useState(true);
  const [gameReadyOpen, setGameReadyOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentMode = generationSettings.mode || 'image-to-3d';
  const activeModelId = generationSettings.aiModel || providersList[0]?.id || '';
  const activeModelObj = providersList.find(m => m.id === activeModelId) || providersList[0];

  const getModelMeshRecommendation = () => {
    const id = (activeModelId || '').toLowerCase();
    if (id.includes('triposg')) {
      return {
        label: 'TripoSG (Dense Isosurface ~60k–80k tris)',
        tip: 'Decimation to 20k–30k recommended for smooth web rendering and clean topology.',
        target: 25000,
        preserve: 70,
      };
    }
    if (id.includes('hunyuan')) {
      return {
        label: 'Hunyuan3D (High-Density ~80k–120k tris)',
        tip: 'Decimation to 35k–50k preserves sharp details and delicate creases.',
        target: 35000,
        preserve: 80,
      };
    }
    if (id.includes('trellis')) {
      return {
        label: 'TRELLIS (Structured Flexicubes ~40k–70k tris)',
        tip: 'Decimation to 30k maintains crisp silhouettes and fast load times.',
        target: 30000,
        preserve: 75,
      };
    }
    return {
      label: 'Generative Mesh Pipeline',
      tip: 'Auto-decimation to 30k recommended for game-ready polycount.',
      target: 30000,
      preserve: 75,
    };
  };

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

  const triggerPrewarm = (modelId: string) => {
    if (!modelId) return;
    fetch('/api/v1/runtime/prewarm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId }),
    }).catch(() => {});
  };

  useEffect(() => {
    if (!activeModelId && providersList.length > 0) {
      const firstAvailable = providersList.find(m => m.installed) || providersList[0];
      setGenerationSettings(prev => ({ ...prev, aiModel: firstAvailable.id }));
      triggerPrewarm(firstAvailable.id);
    } else if (activeModelId) {
      triggerPrewarm(activeModelId);
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

  const handleEnhancePrompt = async () => {
    const currentPrompt = generationSettings.prompt || generationSettings.imageName || '';
    if (!currentPrompt.trim()) {
      setNoticeMessage('Type a prompt first to enhance it with AI 3D descriptors.');
      setTimeout(() => setNoticeMessage(null), 3500);
      return;
    }
    setIsEnhancing(true);
    try {
      const res = await fetch('/api/v1/generation/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: currentPrompt }),
      });
      if (res.ok) {
        const json = await res.json();
        const enhanced = json?.data?.enhanced_prompt;
        if (enhanced) {
          setGenerationSettings(prev => ({ ...prev, prompt: enhanced }));
        }
      }
    } catch {
      // ignore
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleGenerate = () => {
    if (vramNotice) {
      setNoticeMessage(vramNotice);
      setTimeout(() => setNoticeMessage(null), 5000);
      return;
    }
    const isTextMode = subAction === 'wand' || (!generationSettings.image && Boolean(generationSettings.prompt?.trim()));
    if (!isTextMode && !generationSettings.image) {
      setNoticeMessage('Please upload a reference image or type a prompt for Text-to-3D.');
      setTimeout(() => setNoticeMessage(null), 4000);
      return;
    }
    if (isTextMode && !generationSettings.prompt?.trim()) {
      setNoticeMessage('Please enter a text prompt to generate a 3D model.');
      setTimeout(() => setNoticeMessage(null), 4000);
      return;
    }
    generate3DModel(isTextMode ? 'text-to-3d' : 'image-to-3d');
  };

  return (
    <div id="panel-generate-model" className="flex flex-col h-full bg-[#191A1D] text-xs select-none">
      {/* Panel Header */}
      <div className="px-3 py-2.5 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0">
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

      {/* Segmented Mode Navigation Tabs: Create | Mesh | Engine */}
      <div className="px-2.5 pt-2 pb-1.5 border-b border-white/[0.06] bg-[#141518]/60 flex-shrink-0">
        <div className="grid grid-cols-3 p-1 rounded-xl bg-[#191A1D] border border-white/[0.08] gap-1">
          <button
            type="button"
            onClick={() => setPanelTab('create')}
            className={`py-1.5 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              panelTab === 'create'
                ? 'bg-[#F9CF00] text-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Create</span>
          </button>
          <button
            type="button"
            onClick={() => setPanelTab('mesh')}
            className={`py-1.5 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              panelTab === 'mesh'
                ? 'bg-[#F9CF00] text-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>Mesh</span>
            {generationSettings.autoOptimize && (
              <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${panelTab === 'mesh' ? 'bg-black/20 text-black' : 'bg-[#F9CF00]/20 text-[#F9CF00]'}`}>
                {Math.round((generationSettings.autoOptimizeSettings?.targetPolycount || 30000) / 1000)}k
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setPanelTab('engine')}
            className={`py-1.5 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              panelTab === 'engine'
                ? 'bg-[#F9CF00] text-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>Engine</span>
            {generationSettings.gameReady && (
              <span className={`text-[8px] px-1 py-0.2 rounded font-bold uppercase ${panelTab === 'engine' ? 'bg-black/20 text-black' : 'bg-emerald-500/20 text-emerald-400'}`}>
                Ready
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2.5 pb-12 space-y-3 scrollbar-thin scrollbar-thumb-zinc-700/60 scrollbar-track-transparent pr-1.5">
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
                className="text-zinc-400 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TAB 1: CREATE (Prompt, Image, Model, Texture) */}
        {panelTab === 'create' && (
          <div className="space-y-3">
            {/* Input Mode Selector Bar */}
            <div className="rounded-xl border border-white/[0.12] bg-[#141518] p-2 space-y-2">
              <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#18191D] border border-white/[0.06]">
                <SimpleTooltip label="Single Image to 3D">
                  <button
                    type="button"
                    onClick={() => {
                      setSubAction('upload');
                      setGenerationSettings(prev => ({ ...prev, mode: 'image-to-3d' }));
                      fileInputRef.current?.click();
                    }}
                    className={`py-1.5 px-1 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      subAction === 'upload'
                        ? 'bg-[#25272D] text-[#F9CF00] shadow-sm border border-[#F9CF00]/30'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border border-transparent'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span className="truncate">Image</span>
                  </button>
                </SimpleTooltip>

                <SimpleTooltip label="Multiview Images / Mesh">
                  <button
                    type="button"
                    onClick={() => setSubAction('crop')}
                    className={`py-1.5 px-1 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      subAction === 'crop'
                        ? 'bg-[#25272D] text-[#F9CF00] shadow-sm border border-[#F9CF00]/30'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border border-transparent'
                    }`}
                  >
                    <Box className="w-3.5 h-3.5" />
                    <span className="truncate">Multi</span>
                  </button>
                </SimpleTooltip>

                <SimpleTooltip label="Text Prompt to 3D">
                  <button
                    type="button"
                    onClick={() => {
                      setSubAction('wand');
                      setGenerationSettings(prev => ({ ...prev, mode: 'text-to-3d' }));
                    }}
                    className={`py-1.5 px-1 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      subAction === 'wand'
                        ? 'bg-[#25272D] text-[#F9CF00] shadow-sm border border-[#F9CF00]/30'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border border-transparent'
                    }`}
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span className="truncate">Text</span>
                  </button>
                </SimpleTooltip>

                <SimpleTooltip label="Draw / Sketch to 3D">
                  <button
                    type="button"
                    onClick={() => setSubAction('edit')}
                    className={`py-1.5 px-1 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      subAction === 'edit'
                        ? 'bg-[#25272D] text-[#F9CF00] shadow-sm border border-[#F9CF00]/30'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border border-transparent'
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span className="truncate">Sketch</span>
                  </button>
                </SimpleTooltip>
              </div>

              {/* Image Dropzone Area (Visible in image/crop/sketch modes) */}
              {subAction !== 'wand' && (
                <>
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

                  {/* Quick Presets / Clear image */}
                  <div className="flex items-center justify-between text-[9px] pt-0.5">
                    <span className="text-zinc-400">{generationSettings.image ? 'Reference Loaded' : 'Sample Concept'}</span>
                    <div className="flex items-center gap-2">
                      {generationSettings.image && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGenerationSettings(prev => ({ ...prev, image: null, imageName: undefined, mode: 'text-to-3d' }));
                          }}
                          className="text-rose-400 hover:underline cursor-pointer"
                        >
                          Clear Image
                        </button>
                      )}
                      <button
                        type="button"
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
                        className="text-[#F9CF00] hover:underline cursor-pointer"
                      >
                        Load Sample &gt;
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Text Prompt & AI Enhance Card */}
            <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-[#F9CF00]" />
                  <span>Prompt / Description</span>
                </span>
                <button
                  type="button"
                  onClick={handleEnhancePrompt}
                  disabled={isEnhancing || !(generationSettings.prompt || generationSettings.imageName)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F9CF00]/15 hover:bg-[#F9CF00]/25 text-[#F9CF00] border border-[#F9CF00]/30 transition-all font-bold text-[9px] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Enhance prompt with 3D quality descriptors (PBR, topology, lighting)"
                >
                  {isEnhancing ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-2.5 h-2.5" />
                  )}
                  <span>{isEnhancing ? 'Enhancing...' : 'AI Enhance'}</span>
                </button>
              </div>

              <textarea
                value={generationSettings.prompt || ''}
                onChange={(e) => setGenerationSettings(prev => ({ ...prev, prompt: e.target.value }))}
                placeholder={
                  subAction === 'wand'
                    ? "Describe your 3D model (e.g. Cyberpunk samurai helmet with gold accents, glowing visor)..."
                    : "Describe or refine model concept (optional for image-to-3d)..."
                }
                rows={2}
                className="w-full bg-[#191A1D] border border-white/[0.08] rounded-lg p-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#F9CF00]/50 resize-none font-sans"
              />

              {/* Quick Style Chips */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                {['PBR Game Asset', 'Clean Quad Topology', 'Sci-Fi', 'Stylized', 'Photorealistic'].map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => {
                      setGenerationSettings(prev => {
                        const base = prev.prompt?.trim() || '';
                        if (base.toLowerCase().includes(style.toLowerCase())) return prev;
                        return { ...prev, prompt: base ? `${base}, ${style}` : style };
                      });
                    }}
                    className="px-2 py-0.5 rounded-full bg-[#1C1E23] hover:bg-[#252830] text-zinc-300 hover:text-white border border-white/[0.08] hover:border-[#F9CF00]/40 text-[9px] font-medium transition-all active:scale-95 cursor-pointer"
                  >
                    + {style}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Model Generator Choice */}
            <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2 space-y-1 relative">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">AI 3D Model Engine</span>
                <button
                  onClick={() => router.push('/settings?section=models')}
                  className="text-xs text-[#F9CF00] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                >
                  <Package className="w-3 h-3" />
                  <span>Manage Models</span>
                </button>
              </div>

              {/* Model Selector Button */}
              <button
                id="btn-select-ai-model"
                type="button"
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-[#191A1D] border border-white/[0.08] hover:border-white/[0.16] hover:bg-[#202125] transition-all text-left cursor-pointer"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="font-bold text-xs text-white flex items-center gap-1.5 truncate">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      (activeModelObj?.available || activeModelObj?.installed)
                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                        : 'bg-zinc-500'
                    }`} />
                    <span className="truncate">{activeModelObj?.label || activeModelId || 'No model available'}</span>
                  </span>
                  <span className="text-[10px] text-zinc-400 truncate mt-0.5">
                    {activeModelObj?.available ? 'Ready for generation' : activeModelObj?.installed ? 'Installed · ready' : 'Not installed · click to configure'}
                  </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${modelDropdownOpen ? 'rotate-180 text-[#F9CF00]' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {modelDropdownOpen && (
                <div 
                  ref={modelDropdownRef}
                  className="absolute left-0 right-0 top-full mt-1 bg-[#191A1D] border border-white/[0.12] rounded-xl p-1.5 shadow-2xl z-50 space-y-1 max-h-56 overflow-y-auto"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-1.5 py-0.5">
                    Mesh-Capable Models ({providersList.length})
                  </div>
                  {providersList.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-zinc-400 text-center">
                      No mesh-capable models installed. Install a model to generate 3D.
                    </div>
                  ) : (
                    providersList.map((m) => {
                      const isSelected = m.id === (activeModelObj?.id || activeModelId);
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
                            triggerPrewarm(m.id);
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#F9CF00] text-black shadow-sm font-bold'
                              : rowBase
                          }`}
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                isSelected
                                  ? 'bg-black'
                                  : isReady || isInstalled
                                    ? 'bg-emerald-400'
                                    : 'bg-zinc-500'
                              }`} />
                              <span className="text-xs font-bold truncate">{m.label}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${badgeClass}`}>
                                {badgeText}
                              </span>
                              {m.vram_required_mb ? (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                                  isSelected ? 'bg-black/15 text-black' : 'bg-white/[0.08] text-zinc-400'
                                }`}>
                                  {Math.round(m.vram_required_mb / 1024)}GB
                                </span>
                              ) : null}
                            </div>
                            <span className={`text-[10px] truncate mt-0.5 ${isSelected ? 'text-black/80' : 'text-zinc-400'}`}>
                              {m.low_vram_supported ? 'Low VRAM supported' : `Requires ${Math.round((m.vram_required_mb || 0) / 1024)}GB VRAM`}
                            </span>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-black flex-shrink-0" />}
                        </button>
                      );
                    })
                  )}

                  <div className="pt-1.5 border-t border-white/[0.08]">
                    <button
                      onClick={() => {
                        setModelDropdownOpen(false);
                        router.push('/settings?section=models');
                      }}
                      className="w-full py-2 px-2.5 rounded-lg bg-[#141518] hover:bg-[#202125] text-zinc-300 hover:text-[#F9CF00] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>Download / Manage Model Weights</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Texture Synthesis Card */}
            <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-300">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#F9CF00]" />
                  <span>Texture Synthesis</span>
                </span>
                <span className="text-[8px] text-zinc-500 font-normal">
                  {activeVramMb ? `${Math.round(activeVramMb / 1024)} GB active` : '—'}
                </span>
              </div>

              {supportsTexture ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-zinc-300 flex items-center gap-1 font-medium">
                      <span>Generate PBR Texture</span>
                      <SimpleTooltip
                        label={
                          generationSettings.generateTexture !== false
                            ? `Runs the texture_pbr capability (~${Math.round((activeModelObj?.texture_vram_mb || 0) / 1024)} GB). Exports model with diffuse, normal, and roughness maps.`
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
                      className={`w-7 h-3.5 rounded-full p-0.5 transition-colors relative cursor-pointer ${
                        generationSettings.generateTexture !== false ? 'bg-emerald-500' : 'bg-[#25262A]'
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full bg-white transition-transform ${
                        generationSettings.generateTexture !== false ? 'translate-x-3.5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                  <div className="text-[8px] flex items-center gap-1">
                    {generationSettings.generateTexture !== false ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        <span>Texture enabled · Output will be textured GLB</span>
                      </span>
                    ) : (
                      <span className="text-zinc-400">
                        Texture disabled · Output will be untextured mesh
                      </span>
                    )}
                  </div>
                  {vramNotice && (
                    <div className="flex items-start gap-1.5 px-1.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[9px] text-amber-300">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span className="leading-tight">{vramNotice}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[9px] text-zinc-400 bg-white/[0.02] p-1.5 rounded-lg border border-white/[0.04]">
                  <Info className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                  <span>{activeModelObj?.label || 'This model'} generates geometry only. Switch to Hunyuan3D or TRELLIS for textured models.</span>
                </div>
              )}

              {/* Low VRAM Mode Toggle */}
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

            {/* Quick Summary Pill Strip (Jump to Mesh / Engine) */}
            <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between text-[10px]">
              <button
                type="button"
                onClick={() => setPanelTab('mesh')}
                className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Click to configure polygon budget & topology"
              >
                <Box className="w-3 h-3 text-[#F9CF00]" />
                <span>
                  Mesh:{' '}
                  <strong className="text-zinc-200">
                    {generationSettings.autoOptimize
                      ? `${Math.round((generationSettings.autoOptimizeSettings?.targetPolycount || 30000) / 1000)}k tris`
                      : 'Raw'}
                  </strong>
                </span>
                <ChevronRight className="w-2.5 h-2.5 text-zinc-500" />
              </button>

              <div className="h-3 w-px bg-white/[0.1]" />

              <button
                type="button"
                onClick={() => setPanelTab('engine')}
                className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Click to configure game-ready targets & LODs"
              >
                <Gauge className="w-3 h-3 text-emerald-400" />
                <span>
                  Engine:{' '}
                  <strong className="text-zinc-200">
                    {generationSettings.gameReady
                      ? (generationSettings.targetPlatform || 'Game').toUpperCase()
                      : 'Standard'}
                  </strong>
                </span>
                <ChevronRight className="w-2.5 h-2.5 text-zinc-500" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: MESH (Polycount, Decimation, Quad/Adaptive, UVs) */}
        {panelTab === 'mesh' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                  <Box className="w-3.5 h-3.5 text-[#F9CF00]" />
                  <span>Mesh Budget & Topology</span>
                  <SimpleTooltip label="Configures target polygon count, UV unwrapping, and topology decimation for all 3D models.">
                    <Info className="w-3.5 h-3.5 text-zinc-500" />
                  </SimpleTooltip>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  generationSettings.autoOptimize
                    ? 'bg-[#F9CF00]/15 text-[#F9CF00] border border-[#F9CF00]/30 font-bold'
                    : 'bg-white/[0.06] text-zinc-400'
                }`}>
                  {generationSettings.autoOptimize
                    ? `${(generationSettings.autoOptimizeSettings?.targetPolycount || 30000).toLocaleString()} tris`
                    : 'Raw Density'}
                </span>
              </div>

              {/* Model-Aware Recommendation Banner */}
              {(() => {
                const rec = getModelMeshRecommendation();
                return (
                  <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                        <Layers className="w-3.5 h-3.5 text-[#F9CF00]" />
                        <span>{rec.label}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setGenerationSettings(prev => ({
                            ...prev,
                            autoOptimize: true,
                            meshQuality: 'medium',
                            autoOptimizeSettings: {
                              ...prev.autoOptimizeSettings,
                              targetPolycount: rec.target,
                              preserveDetails: rec.preserve,
                              fixUVs: true,
                            },
                          }));
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-[#F9CF00]/15 hover:bg-[#F9CF00]/25 text-[#F9CF00] font-bold transition-colors cursor-pointer"
                      >
                        Apply Recommended
                      </button>
                    </div>
                    <div className="text-[10px] text-zinc-400 leading-tight">
                      {rec.tip}
                    </div>
                  </div>
                );
              })()}

              {/* Mesh Topology Selection */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-200 font-semibold">Output Topology</span>
                  <span className="text-[10px] text-zinc-400 font-mono uppercase">
                    {generationSettings.topologyMode || 'adaptive'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'adaptive', label: 'Adaptive', desc: 'Preserve features' },
                    { id: 'triangle', label: 'Triangle', desc: 'Game-ready tris' },
                    { id: 'quad', label: 'Quad', desc: 'QuadriFlow quads' },
                  ].map(t => {
                    const active = (generationSettings.topologyMode || 'adaptive') === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setGenerationSettings(prev => ({
                            ...prev,
                            topologyMode: t.id as 'triangle' | 'quad' | 'adaptive',
                            quadTopology: t.id === 'quad',
                          }));
                        }}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer flex flex-col items-center justify-center ${
                          active
                            ? 'bg-[#F9CF00] text-black shadow-sm'
                            : 'bg-[#191A1D] text-zinc-300 hover:text-white hover:bg-[#202125] border border-white/[0.08]'
                        }`}
                      >
                        <span>{t.label}</span>
                        <span className={`text-[9px] font-normal leading-tight ${active ? 'text-black/75' : 'text-zinc-500'}`}>
                          {t.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Auto Optimize / Decimation Switch */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.04]">
                <div>
                  <span className="text-zinc-200 font-semibold block">Optimize Mesh Budget</span>
                  <span className="text-[10px] text-zinc-400">Decimate polygon count to target budget</span>
                </div>
                <button
                  id="btn-toggle-auto-optimize"
                  type="button"
                  role="switch"
                  aria-checked={Boolean(generationSettings.autoOptimize)}
                  onClick={() => setGenerationSettings(prev => ({ ...prev, autoOptimize: !prev.autoOptimize }))}
                  className={`w-8 h-4 rounded-full p-0.5 transition-colors relative cursor-pointer ${
                    generationSettings.autoOptimize ? 'bg-[#F9CF00]' : 'bg-[#25262A]'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-black transition-transform ${
                    generationSettings.autoOptimize ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {generationSettings.autoOptimize ? (
                <div className="space-y-2.5 pt-1">
                  {/* Preset Buttons */}
                  <div className="space-y-1">
                    <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Polycount Presets</span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: '10k', label: '10k Low', count: 10000, quality: 'low' as const },
                        { id: '30k', label: '30k Std', count: 30000, quality: 'medium' as const },
                        { id: '75k', label: '75k High', count: 75000, quality: 'high' as const },
                        { id: 'raw', label: 'Raw Max', count: 0, quality: 'ultra' as const },
                      ].map(preset => {
                        const isPresetActive = preset.id === 'raw'
                          ? !generationSettings.autoOptimize
                          : generationSettings.autoOptimize && (generationSettings.autoOptimizeSettings?.targetPolycount === preset.count);
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              if (preset.id === 'raw') {
                                setGenerationSettings(prev => ({
                                  ...prev,
                                  autoOptimize: false,
                                  meshQuality: 'ultra',
                                }));
                              } else {
                                setGenerationSettings(prev => ({
                                  ...prev,
                                  autoOptimize: true,
                                  meshQuality: preset.quality,
                                  autoOptimizeSettings: {
                                    ...prev.autoOptimizeSettings,
                                    targetPolycount: preset.count,
                                  },
                                }));
                              }
                            }}
                            className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                              isPresetActive
                                ? 'bg-[#F9CF00] text-black shadow-sm'
                                : 'bg-[#191A1D] text-zinc-300 hover:text-white hover:bg-[#202125] border border-white/[0.08]'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Target Polycount Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-medium">Target Polycount</span>
                      <span className="font-mono text-[#F9CF00] font-bold">
                        {(generationSettings.autoOptimizeSettings?.targetPolycount || 30000).toLocaleString()} tris
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5000}
                      max={120000}
                      step={5000}
                      value={generationSettings.autoOptimizeSettings?.targetPolycount || 30000}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setGenerationSettings(prev => ({
                          ...prev,
                          autoOptimize: true,
                          autoOptimizeSettings: {
                            ...prev.autoOptimizeSettings,
                            targetPolycount: val,
                          },
                        }));
                      }}
                      className="w-full h-1.5 rounded-full appearance-none bg-[#25262A] accent-[#F9CF00] cursor-pointer"
                    />
                  </div>

                  {/* Detail Preservation Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-medium">Preserve Details</span>
                      <span className="font-mono text-[#F9CF00] font-bold">
                        {generationSettings.autoOptimizeSettings?.preserveDetails ?? 75}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={generationSettings.autoOptimizeSettings?.preserveDetails ?? 75}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setGenerationSettings(prev => ({
                          ...prev,
                          autoOptimizeSettings: {
                            ...prev.autoOptimizeSettings,
                            preserveDetails: val,
                          },
                        }));
                      }}
                      className="w-full h-1.5 rounded-full appearance-none bg-[#25262A] accent-[#F9CF00] cursor-pointer"
                    />
                  </div>

                  {/* Fix UVs and Clean Normals Toggle */}
                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-white/[0.04]">
                    <div>
                      <span className="text-zinc-200 font-medium block">Repair UVs & Normals</span>
                      <span className="text-[10px] text-zinc-400">Fixes overlapping UV islands and recalculates normals</span>
                    </div>
                    <button
                      id="btn-toggle-fix-uvs"
                      type="button"
                      role="switch"
                      aria-checked={Boolean(generationSettings.autoOptimizeSettings?.fixUVs ?? true)}
                      onClick={() => setGenerationSettings(prev => ({
                        ...prev,
                        autoOptimizeSettings: {
                          ...prev.autoOptimizeSettings,
                          fixUVs: !(prev.autoOptimizeSettings?.fixUVs ?? true),
                        },
                      }))}
                      className={`w-8 h-4 rounded-full p-0.5 transition-colors relative cursor-pointer ${
                        (generationSettings.autoOptimizeSettings?.fixUVs ?? true) ? 'bg-emerald-500' : 'bg-[#25262A]'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                        (generationSettings.autoOptimizeSettings?.fixUVs ?? true) ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[10px] text-zinc-400">
                  Mesh optimization is off. Models will export with raw full triangle density directly from the AI generator.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ENGINE (Game-Ready Platforms, LODs, Collisions, Pipeline Summary) */}
        {panelTab === 'engine' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                  <Gauge className="w-3.5 h-3.5 text-[#00FF9D]" />
                  <span>Game Engine & LOD Pipeline</span>
                  <SimpleTooltip label="Configures target platform budgets, multi-tier LODs (LOD0–LOD3), physics collision hulls, and game engine asset compliance.">
                    <Info className="w-3.5 h-3.5 text-zinc-500" />
                  </SimpleTooltip>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  generationSettings.gameReady
                    ? 'bg-emerald-500/15 text-[#00FF9D] border border-emerald-500/30 font-bold'
                    : 'bg-white/[0.06] text-zinc-400'
                }`}>
                  {generationSettings.gameReady
                    ? `${(generationSettings.targetPlatform || 'generic').toUpperCase()}`
                    : 'Standard'}
                </span>
              </div>

              {/* Game Ready Mode Toggle */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.04]">
                <div>
                  <span className="text-zinc-200 font-semibold block">Game-Ready Mode</span>
                  <span className="text-[10px] text-zinc-400">Preserves source master while optimizing asset for real-time engines</span>
                </div>
                <button
                  id="btn-toggle-game-ready"
                  type="button"
                  role="switch"
                  aria-checked={Boolean(generationSettings.gameReady)}
                  onClick={() => setGenerationSettings(prev => ({
                    ...prev,
                    gameReady: !prev.gameReady,
                    autoOptimize: !prev.gameReady ? true : prev.autoOptimize,
                  }))}
                  className={`w-8 h-4 rounded-full p-0.5 transition-colors relative cursor-pointer ${
                    generationSettings.gameReady ? 'bg-emerald-500' : 'bg-[#25262A]'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-black transition-transform ${
                    generationSettings.gameReady ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Target Platform Selector */}
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Target Platform Budget</span>
                <div className="grid grid-cols-5 gap-1">
                  {[
                    { id: 'mobile', label: 'Mobile', budget: 18000 },
                    { id: 'low', label: 'Low', budget: 28000 },
                    { id: 'medium', label: 'Medium', budget: 45000 },
                    { id: 'high', label: 'High', budget: 85000 },
                    { id: 'cinematic', label: 'Cine', budget: 180000 },
                  ].map(p => {
                    const isSelected = (generationSettings.targetPlatform || 'medium') === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setGenerationSettings(prev => ({
                            ...prev,
                            gameReady: true,
                            targetPlatform: p.id as any,
                            autoOptimize: true,
                            autoOptimizeSettings: {
                              ...prev.autoOptimizeSettings,
                              targetPolycount: p.budget,
                            },
                          }));
                        }}
                        className={`py-1 px-0.5 rounded-lg text-[10px] font-bold transition-all text-center cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500 text-black shadow-sm'
                            : 'bg-[#191A1D] text-zinc-300 hover:text-white hover:bg-[#202125] border border-white/[0.08]'
                        }`}
                      >
                        <span className="block truncate">{p.label}</span>
                        <span className="block text-[8px] opacity-80 mt-0.5">~{Math.round(p.budget / 1000)}k</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Generate Multi-tier LODs Toggle */}
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-white/[0.04]">
                <div>
                  <span className="text-zinc-200 font-semibold block">Generate Multi-Tier LODs</span>
                  <span className="text-[10px] text-zinc-400">Cascade levels: LOD0 (Master), LOD1 (50%), LOD2 (25%), LOD3 (12.5%)</span>
                </div>
                <button
                  id="btn-toggle-generate-lod"
                  type="button"
                  role="switch"
                  aria-checked={Boolean(generationSettings.generateLOD)}
                  onClick={() => setGenerationSettings(prev => ({ ...prev, generateLOD: !prev.generateLOD }))}
                  className={`w-8 h-4 rounded-full p-0.5 transition-colors relative cursor-pointer ${
                    generationSettings.generateLOD ? 'bg-emerald-500' : 'bg-[#25262A]'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-black transition-transform ${
                    generationSettings.generateLOD ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {generationSettings.generateLOD && (
                <div className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded-lg bg-black/20 border border-white/[0.04]">
                  <span className="text-zinc-400">Cascade Count:</span>
                  <div className="flex items-center gap-1">
                    {[2, 3, 4].map(count => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setGenerationSettings(prev => ({ ...prev, lodCount: count }))}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          (generationSettings.lodCount || 3) === count
                            ? 'bg-[#00FF9D] text-black'
                            : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
                        }`}
                      >
                        {count} Levels
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Collision Mesh Toggle */}
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-white/[0.04]">
                <div>
                  <span className="text-zinc-200 font-semibold block">Physics Collision Mesh</span>
                  <span className="text-[10px] text-zinc-400">Generates simplified convex hull for physics simulation</span>
                </div>
                <button
                  id="btn-toggle-collision"
                  type="button"
                  role="switch"
                  aria-checked={Boolean(generationSettings.generateCollision)}
                  onClick={() => setGenerationSettings(prev => ({ ...prev, generateCollision: !prev.generateCollision }))}
                  className={`w-8 h-4 rounded-full p-0.5 transition-colors relative cursor-pointer ${
                    generationSettings.generateCollision ? 'bg-emerald-500' : 'bg-[#25262A]'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-black transition-transform ${
                    generationSettings.generateCollision ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>

            {/* Real-time Pipeline Execution Summary */}
            <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2.5 space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between font-bold text-zinc-300">
                <span className="flex items-center gap-1 text-[#F9CF00]">
                  <Sparkles className="w-3 h-3" />
                  <span>Pipeline Execution Flow</span>
                </span>
                <span className="text-zinc-500 font-mono">Backend authoritative</span>
              </div>
              <div className="space-y-1 text-zinc-400 font-mono">
                <div className="flex items-center justify-between">
                  <span>1. Generator:</span>
                  <span className="text-white">{activeModelObj?.label || activeModelId || 'Local Provider'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>2. Material:</span>
                  <span className={generationSettings.generateTexture !== false ? 'text-[#00FF9D]' : 'text-zinc-400'}>
                    {generationSettings.generateTexture !== false ? 'Multi-view Texture / PBR' : 'Untextured Geometry'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>3. Topology:</span>
                  <span className="text-white">
                    {generationSettings.gameReady
                      ? `Game-Ready (${(generationSettings.targetPlatform || 'medium').toUpperCase()})`
                      : (generationSettings.autoOptimize ? `${(generationSettings.autoOptimizeSettings?.targetPolycount || 30000).toLocaleString()} tris` : 'Raw Density')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>4. Master Asset:</span>
                  <span className="text-emerald-400">Preserved (source.glb)</span>
                </div>
                {(generationSettings.generateLOD || generationSettings.generateCollision) && (
                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                    <span>5. Packages:</span>
                    <span className="text-[#F9CF00]">
                      {[
                        generationSettings.generateLOD ? `${generationSettings.lodCount || 3} LODs` : null,
                        generationSettings.generateCollision ? 'Collision Hull' : null,
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Button */}
      <div className="p-3 border-t border-white/[0.1] bg-[#16181D]/95 backdrop-blur-md relative z-20 flex-shrink-0">
        <button
          id="btn-generate-model-action"
          onClick={handleGenerate}
          disabled={isExecuting}
          className={`w-full h-10 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            isExecuting 
              ? 'bg-[#25262A] text-[#F9CF00] border border-[#F9CF00]/20' 
              : 'bg-gradient-to-b from-[#FFE24C] to-[#F9CF00] hover:from-[#FFE660] hover:to-[#FFD700] text-black shadow-[0_4px_16px_rgba(249,207,0,0.25)] hover:shadow-[0_6px_20px_rgba(249,207,0,0.35)]'
          }`}
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-[#F9CF00]" />
              <span className="tracking-wide">{executionStep || 'Generating 3D Model...'}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 stroke-[2.5]" />
              <span className="tracking-wider">GENERATE 3D MODEL</span>
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
