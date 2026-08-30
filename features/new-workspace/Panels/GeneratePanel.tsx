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
  Wrench
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useWorkspace } from '../store/WorkspaceContext';
import { useRuntimeOptions } from '@/hooks/useBackendData';
import { useUploadProgress } from '@/hooks/useUploadProgress';
import { apiClient } from '@/services/apiClient';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

interface ProviderOption {
  id: string;
  label: string;
  available?: boolean;
  installed?: boolean;
  status?: string;
  vram_required_mb?: number;
  supports_image_to_3d?: boolean;
  workspace_compatibility?: string[];
  low_vram_supported?: boolean;
  low_vram_required_mb?: number;
}

export const GeneratePanel: React.FC = () => {
  const { 
    isExecuting, 
    executionProgress, 
    executionStep,
    generateImageTo3D,
    generationSettings,
    setGenerationSettings
  } = useWorkspace();

  const { options: runtimeOptions, loading: optionsLoading } = useRuntimeOptions();
  const providersList: ProviderOption[] = runtimeOptions?.three_d_models || [];

  const [generalSettingsOpen, setGeneralSettingsOpen] = useState(true);
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
  const activeModelId = generationSettings.aiModel || '';
  const activeModelObj = providersList.find(m => m.id === activeModelId) || providersList[0];
  
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
    <div id="panel-generate-model" className="flex flex-col h-full bg-[#14161b] text-xs select-none">
      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 no-scrollbar">
        {/* Notice Message Toast/Banner */}
        <AnimatePresence>
          {noticeMessage && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-3 rounded-xl bg-[#F9CF00]/15 border border-[#F9CF00]/40 text-[#F9CF00] text-[11px] flex items-center justify-between gap-2 overflow-hidden shadow-lg"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Info className="w-4 h-4 flex-shrink-0" />
                <span className="leading-tight font-medium">{noticeMessage}</span>
              </div>
              <button 
                onClick={() => setNoticeMessage(null)}
                className="text-zinc-400 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Tab Switcher */}
        <div className="p-1 rounded-xl bg-[#1c1f26] border border-[#272a34] flex">
          <button
            id="tab-image-to-3d"
            onClick={handleImageTo3DTabClick}
            className={`flex-1 py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              currentMode === 'image-to-3d'
                ? 'bg-[#F9CF00] text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ImageIcon className="w-4 h-4 stroke-[2.2]" />
            <span>Image to 3D</span>
          </button>
        </div>

        {/* Generation Panel Content */}
        {currentMode === 'image-to-3d' && (
          <div className="space-y-4">
            {/* Sub-Action Icon Bar (Upload, Crop, Wand, Edit) */}
            <div className="flex items-center justify-around px-1 py-1.5 rounded-xl bg-[#1c1f26] border border-[#272a34]">
              <SimpleTooltip label="Upload Image">
                <button
                  onClick={() => { setSubAction('upload'); fileInputRef.current?.click(); }}
                  className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-all ${
                    subAction === 'upload' ? 'bg-[#2b2f3a] text-[#F9CF00]' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Upload className="w-4 h-4 stroke-[2.2]" />
                </button>
              </SimpleTooltip>

              <SimpleTooltip label="Crop Image">
                <button
                  onClick={() => setSubAction('crop')}
                  className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-all ${
                    subAction === 'crop' ? 'bg-[#2b2f3a] text-[#F9CF00]' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Crop className="w-4 h-4 stroke-[2.2]" />
                </button>
              </SimpleTooltip>

              <SimpleTooltip label="AI Magic Wand">
                <button
                  onClick={() => setSubAction('wand')}
                  className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-all ${
                    subAction === 'wand' ? 'bg-[#2b2f3a] text-[#F9CF00]' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Wand2 className="w-4 h-4 stroke-[2.2]" />
                </button>
              </SimpleTooltip>

              <SimpleTooltip label="Edit Image">
                <button
                  onClick={() => setSubAction('edit')}
                  className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-all ${
                    subAction === 'edit' ? 'bg-[#2b2f3a] text-[#F9CF00]' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Pencil className="w-4 h-4 stroke-[2.2]" />
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
                scale: isDragOver ? 1.03 : 1,
                borderColor: isDragOver ? '#F9CF00' : uploadError ? '#ef4444' : '#272a34',
                backgroundColor: isDragOver ? 'rgba(249, 207, 0, 0.08)' : '#1c1f26',
              }}
              transition={springTransition}
              whileHover={{ scale: 1.01, borderColor: '#3d4252' }}
              whileTap={{ scale: 0.98 }}
              className="relative w-full aspect-square rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden transition-colors flex flex-col items-center justify-center p-4 group/dropzone"
            >
              {uploadProgress.active ? (
                <div className="text-center space-y-4 w-full px-6 z-10">
                  <Loader2 className="w-10 h-10 mx-auto animate-spin text-[#F9CF00]" />
                  <div className="font-bold text-xs text-white">Uploading Asset...</div>
                  <div className="w-full bg-[#2b2f3a] rounded-full h-1.5 overflow-hidden shadow-inner">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress.percent}%` }}
                      className="bg-[#F9CF00] h-full rounded-full"
                    />
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    {uploadProgress.percent}% ({(uploadProgress.loadedBytes / 1024 / 1024).toFixed(1)}/{(uploadProgress.totalBytes / 1024 / 1024).toFixed(1)} MB)
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
                  <motion.div 
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 1 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center transition-opacity text-xs font-bold text-[#F9CF00] gap-2"
                  >
                    <div className="p-2 rounded-full bg-[#F9CF00] text-black">
                      <RefreshCw className="w-5 h-5 stroke-[2.2]" />
                    </div>
                    <span>Replace Image</span>
                  </motion.div>
                </div>
              ) : (
                <div className="text-center space-y-4 z-10">
                  <motion.div 
                    animate={{ 
                      y: isDragOver ? -5 : 0,
                      scale: isDragOver ? 1.1 : 1
                    }}
                    className={`w-14 h-14 mx-auto rounded-2xl bg-[#282b34] border border-[#3d4252] flex items-center justify-center transition-all ${
                    isDragOver ? 'text-[#F9CF00] border-[#F9CF00]' : 'text-zinc-400 group-hover/dropzone:text-[#F9CF00] group-hover/dropzone:border-[#F9CF00]/40'
                  }`}>
                    <Upload className="w-6 h-6 stroke-[2.2]" />
                  </motion.div>
                  <div className="space-y-1">
                    <div className="font-bold text-sm text-white tracking-tight">
                      {isDragOver ? 'Drop to Upload' : 'Drop Reference Image'}
                    </div>
                    <div className="text-[10px] text-zinc-400 max-w-[160px] mx-auto font-medium">
                      PNG, JPG, or WEBP up to 20MB
                    </div>
                  </div>
                  {!isDragOver && (
                    <button className="px-4 py-1.5 rounded-lg bg-[#282b34] border border-[#3d4252] text-[10px] font-bold text-[#F9CF00] hover:bg-[#F9CF00] hover:text-black transition-all">
                      Browse Files
                    </button>
                  )}
                </div>
              )}
            </motion.div>

            {uploadError && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-[11px] text-red-400 font-medium"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{uploadError}</span>
              </motion.div>
            )}

            {/* Quick Reference Sample Concepts */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                <span>Sample Concepts</span>
                <span className="text-[#F9CF00] text-[9px] font-normal">Click to Load</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SAMPLE_PRESETS.map(preset => {
                  const isSelected = generationSettings.image === preset.url;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setGenerationSettings(prev => ({ ...prev, image: preset.url }))}
                      className={`p-2 rounded-xl border flex items-center gap-2.5 transition-all text-left group ${
                        isSelected
                          ? 'bg-[#F9CF00] border-[#F9CF00] text-black shadow-md'
                          : 'bg-[#1c1f26] border-[#272a34] text-zinc-300 hover:border-[#F9CF00]/50 hover:text-white'
                      }`}
                    >
                      <img src={preset.url} alt={preset.name} className="w-7 h-7 rounded-lg bg-black/40 object-cover flex-shrink-0" />
                      <span className="text-[11px] font-bold truncate">{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* AI Model Generator Choice */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#F9CF00] stroke-[2.2]" />
              <span>Model Selection</span>
            </label>
          </div>

          {optionsLoading ? (
            <div className="flex items-center justify-center p-6 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-[11px]">Syncing Models...</span>
            </div>
          ) : providersList.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#1c1f26] border border-[#272a34] text-[11px] text-zinc-400 text-center italic">
              No models found in workspace.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {providersList.map(m => {
                const isSelected = activeModelId === m.id;
                
                return (
                  <button
                    key={m.id}
                    onClick={() => handleModelSelect(m)}
                    className={`p-3 rounded-xl text-left border transition-all relative ${
                      isSelected
                        ? 'bg-[#F9CF00] border-[#F9CF00] text-black font-bold'
                        : 'bg-[#1c1f26] border-[#272a34] text-zinc-300 hover:border-[#3d4252] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs truncate">
                        {m.label}
                      </span>
                      {isSelected && <Sparkles className="w-3 h-3 stroke-[2.2]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Low VRAM Mode - dynamically shown according to model support */}
        {activeModelObj?.low_vram_supported && (
          <div className="p-3.5 rounded-xl bg-[#1c1f26] border border-[#272a34] flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-white font-bold flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#F9CF00]" />
                Low VRAM Mode
              </span>
              <span className="text-[10px] text-zinc-400">
                Optimized for GPUs with ≤{activeModelObj.low_vram_required_mb ? Math.round(activeModelObj.low_vram_required_mb / 1024) : 8}GB VRAM
              </span>
            </div>
            <button
              id="btn-toggle-low-vram"
              onClick={() => setGenerationSettings(prev => ({ ...prev, lowVram: !prev.lowVram }))}
              className={`w-10 h-5 rounded-full p-1 transition-all duration-200 ${
                generationSettings.lowVram ? 'bg-[#F9CF00]' : 'bg-[#2b2f3a]'
              }`}
            >
              <div className={`w-3 h-3 rounded-full bg-black transition-transform ${
                generationSettings.lowVram ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Button */}
      <div className="p-4 border-t border-[#272a34] bg-[#14161b]">
        <button
          id="btn-generate-model-action"
          onClick={handleGenerate}
          disabled={isExecuting}
          className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${
            isExecuting 
              ? 'bg-[#2b2f3a] text-[#F9CF00] border border-[#F9CF00]/20' 
              : 'bg-[#F9CF00] text-black shadow-[#F9CF00]/20 hover:bg-[#ffe033]'
          }`}
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{executionStep || 'GENERATING...'}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 stroke-[2.2]" />
              <span>GENERATE 3D ASSET</span>
            </>
          )}
        </button>
        {isExecuting && (
          <div className="mt-3 w-full bg-[#2b2f3a] h-1.5 rounded-full overflow-hidden">
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
