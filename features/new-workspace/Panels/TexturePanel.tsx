import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Sparkles,
  Upload,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Palette,
  Check,
  AlertCircle,
  Loader2,
  Package,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../store/WorkspaceContext';
import { useUploadProgress } from '@/hooks/useUploadProgress';
import { useManifestModels } from '@/hooks/useManifestModels';

export const TexturePanel: React.FC = () => {
  const router = useRouter();
  const {
    textureSettings,
    setTextureSettings,
    runTextureGeneration,
    isExecuting,
    systemStats,
    currentAsset
  } = useWorkspace();

  // Manifest-driven: only texture-capable models with weights + repo present
  const { textureCapableModels } = useManifestModels();
  const [textureModelDropdownOpen, setTextureModelDropdownOpen] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const { progress: uploadProgress, readFileWithProgress } = useUploadProgress();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const springTransition = { type: 'spring' as const, stiffness: 400, damping: 25 };

  // Auto-select first texture-capable model when none selected
  useEffect(() => {
    if (!textureSettings.modelId && textureCapableModels.length > 0) {
      setTextureSettings(prev => ({ ...prev, modelId: textureCapableModels[0].id }));
    }
  }, [textureCapableModels, textureSettings.modelId, setTextureSettings]);

  const activeTextureModel = textureCapableModels.find(m => m.id === textureSettings.modelId) || textureCapableModels[0];

  // Status pill logic — shows what's wrong with the selected texture model
  const getTextureStatusInfo = () => {
    const selected = textureCapableModels.find(m => m.id === textureSettings.modelId);
    if (!selected) {
      if (textureCapableModels.length === 0) return { label: 'No texture models', tone: 'warn' as const };
      return null;
    }
    if (selected.available) return null;
    if (selected.status === 'weights_missing') return { label: 'Weights missing', tone: 'warn' as const };
    if (!selected.installed) return { label: 'Model not installed', tone: 'warn' as const };
    if (selected.status) return { label: selected.status, tone: 'warn' as const };
    return { label: 'Not ready', tone: 'warn' as const };
  };

  const textureStatusInfo = getTextureStatusInfo();

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  const processImageFile = useCallback(async (file: File) => {
    setReferenceError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setReferenceError('Invalid file type. Use JPG, PNG, or WEBP.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setReferenceError('File too large. Maximum size is 10MB.');
      return;
    }

    try {
      const dataUrl = await readFileWithProgress(file);
      setTextureSettings(prev => ({
        ...prev,
        referenceImage: dataUrl
      }));
    } catch (err) {
      setReferenceError('Failed to read file.');
    }
  }, [setTextureSettings, readFileWithProgress]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const clearReference = () => {
    setTextureSettings(prev => ({ ...prev, referenceImage: null }));
    setReferenceError(null);
  };

  // Style cards matching screenshot 2
  const styles = [
    {
      id: 'realistic',
      label: 'Realistic',
      img: ''
    },
    {
      id: 'game',
      label: 'Game',
      img: ''
    },
    {
      id: 'stylized',
      label: 'Stylized',
      img: ''
    },
    {
      id: 'anime',
      label: 'Anime',
      img: ''
    }
  ];

  const mapTypes = [
    { key: 'albedo', label: 'Albedo' },
    { key: 'normal', label: 'Normal' },
    { key: 'roughness', label: 'Roughness' },
    { key: 'metallic', label: 'Metallic' },
    { key: 'ao', label: 'AO' },
    { key: 'height', label: 'Height' }
  ] as const;

  const toggleMap = (key: keyof typeof textureSettings.maps) => {
    setTextureSettings(prev => ({
      ...prev,
      maps: {
        ...prev.maps,
        [key]: !prev.maps[key]
      }
    }));
  };

  return (
    <div id="panel-texture" className="flex flex-col h-full overflow-hidden bg-[#191A1D] text-xs select-none">
      {/* Panel Header */}
      <div className="px-3 py-2.5 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0">
        <span className="font-bold text-[11px] text-white flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#F9CF00]" />
          <span>Texture Studio</span>
        </span>
        {textureStatusInfo && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-bold">
            <AlertTriangle className="w-2.5 h-2.5" />
            {textureStatusInfo.label}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-3 no-scrollbar">
      {/* Workflow Tabs: Texture | PBR */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="font-bold uppercase tracking-wider text-[10px] text-[#F9CF00]">Workflow</span>
        </div>
        <div className="grid grid-cols-2 p-1 rounded-lg bg-[#1c1f26] border border-[#272a34]">
          <button
            onClick={() => setTextureSettings(prev => ({ ...prev, workflow: 'texture' }))}
            className={`py-1.5 rounded-md font-bold text-[10px] transition-all ${
              textureSettings.workflow === 'texture'
                ? 'bg-[#F9CF00] text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Texture
          </button>
          <button
            onClick={() => {
              setTextureSettings(prev => ({ ...prev, workflow: 'pbr' }));
              router.push('/workspace/pbr');
            }}
            className={`py-1.5 rounded-md font-bold text-[10px] transition-all ${
              textureSettings.workflow === 'pbr'
                ? 'bg-[#F9CF00] text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            PBR
          </button>
        </div>
      </div>

      {/* Texture Mode: AI Texture | Manual Paint */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-zinc-400 font-bold text-[10px] uppercase tracking-wider">
          <span>Texture Mode</span>
          <HelpCircle className="w-3 h-3" />
        </div>
        <div className="grid grid-cols-2 p-1 rounded-lg bg-[#1c1f26] border border-[#272a34]">
          <button
            onClick={() => setTextureSettings(prev => ({ ...prev, mode: 'ai' }))}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md font-bold text-[10px] transition-all ${
              textureSettings.mode === 'ai'
                ? 'bg-[#F9CF00] text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3 stroke-[2.2]" />
            <span>AI Texture</span>
          </button>
          <button
            onClick={() => setTextureSettings(prev => ({ ...prev, mode: 'manual' }))}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md font-bold text-[10px] transition-all ${
              textureSettings.mode === 'manual'
                ? 'bg-[#F9CF00] text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Palette className="w-3 h-3 stroke-[2.2]" />
            <span>Manual Paint</span>
          </button>
        </div>
      </div>

      {/* AI Texture Model Selector — manifest-driven, texture-capable only */}
      <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2 space-y-1 relative">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wider">AI Texture Model</span>
          <button
            onClick={() => router.push('/settings?section=models')}
            className="text-[9px] text-[#F9CF00] hover:underline flex items-center gap-0.5"
          >
            <Package className="w-2.5 h-2.5" />
            <span>Manage</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setTextureModelDropdownOpen(!textureModelDropdownOpen)}
          className="w-full flex items-center justify-between p-1.5 rounded-lg bg-[#191A1D] border border-white/[0.08] hover:border-white/[0.16] hover:bg-[#202125] transition-all text-left cursor-pointer"
        >
          <div className="flex flex-col min-w-0 pr-2">
            <span className="font-bold text-[10px] text-white flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F9CF00]" />
              <span className="truncate">{activeTextureModel?.label || 'No texture model available'}</span>
            </span>
            <span className="text-[8px] text-zinc-400 truncate">
              {activeTextureModel?.available ? 'Ready for texture generation' : 'Install a texture-capable model'}
            </span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${textureModelDropdownOpen ? 'rotate-180 text-[#F9CF00]' : ''}`} />
        </button>

        {textureModelDropdownOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-[#191A1D] border border-white/[0.12] rounded-xl p-1.5 shadow-2xl z-50 space-y-1 max-h-56 overflow-y-auto">
            <div className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 px-1 py-0.5">
              Texture-Capable Models ({textureCapableModels.length})
            </div>
            {textureCapableModels.length === 0 ? (
              <div className="px-2 py-3 text-[10px] text-zinc-400 text-center">
                No texture-capable models installed. Install a model with texture support.
              </div>
            ) : (
              textureCapableModels.map((m) => {
                const isSelected = m.id === (activeTextureModel?.id || textureSettings.modelId);
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      setTextureSettings(prev => ({ ...prev, modelId: m.id }));
                      setTextureModelDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-all ${
                      isSelected
                        ? 'bg-[#F9CF00] text-black shadow-sm font-bold'
                        : 'text-zinc-200 hover:bg-[#25262A] hover:text-white'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold truncate">{m.label}</span>
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
                  setTextureModelDropdownOpen(false);
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

      {/* AI Texture Style Visual Cards */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-zinc-400">
          <span className="font-bold text-white text-[10px] uppercase tracking-wider">Style</span>
          <span className="text-[10px] text-[#F9CF00] capitalize font-bold">{textureSettings.style}</span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {styles.map((style) => {
            const isSelected = textureSettings.style === style.id;
            return (
              <button
                key={style.id}
                onClick={() => setTextureSettings(prev => ({ ...prev, style: style.id as 'realistic' | 'game' | 'stylized' | 'anime' }))}
                className="flex flex-col items-center group cursor-pointer"
              >
                <div className={`relative w-full aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                  isSelected ? 'border-[#F9CF00] shadow-md shadow-[#F9CF00]/20 scale-105' : 'border-[#2f333e] opacity-75 group-hover:opacity-100'
                }`}>
                  <div className={`w-full h-full ${
                    style.id === 'realistic' ? 'bg-[radial-gradient(circle_at_35%_25%,#a8896c_0,transparent_35%),linear-gradient(135deg,#36281e,#6d523e)]' :
                    style.id === 'game' ? 'bg-[radial-gradient(circle_at_70%_35%,#6f8ca8_0,transparent_35%),linear-gradient(135deg,#1e2a38,#3d536d)]' :
                    style.id === 'stylized' ? 'bg-[radial-gradient(circle_at_40%_30%,#F9CF00_0,transparent_30%),linear-gradient(135deg,#5e2f8c,#28143d)]' :
                    'bg-[radial-gradient(circle_at_50%_25%,#ff99bb_0,transparent_28%),linear-gradient(135deg,#4d1c31,#8f335b)]'
                  }`} />
                </div>
                <span className={`text-[9px] mt-1 font-bold transition-colors ${
                  isSelected ? 'text-[#F9CF00]' : 'text-zinc-400 group-hover:text-white'
                }`}>
                  {style.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reference Image (Optional) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-bold text-white text-[10px] uppercase tracking-wider">Reference (Optional)</span>
          {textureSettings.referenceImage && (
            <button
              onClick={clearReference}
              className="text-[9px] text-zinc-400 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <motion.div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          animate={{
            scale: isDragOver ? 1.02 : 1,
            borderColor: isDragOver ? '#F9CF00' : '#2f333e'
          }}
          transition={springTransition}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          className={`flex flex-col items-center justify-center h-24 rounded-xl border-2 border-dashed cursor-pointer transition-colors p-2 text-center bg-[#1e2026] shadow-lg ${
            isDragOver
              ? 'bg-[#F9CF00]/10 border-[#F9CF00]'
              : textureSettings.referenceImage
              ? 'border-[#F9CF00]/40'
              : 'hover:border-[#3d4252]'
          }`}
        >
          {uploadProgress.active ? (
            <div className="flex flex-col items-center justify-center space-y-2 w-full px-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#F9CF00]" />
              <div className="w-full bg-[#282b34] rounded-full h-1 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress.percent}%` }}
                  className="bg-[#F9CF00] h-full rounded-full"
                />
              </div>
              <span className="text-[9px] text-zinc-400 font-mono">
                {uploadProgress.percent}% ({(uploadProgress.loadedBytes / 1024 / 1024).toFixed(1)}/{(uploadProgress.totalBytes / 1024 / 1024).toFixed(1)} MB)
              </span>
            </div>
          ) : textureSettings.referenceImage ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative w-full h-full group"
            >
              <img
                src={textureSettings.referenceImage}
                alt="Reference"
                className="w-full h-full object-contain rounded-md"
              />
            </motion.div>
          ) : (
            <>
              <Upload className={`w-5 h-5 mb-1 ${isDragOver ? 'text-[#F9CF00]' : 'text-zinc-400'} stroke-[2.2]`} />
              <span className="text-white font-bold text-[10px]">
                {isDragOver ? 'Drop image here' : 'Upload Reference Image'}
              </span>
              <span className="text-[8px] text-zinc-400 mt-0.5">JPG, PNG, WebP up to 10MB</span>
            </>
          )}
        </motion.div>
        {referenceError && (
          <div className="flex items-center gap-1 text-[9px] text-red-400">
            <AlertCircle className="w-2.5 h-2.5" />
            <span>{referenceError}</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Texture Settings: Resolution & Map Types */}
      <div className="space-y-2 pt-1">
        <h3 className="text-[10px] font-bold text-white uppercase tracking-wider">Texture Settings</h3>

        {/* Resolution Chips */}
        <div className="space-y-1">
          <span className="text-zinc-400 text-[10px]">Resolution</span>
          <div className="grid grid-cols-4 gap-1">
            {(['1K', '2K', '4K', '8K'] as const).map((res) => (
              <button
                key={res}
                onClick={() => setTextureSettings(prev => ({ ...prev, resolution: res }))}
                className={`py-1 rounded-md font-mono font-bold text-[10px] transition-all ${
                  textureSettings.resolution === res
                    ? 'bg-[#F9CF00] text-black shadow-md'
                    : 'bg-[#1e2026] text-zinc-400 hover:bg-[#282b34] hover:text-white border border-[#2f333e]'
                }`}
              >
                {res}
              </button>
            ))}
          </div>
        </div>

        {/* Map Types 2-Column Checkboxes */}
        <div className="space-y-1">
          <span className="text-zinc-400 text-[10px]">Map Types</span>
          <div className="grid grid-cols-2 gap-1">
            {mapTypes.map(({ key, label }) => {
              const checked = textureSettings.maps[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleMap(key)}
                  className={`flex items-center gap-1.5 p-1.5 rounded-md border text-left transition-colors ${
                    checked ? 'bg-[#1e2026] border-[#F9CF00] text-white' : 'bg-[#1e2026] border-[#2f333e] text-zinc-400 hover:text-white'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
                    checked ? 'bg-[#F9CF00] border-[#F9CF00] text-black' : 'border-[#3d4252]'
                  }`}>
                    {checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <span className="font-bold text-[10px]">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Collapsible Advanced */}
        <div className="border-t border-[#2f333e] pt-1.5">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center justify-between w-full text-zinc-400 hover:text-white py-0.5 font-bold text-[10px]"
          >
            <span>Advanced Config</span>
            {advancedOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {advancedOpen && (
            <div className="mt-1.5 p-2 rounded-lg bg-[#1e2026] border border-[#2f333e]">
              <div className="space-y-1">
                <span className="text-zinc-400 text-[10px]">Texture Prompt Guidance</span>
                <input
                  type="text"
                  value={textureSettings.prompt}
                  onChange={(e) => setTextureSettings(prev => ({ ...prev, prompt: e.target.value }))}
                  className="w-full py-1 px-2 rounded-md bg-[#282b34] border border-[#3d4252] text-[10px] text-white placeholder-zinc-500 focus:outline-none focus:border-[#F9CF00]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="pt-1">
        <button
          id="btn-action-generate-texture"
          onClick={runTextureGeneration}
          disabled={isExecuting || (!textureSettings.referenceImage && !currentAsset?.source?.viewUrl && !currentAsset?.source?.localUrl)}
          className="w-full h-10 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4 stroke-[2.2]" />
          <span>{isExecuting ? 'Baking PBR Textures...' : (!textureSettings.referenceImage && !currentAsset ? 'SELECT A MODEL' : 'GENERATE TEXTURE')}</span>
        </button>
      </div>
      </div>
    </div>
  );
};
