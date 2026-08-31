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
  Layers
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useWorkspace } from '../store/WorkspaceContext';
import { useRuntimeOptions } from '@/hooks/useBackendData';
import { useUploadProgress } from '@/hooks/useUploadProgress';
import { apiClient } from '@/services/apiClient';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

interface ProviderOption {
  id: string;
  label: string;
  name?: string;
  description?: string;
  available?: boolean;
  installed?: boolean;
  status?: string;
  vram_required_mb?: number;
  supports_image_to_3d?: boolean;
  workspace_compatibility?: string[];
  low_vram_supported?: boolean;
  low_vram_required_mb?: number;
}

const FALLBACK_MODELS: ProviderOption[] = [
  { id: 'trellis', label: 'Trellis 3D (v1.0)', description: 'High-fidelity geometry & 16-bit PBR maps', available: true, installed: true, vram_required_mb: 8192 },
  { id: 'triposr', label: 'TripoSR (Fast)', description: 'Ultra-fast feedforward 3D reconstruction (<1s)', available: true, installed: true, vram_required_mb: 4096 },
  { id: 'hunyuan3d-1.0', label: 'Tencent HunYuan 3D', description: 'Detailed high-polygon geometric reconstruction', available: true, installed: true, vram_required_mb: 10240 },
  { id: 'tripo-v3', label: 'Tripo v3.1 Studio', description: 'Production-ready assets with optimized topology', available: true, installed: true, vram_required_mb: 8192 },
  { id: 'instantmesh', label: 'InstantMesh', description: 'Fast multi-view large reconstruction model', available: true, installed: false, vram_required_mb: 6144 },
  { id: 'shap-e', label: 'Shap-E (OpenAI)', description: 'Lightweight implicit 3D generator (CPU compatible)', available: true, installed: false, vram_required_mb: 2048 },
];

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

  const { options: runtimeOptions, loading: optionsLoading } = useRuntimeOptions();
  const rawProviders: ProviderOption[] = runtimeOptions?.three_d_models || [];
  const providersList: ProviderOption[] = rawProviders.length > 0 ? rawProviders : FALLBACK_MODELS;

  const [generalSettingsOpen, setGeneralSettingsOpen] = useState(true);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [subAction, setSubAction] = useState<'upload' | 'crop' | 'wand' | 'edit'>('upload');
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { progress: uploadProgress, startUpload, updateProgress, finishUpload, failUpload } = useUploadProgress();
  
  // Toggles & Settings
  const [ultraMeshQuality, setUltraMeshQuality] = useState(true);
  const [texture8k, setTexture8k] = useState(false);
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [privacyMenuOpen, setPrivacyMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentMode = generationSettings.mode || 'image-to-3d';
  const activeModelId = generationSettings.aiModel || providersList[0]?.id || 'trellis';
  const activeModelObj = providersList.find(m => m.id === activeModelId) || providersList[0] || FALLBACK_MODELS[0];
  
  // Spring transition for tactile feel
  const springTransition = { type: 'spring' as const, stiffness: 400, damping: 25 };

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
      setGenerationSettings(prev => ({
        ...prev,
        image: res.url
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

  const handleModelSelect = (model: ProviderOption) => {
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
    if (!generationSettings.image) {
      const defaultImg = SAMPLE_PRESETS[0].url;
      setGenerationSettings(prev => ({ ...prev, image: defaultImg }));
      generateImageTo3D(defaultImg);
    } else {
      generateImageTo3D(generationSettings.image);
    }
  };

  return (
    <div id="panel-generate-model" className="flex flex-col h-full bg-[#191A1D] text-xs select-none">
      {/* Panel Header */}
      <div className="px-3 py-2.5 border-b border-white/[0.08] flex items-center justify-between">
        <span className="font-bold text-[11px] text-white flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#F9CF00]" />
          <span>Generate Model</span>
        </span>
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
                if (SAMPLE_PRESETS[0]) setGenerationSettings(prev => ({ ...prev, image: SAMPLE_PRESETS[0].url }));
              }}
              className="text-[#F9CF00] hover:underline"
            >
              Load Sample &gt;
            </button>
          </div>
        </div>

        {/* General Settings Accordion (Geometry & Texture) */}
        <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-300">
            <span>Geometry &amp; Texture</span>
            <ChevronRight className="w-3 h-3 text-zinc-500" />
          </div>
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
              onClick={() => setGenerationSettings(prev => ({ ...prev, lowVram: !prev.lowVram }))}
              className={`w-7 h-3.5 rounded-full p-0.5 transition-colors relative ${generationSettings.lowVram ? 'bg-[#F9CF00]' : 'bg-[#25262A]'}`}
            >
              <div className={`w-2.5 h-2.5 rounded-full bg-black transition-transform ${generationSettings.lowVram ? 'translate-x-3.5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* 8K Texture Toggle */}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-300 flex items-center gap-1">
              <span>8K Texture</span>
              <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">Trial x1</span>
            </span>
            <button
              className="w-7 h-3.5 rounded-full p-0.5 bg-[#25262A] relative"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-500 translate-x-0" />
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
                <span className="w-1.5 h-1.5 rounded-full bg-[#F9CF00]" />
                <span className="truncate">{activeModelObj.label || activeModelObj.name || activeModelId}</span>
              </span>
              <span className="text-[8px] text-zinc-400 truncate">
                {activeModelObj.description || 'Production 3D Mesh Generation'}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${modelDropdownOpen ? 'rotate-180 text-[#F9CF00]' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {modelDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-[#191A1D] border border-white/[0.12] rounded-xl p-1.5 shadow-2xl z-50 space-y-1 max-h-56 overflow-y-auto">
              <div className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 px-1 py-0.5">
                Available Generation Models ({providersList.length})
              </div>
              {providersList.map((m) => {
                const isSelected = (m.id || m.name) === (activeModelObj.id || activeModelObj.name);
                return (
                  <button
                    key={m.id || m.name}
                    onClick={() => {
                      setGenerationSettings(prev => ({ ...prev, aiModel: m.id || m.name || '' }));
                      setModelDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-all ${
                      isSelected 
                        ? 'bg-[#F9CF00] text-black shadow-sm font-bold' 
                        : 'text-zinc-200 hover:bg-[#25262A] hover:text-white'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold truncate">{m.label || m.name}</span>
                        {m.vram_required_mb ? (
                          <span className={`text-[7px] px-1 py-0.2 rounded font-mono ${
                            isSelected ? 'bg-black/15 text-black' : 'bg-white/[0.08] text-zinc-400'
                          }`}>
                            {Math.round(m.vram_required_mb / 1024)}GB
                          </span>
                        ) : null}
                      </div>
                      {m.description && (
                        <span className={`text-[8px] truncate ${isSelected ? 'text-black/80' : 'text-zinc-400'}`}>
                          {m.description}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-black flex-shrink-0" />}
                  </button>
                );
              })}

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
