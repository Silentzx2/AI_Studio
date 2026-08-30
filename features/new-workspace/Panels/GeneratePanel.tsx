import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Upload, 
  Image as ImageIcon, 
  Type,
  Crop, 
  Wand2, 
  Pencil, 
  ChevronDown, 
  ChevronRight, 
  Zap, 
  Globe,
  Sliders,
  RefreshCw,
  FileText,
  Dices,
  Trash2, 
  Lock,
  AlertCircle,
  Info,
  X,
  Loader2,
  Wrench
} from 'lucide-react';
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
  supports_text_to_3d?: boolean;
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
    generateTextTo3D,
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

  const samplePrompts = [
    'A fierce goblin warrior with spiked steel shoulder armor and glowing amber eyes',
    'Futuristic cybernetic drone with sleek matte-carbon body and blue neon thrusters',
    'Medieval stone watchtower covered in creeping ivy and wooden roof beams',
    'Stylized low-poly fantasy treasure chest with gold trim and glowing gemstones'
  ];

  const currentMode = generationSettings.mode || 'text-to-3d';
  const activeModelId = generationSettings.aiModel || '';
  const activeModelObj = providersList.find(m => m.id === activeModelId) || providersList[0];
  
  const isCurrentModelTextTo3DLocked = activeModelObj ? !activeModelObj.supports_text_to_3d : false;

  useEffect(() => {
    if (currentMode === 'text-to-3d' && isCurrentModelTextTo3DLocked) {
      const firstTextCapable = providersList.find(m => m.supports_text_to_3d);
      if (firstTextCapable) {
        setGenerationSettings(prev => ({ ...prev, aiModel: firstTextCapable.id }));
        setNoticeMessage(`${activeModelObj?.label || 'Model'} does not support Text-to-3D. Switched to ${firstTextCapable.label}.`);
      }
    }
  }, [currentMode, isCurrentModelTextTo3DLocked, activeModelId, setGenerationSettings, providersList]);

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

  const handleTextTo3DTabClick = () => {
    if (isCurrentModelTextTo3DLocked) {
      const firstTextCapable = providersList.find(m => m.supports_text_to_3d);
      if (firstTextCapable) {
        setGenerationSettings(prev => ({ 
          ...prev, 
          mode: 'text-to-3d', 
          aiModel: firstTextCapable.id 
        }));
        setNoticeMessage(`Switched to ${firstTextCapable.label} to unlock Text-to-3D prompt mode.`);
      }
    } else {
      setGenerationSettings(prev => ({ ...prev, mode: 'text-to-3d' }));
    }
  };

  const handleImageTo3DTabClick = () => {
    setGenerationSettings(prev => ({ ...prev, mode: 'image-to-3d', prompt: '' }));
  };

  const handleModelSelect = (model: ProviderOption) => {
    if (currentMode === 'text-to-3d' && !model.supports_text_to_3d) {
      setGenerationSettings(prev => ({
        ...prev,
        aiModel: model.id,
        mode: 'image-to-3d',
        prompt: '',
        lowVram: model.low_vram_supported ? prev.lowVram : false,
      }));
      setNoticeMessage(`${model.label} is an Image-to-3D model. Switched to Image to 3D mode.`);
      return;
    }

    setGenerationSettings(prev => ({
      ...prev,
      aiModel: model.id,
      lowVram: model.low_vram_supported ? prev.lowVram : false,
    }));
  };

  const handleGenerate = () => {
    if (currentMode === 'text-to-3d') {
      if (isCurrentModelTextTo3DLocked) {
        setNoticeMessage(`${activeModelObj?.label || 'Model'} does not support Text-to-3D. Please switch model or use Image-to-3D.`);
        return;
      }
      generateTextTo3D(generationSettings.prompt);
    } else {
      generateImageTo3D(generationSettings.image ?? undefined);
    }
  };

  return (
    <div id="panel-generate-model" className="flex flex-col h-full bg-[hsl(var(--surface-1))] text-xs select-none">
      {/* Header title */}
      <div className="p-3 pb-2 border-b border-[hsl(var(--border))]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[hsl(var(--primary))]" />
            <h2 className="text-xs font-bold text-[hsl(var(--foreground))]">Generate 3D Model</h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/20">
            FastAPI-3D
          </span>
        </div>
      </div>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Notice Message Toast/Banner */}
        {noticeMessage && (
          <div className="p-2.5 rounded-xl bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/50 text-[hsl(var(--primary))] text-[11px] flex items-center justify-between gap-2 animate-in fade-in shadow-md">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Info className="w-3.5 h-3.5 flex-shrink-0 text-[hsl(var(--primary))]" />
              <span className="leading-tight">{noticeMessage}</span>
            </div>
            <button 
              onClick={() => setNoticeMessage(null)}
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] p-0.5 rounded cursor-pointer transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Top Tab Switcher: Text to 3D vs Image to 3D */}
        <div className="space-y-1">
          <div className="flex items-center p-1 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
            {/* Tab 1: Text to 3D (With Lock status when active model doesn't support Text to 3D) */}
            <button
              id="tab-text-to-3d"
              onClick={handleTextTo3DTabClick}
              className={`flex-1 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all relative ${
                currentMode === 'text-to-3d'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-md'
                  : isCurrentModelTextTo3DLocked
                  ? 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-3))]'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              {isCurrentModelTextTo3DLocked && currentMode !== 'text-to-3d' ? (
                <Lock className="w-3.5 h-3.5 text-[hsl(var(--destructive))]" />
              ) : (
                <Type className="w-3.5 h-3.5" />
              )}
              <span>Text to 3D</span>

              {isCurrentModelTextTo3DLocked && currentMode !== 'text-to-3d' && (
                <span className="text-[7.5px] font-mono px-1 py-0.2 rounded bg-[hsl(var(--destructive))]/20 text-[hsl(var(--destructive))] border border-[hsl(var(--destructive))]/30">
                  Locked
                </span>
              )}
            </button>

            {/* Tab 2: Image to 3D (Always supported by TripoSR, InstantMesh, Hunyuan3D, Large-3D) */}
            <button
              id="tab-image-to-3d"
              onClick={handleImageTo3DTabClick}
              className={`flex-1 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                currentMode === 'image-to-3d'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-md'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Image to 3D</span>
            </button>
          </div>

          {/* Helper caption if locked */}
          {isCurrentModelTextTo3DLocked && (
            <div className="px-1 flex items-center gap-1 text-[10px] text-[hsl(var(--destructive))]">
              <Lock className="w-2.5 h-2.5 flex-shrink-0" />
              <span>{activeModelObj?.label || 'Model'} is Image-to-3D only. Click 'Text to 3D' to switch models.</span>
            </div>
          )}
        </div>

        {/* MODE 1: TEXT TO 3D */}
        {currentMode === 'text-to-3d' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {/* Prompt Input Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-[hsl(var(--foreground))] flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
                  <span>Prompt Description</span>
                </label>
                <button
                  onClick={() => {
                    const random = samplePrompts[Math.floor(Math.random() * samplePrompts.length)];
                    setGenerationSettings(prev => ({ ...prev, prompt: random }));
                  }}
                  className="text-[10px] text-[hsl(var(--primary))] hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Dices className="w-3 h-3" />
                  <span>Surprise Me</span>
                </button>
              </div>

              <div className="relative">
                <textarea
                  id="input-text-to-3d-prompt"
                  value={generationSettings.prompt || ''}
                  onChange={(e) => setGenerationSettings(prev => ({ ...prev, prompt: e.target.value }))}
                  placeholder="Describe your 3D asset in detail (e.g., A menacing cybernetic goblin with glowing orange armor, high poly, highly detailed)..."
                  rows={4}
                  className="w-full p-2.5 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] focus:border-[hsl(var(--primary))] outline-none text-xs text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] leading-relaxed resize-none transition-colors"
                />
                {generationSettings.prompt && (
                  <button
                    onClick={() => setGenerationSettings(prev => ({ ...prev, prompt: '' }))}
                    className="absolute right-2.5 bottom-2.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] p-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick Inspiration Tags */}
            <div className="space-y-1">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Quick Add Modifiers:</span>
              <div className="flex flex-wrap gap-1">
                {['Realistic PBR', 'Game Ready Low-Poly', 'Cinematic 8K', 'Stylized Fantasy', 'Subdivision Quad Mesh'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      const cur = generationSettings.prompt ? `${generationSettings.prompt}, ${tag}` : tag;
                      setGenerationSettings(prev => ({ ...prev, prompt: cur }));
                    }}
                    className="px-2 py-1 rounded-lg bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] border border-[hsl(var(--border))] text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors cursor-pointer"
                  >
                    +{tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MODE 2: IMAGE TO 3D */}
        {currentMode === 'image-to-3d' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {/* Sub-Action Icon Bar (Upload, Crop, Wand, Edit) */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
              <SimpleTooltip label="Upload Reference Image">
                <button
                  onClick={() => { setSubAction('upload'); fileInputRef.current?.click(); }}
                  className={`p-1.5 rounded-lg transition-colors ${
                    subAction === 'upload' ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
              </SimpleTooltip>

              <SimpleTooltip label="Crop & Align Subject">
                <button
                  onClick={() => setSubAction('crop')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    subAction === 'crop' ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  <Crop className="w-4 h-4" />
                </button>
              </SimpleTooltip>

              <SimpleTooltip label="AI Image Enhance">
                <button
                  onClick={() => setSubAction('wand')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    subAction === 'wand' ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  <Wand2 className="w-4 h-4" />
                </button>
              </SimpleTooltip>

              <SimpleTooltip label="Paint Mask / Edit">
                <button
                  onClick={() => setSubAction('edit')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    subAction === 'edit' ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </SimpleTooltip>
            </div>

            {/* Image Dropzone Area with Checkerboard Background */}
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/jpeg,image/png,image/webp" 
              className="hidden" 
              onChange={handleFileUpload} 
            />
            
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative w-full aspect-video rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden group transition-all flex flex-col items-center justify-center p-3 ${
                isDragOver
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                  : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/60'
              }`}
              style={{
                backgroundImage: `
                  linear-gradient(45deg, hsl(var(--surface-2)) 25%, transparent 25%), 
                  linear-gradient(-45deg, hsl(var(--surface-2)) 25%, transparent 25%), 
                  linear-gradient(45deg, transparent 75%, hsl(var(--surface-2)) 75%), 
                  linear-gradient(-45deg, transparent 75%, hsl(var(--surface-2)) 75%)
                `,
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                backgroundColor: 'hsl(var(--surface-1))'
              }}
            >
              {uploadProgress.active ? (
                <div className="text-center space-y-2 w-full px-3">
                  <Loader2 className="w-8 h-8 mx-auto animate-spin text-[hsl(var(--primary))]" />
                  <div className="font-semibold text-xs text-[hsl(var(--foreground))]">Uploading...</div>
                  <div className="w-full bg-[hsl(var(--surface-3))] rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[hsl(var(--primary))] h-full rounded-full transition-all duration-200"
                      style={{ width: `${uploadProgress.percent}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    {uploadProgress.percent}% ({(uploadProgress.loadedBytes / 1024 / 1024).toFixed(1)}/{(uploadProgress.totalBytes / 1024 / 1024).toFixed(1)} MB)
                  </div>
                </div>
              ) : generationSettings.image ? (
                <div className="relative w-full h-full">
                  <img 
                    src={generationSettings.image} 
                    alt="Source reference" 
                    className="w-full h-full object-contain" 
                  />
                  <div className="absolute inset-0 bg-[hsl(var(--surface-0))]/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-semibold text-[hsl(var(--primary))]">
                    Click to change reference image
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-1.5">
                  <div className={`w-9 h-9 mx-auto rounded-full bg-[hsl(var(--surface-3))] border border-[hsl(var(--border))] flex items-center justify-center transition-colors ${
                    isDragOver ? 'text-[hsl(var(--primary))] border-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))]'
                  }`}>
                    <Upload className="w-4 h-4" />
                  </div>
                  <div className="font-semibold text-xs text-[hsl(var(--foreground))]">
                    {isDragOver ? 'Drop image here' : 'Upload JPG, PNG, WEBP'}
                  </div>
                  <div className="text-[10px] text-[hsl(var(--muted-foreground))]">Drag reference image or click to browse</div>
                </div>
              )}
            </div>

            {uploadError && (
              <div className="flex items-center gap-1 text-[10px] text-[hsl(var(--destructive))]">
                <AlertCircle className="w-3 h-3" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Auto Remove Background Toggle */}
            <div className="p-2.5 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] flex items-center justify-between">
              <div>
                <span className="text-xs text-[hsl(var(--foreground))] font-medium block">BiRefNet Alpha Matting</span>
                <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Isolates foreground subject with clean alpha mask</span>
              </div>
              <button
                onClick={() => setGenerationSettings(prev => ({ ...prev, removeBackground: !prev.removeBackground }))}
                className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                  generationSettings.removeBackground !== false ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-4))]'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-[hsl(var(--surface-0))] transition-transform ${
                  generationSettings.removeBackground !== false ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>
        )}


        {/* AI Model Generator Choice (With Lock Indicators for models not supporting Text-to-3D) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-[hsl(var(--foreground))] flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
              <span>Generation Architecture</span>
            </label>
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
              {currentMode === 'text-to-3d' ? 'Prompt Diffusion' : 'Image Reconstruction'}
            </span>
          </div>

          {optionsLoading ? (
            <div className="flex items-center justify-center p-4 text-[hsl(var(--muted-foreground))]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              <span className="text-[10px]">Loading models...</span>
            </div>
          ) : providersList.length === 0 ? (
            <div className="p-3 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] text-[10px] text-[hsl(var(--muted-foreground))] text-center">
              No models available. Install models via Settings.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {providersList.map(m => {
                const isSelected = activeModelId === m.id;
                const isLockedInCurrentMode = currentMode === 'text-to-3d' && !m.supports_text_to_3d;
                const isInstalled = m.installed || m.status === 'ready';
                const vramGb = m.vram_required_mb ? (m.vram_required_mb / 1024).toFixed(0) : '?';

                return (
                  <button
                    key={m.id}
                    onClick={() => handleModelSelect(m)}
                    className={`p-2 rounded-xl text-left border transition-all relative cursor-pointer ${
                      isLockedInCurrentMode
                        ? 'bg-[hsl(var(--destructive))]/5 border-[hsl(var(--destructive))]/20 text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--destructive))]/60'
                        : isSelected
                        ? 'bg-[hsl(var(--primary))]/10 border-[hsl(var(--primary))] shadow-sm ring-1 ring-[hsl(var(--primary))]/30'
                        : 'bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] hover:border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 min-w-0">
                        {isLockedInCurrentMode && (
                          <Lock className="w-3 h-3 text-[hsl(var(--destructive))] flex-shrink-0" />
                        )}
                        {!isInstalled && (
                          <SimpleTooltip label="Not installed">
                            <span className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] flex-shrink-0" />
                          </SimpleTooltip>
                        )}
                        <span className={`font-bold text-xs truncate ${
                          isLockedInCurrentMode 
                            ? 'text-[hsl(var(--destructive))]' 
                            : isSelected 
                            ? 'text-[hsl(var(--primary))]' 
                            : 'text-[hsl(var(--foreground))]'
                        }`}>
                          {m.label}
                        </span>
                      </div>

                      <span className={`text-[8px] font-mono px-1 rounded ${
                        isLockedInCurrentMode
                          ? 'bg-[hsl(var(--destructive))]/20 text-[hsl(var(--destructive))]'
                          : isSelected
                          ? 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]'
                          : 'bg-[hsl(var(--surface-3))] text-[hsl(var(--foreground))]'
                      }`}>
                        {isLockedInCurrentMode ? 'Img-Only' : `${vramGb}GB`}
                      </span>
                    </div>

                    <span className="text-[10px] text-[hsl(var(--muted-foreground))] block mt-0.5 truncate">
                      {isLockedInCurrentMode ? 'Requires Image Input' : (m.low_vram_supported ? 'Low-VRAM supported' : `Image Reconstruction`)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Accordion 1: General Settings */}
        <div className="border border-[hsl(var(--border))] rounded-xl overflow-hidden bg-[hsl(var(--surface-1))]">
          <button
            onClick={() => setGeneralSettingsOpen(!generalSettingsOpen)}
            className="w-full px-3 py-2.5 flex items-center justify-between font-bold text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
              <span>General Mesh Settings</span>
            </div>
            {generalSettingsOpen ? <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" /> : <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />}
          </button>

          {generalSettingsOpen && (
            <div className="p-3 pt-1 border-t border-[hsl(var(--border))] space-y-2.5">
              {/* Ultra Mesh Quality Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-[hsl(var(--foreground))] font-medium block">Ultra Mesh Quality</span>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Dense multi-view voxel reconstruction</span>
                </div>
                <button
                  onClick={() => setUltraMeshQuality(!ultraMeshQuality)}
                  className={`w-9 h-5 rounded-full p-0.5 transition-all duration-200 cursor-pointer ${
                    ultraMeshQuality ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-4))]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-[hsl(var(--primary-foreground))] transition-transform ${
                    ultraMeshQuality ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* 8K Texture Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[hsl(var(--foreground))] font-medium">8K Texture Baking</span>
                    <span className="px-1 py-0.2 rounded bg-[hsl(var(--destructive))] text-white text-[8px] font-bold">Ultra</span>
                  </div>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">High-res multi-channel PBR map generation</span>
                </div>
                <button
                  onClick={() => setTexture8k(!texture8k)}
                  className={`w-9 h-5 rounded-full p-0.5 transition-all duration-200 cursor-pointer ${
                    texture8k ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-4))]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-[hsl(var(--primary-foreground))] transition-transform ${
                    texture8k ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Quad Topology Checkbox */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-[hsl(var(--foreground))] font-medium block">Quad-Dominant Topology</span>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Subdivision-ready edge loop flow</span>
                </div>
                <button
                  onClick={() => setGenerationSettings(prev => ({ ...prev, quadTopology: !prev.quadTopology }))}
                  className={`w-9 h-5 rounded-full p-0.5 transition-all duration-200 cursor-pointer ${
                    generationSettings.quadTopology !== false ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-4))]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-[hsl(var(--primary-foreground))] transition-transform ${
                    generationSettings.quadTopology !== false ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Low VRAM Optimization Mode Toggle - Conditionally rendered based on model support */}
              {activeModelObj?.low_vram_supported && (
                <div className="flex items-center justify-between pt-1 border-t border-[hsl(var(--border))]">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[hsl(var(--foreground))] font-medium">Low VRAM Mode</span>
                      <span className="px-1 py-0.2 rounded bg-[hsl(var(--neon-blue))]/20 text-[hsl(var(--neon-blue))] border border-[hsl(var(--neon-blue))]/30 text-[8px] font-mono font-bold">
                        {activeModelObj.low_vram_required_mb ? `<${Math.round(activeModelObj.low_vram_required_mb / 1024)}GB` : '<8GB'}
                      </span>
                    </div>
                    <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Sequential offload &amp; chunked VRAM pipeline</span>
                  </div>
                  <button
                    id="toggle-low-vram-mode"
                    onClick={() => setGenerationSettings(prev => ({ ...prev, lowVram: !prev.lowVram }))}
                    className={`w-9 h-5 rounded-full p-0.5 transition-all duration-200 cursor-pointer ${
                      generationSettings.lowVram ? 'bg-[hsl(var(--neon-blue))]' : 'bg-[hsl(var(--surface-4))]'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-[hsl(var(--primary-foreground))] transition-transform ${
                      generationSettings.lowVram ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              )}

               {/* Privacy Setting (Public / Private) */}
               <div className="flex items-center justify-between pt-1 border-t border-[hsl(var(--border))]">
                 <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                   <Globe className="w-3.5 h-3.5" />
                   <span>Privacy</span>
                 </div>
                 <div className="relative">
                   <button
                     onClick={() => setPrivacyMenuOpen(!privacyMenuOpen)}
                     className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--surface-4))] text-[11px] font-semibold text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))]/50 transition-colors"
                   >
                     <span className="capitalize">{privacy}</span>
                     <ChevronDown className="w-3 h-3 text-[hsl(var(--muted-foreground))]" />
                   </button>

                   {privacyMenuOpen && (
                     <div className="absolute right-0 bottom-full mb-1 w-28 py-1 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] shadow-xl z-50">
                        <button
                          onClick={() => { setPrivacy('public'); setPrivacyMenuOpen(false); }}
                          className="w-full text-left px-2.5 py-1 text-[11px] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-3))]"
                        >
                          🌐 Public
                        </button>
                        <button
                          onClick={() => { setPrivacy('private'); setPrivacyMenuOpen(false); }}
                          className="w-full text-left px-2.5 py-1 text-[11px] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-3))]"
                        >
                         🔒 Private
                       </button>
                     </div>
                   )}
                 </div>
               </div>
             </div>
           )}
         </div>

         {/* Accordion 2: Auto-Optimize Settings */}
         <div className="border border-[hsl(var(--border))] rounded-xl overflow-hidden bg-[hsl(var(--surface-1))]">
           <button
             onClick={() => setGenerationSettings(prev => ({ ...prev, autoOptimize: !prev.autoOptimize }))}
             className="w-full px-3 py-2.5 flex items-center justify-between font-bold text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] transition-colors"
           >
             <div className="flex items-center gap-1.5">
               <Wrench className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
               <span>Auto-Optimize Mesh</span>
               {generationSettings.autoOptimize && (
                 <span className="px-1.5 py-0.5 rounded bg-[hsl(var(--neon-green))]/20 text-[hsl(var(--neon-green))] text-[8px] font-bold">ON</span>
               )}
             </div>
             <div className="flex items-center gap-2">
               {generationSettings.autoOptimize && (
                 <span className="text-[10px] text-[hsl(var(--muted-foreground))]">~{Math.round(100 - (generationSettings.autoOptimizeSettings.targetPolycount / 100000) * 100)}% reduction</span>
               )}
                <div className={`w-9 h-5 rounded-full p-0.5 transition-all duration-200 ${
                  generationSettings.autoOptimize ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-4))]'
                }`}>
                 <div className={`w-4 h-4 rounded-full bg-[hsl(var(--primary-foreground))] transition-transform ${
                   generationSettings.autoOptimize ? 'translate-x-4' : 'translate-x-0'
                 }`} />
               </div>
             </div>
           </button>

           {generationSettings.autoOptimize && (
             <div className="p-3 pt-1 border-t border-[hsl(var(--border))] space-y-3 animate-in fade-in duration-200">
               {/* Target Polycount Slider */}
               <div className="space-y-1.5">
                 <div className="flex items-center justify-between">
                   <span className="text-xs text-[hsl(var(--foreground))] font-medium">Target Polycount</span>
                   <span className="text-[10px] font-mono text-[hsl(var(--primary))]">{generationSettings.autoOptimizeSettings.targetPolycount.toLocaleString()} tris</span>
                 </div>
                 <input
                   type="range"
                   min={5000}
                   max={100000}
                   step={5000}
                   value={generationSettings.autoOptimizeSettings.targetPolycount}
                   onChange={(e) => setGenerationSettings(prev => ({
                     ...prev,
                     autoOptimizeSettings: { ...prev.autoOptimizeSettings, targetPolycount: parseInt(e.target.value) }
                   }))}
                   className="w-full h-1.5 rounded-full appearance-none bg-[hsl(var(--surface-4))] accent-[hsl(var(--primary))] cursor-pointer"
                 />
                 <div className="flex justify-between text-[9px] text-[hsl(var(--muted-foreground))]">
                   <span>5K</span>
                   <span>100K</span>
                 </div>
               </div>

               {/* Fix UVs Checkbox */}
               <div className="flex items-center justify-between">
                 <div>
                   <span className="text-xs text-[hsl(var(--foreground))] font-medium block">Fix UV Mapping</span>
                   <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Repair overlapping UVs &amp; fill islands</span>
                 </div>
                 <button
                   onClick={() => setGenerationSettings(prev => ({
                     ...prev,
                     autoOptimizeSettings: { ...prev.autoOptimizeSettings, fixUVs: !prev.autoOptimizeSettings.fixUVs }
                   }))}
                   className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                     generationSettings.autoOptimizeSettings.fixUVs ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--surface-4))]'
                   }`}
                 >
                   <div className={`w-4 h-4 rounded-full bg-[hsl(var(--primary-foreground))] transition-transform ${
                     generationSettings.autoOptimizeSettings.fixUVs ? 'translate-x-4' : 'translate-x-0'
                   }`} />
                 </button>
               </div>

               {/* Preserve Details Slider */}
               <div className="space-y-1.5">
                 <div className="flex items-center justify-between">
                   <span className="text-xs text-[hsl(var(--foreground))] font-medium">Preserve Details</span>
                   <span className="text-[10px] font-mono text-[hsl(var(--primary))]">{generationSettings.autoOptimizeSettings.preserveDetails}%</span>
                 </div>
                 <input
                   type="range"
                   min={0}
                   max={100}
                   step={5}
                   value={generationSettings.autoOptimizeSettings.preserveDetails}
                   onChange={(e) => setGenerationSettings(prev => ({
                     ...prev,
                     autoOptimizeSettings: { ...prev.autoOptimizeSettings, preserveDetails: parseInt(e.target.value) }
                   }))}
                   className="w-full h-1.5 rounded-full appearance-none bg-[hsl(var(--surface-4))] accent-[hsl(var(--primary))] cursor-pointer"
                 />
                 <div className="flex justify-between text-[9px] text-[hsl(var(--muted-foreground))]">
                   <span>Aggressive</span>
                   <span>Maximum</span>
                 </div>
               </div>

               {/* Estimated Savings */}
               <div className="p-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] flex items-center gap-2">
                 <Info className="w-3.5 h-3.5 text-[hsl(var(--neon-blue))] flex-shrink-0" />
                 <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                   Will reduce ~{Math.max(10, Math.round(100 - (generationSettings.autoOptimizeSettings.targetPolycount / 100000) * 100))}% of polygons
                   {generationSettings.autoOptimizeSettings.fixUVs && ' • Fix UV overlaps'}
                   {generationSettings.autoOptimizeSettings.preserveDetails > 50 && ' • High detail preservation'}
                 </span>
               </div>
             </div>
           )}
         </div>
       </div>

       {/* Bottom Sticky Action Button */}
       <div className="p-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
        <button
          id="btn-generate-model-action"
          onClick={handleGenerate}
          disabled={isExecuting}
          className="w-full py-3 rounded-full bg-[hsl(var(--primary))] hover:brightness-110 text-[hsl(var(--primary-foreground))] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[hsl(var(--primary))]/20 active:scale-98 transition-all disabled:opacity-50"
        >
          {isExecuting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-[hsl(var(--primary-foreground))]" />
              <span>{executionStep || `Generating 3D Asset (${executionProgress || 35}%)...`}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-[hsl(var(--primary-foreground))]" />
              <span>Generate {currentMode === 'text-to-3d' ? 'from Text Prompt' : 'from Reference Image'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
