import React, { useState, useRef, useCallback } from 'react';
import { 
  Sparkles, 
  Upload, 
  HelpCircle, 
  ChevronDown, 
  ChevronRight, 
  Palette,
  Check,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../store/WorkspaceContext';
import { useUploadProgress } from '@/hooks/useUploadProgress';

export const TexturePanel: React.FC = () => {
  const router = useRouter();
  const { 
    textureSettings, 
    setTextureSettings, 
    runTextureGeneration, 
    isExecuting,
    systemStats
  } = useWorkspace();

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const { progress: uploadProgress, readFileWithProgress } = useUploadProgress();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    <div id="panel-texture" className="flex flex-col h-full overflow-y-auto px-3 py-3 space-y-3 text-xs select-none">
      {/* Title Header (Screenshot 2) */}
      <div className="flex items-center gap-2 pb-1">
        <Sparkles className="w-4 h-4 text-[hsl(var(--primary))]" />
        <h2 className="text-xs font-bold text-[hsl(var(--foreground))]">Texture</h2>
      </div>

      {/* Workflow Tabs: Texture | PBR */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
          <span>Workflow</span>
          <HelpCircle className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
        </div>
        <div className="grid grid-cols-2 p-1 rounded-xl bg-[hsl(var(--surface-0))] border border-[hsl(var(--border))]">
          <button
            onClick={() => setTextureSettings(prev => ({ ...prev, workflow: 'texture' }))}
            className={`py-2 rounded-lg font-medium transition-all ${
              textureSettings.workflow === 'texture'
                ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))] shadow-sm font-semibold'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            Texture
          </button>
          <button
            onClick={() => {
              setTextureSettings(prev => ({ ...prev, workflow: 'pbr' }));
              router.push('/workspace/pbr');
            }}
            className={`py-2 rounded-lg font-medium transition-all ${
              textureSettings.workflow === 'pbr'
                ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))] shadow-sm font-semibold'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            PBR
          </button>
        </div>
      </div>

      {/* Texture Mode: AI Texture | Manual Paint */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
          <span>Texture Mode</span>
          <HelpCircle className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
        </div>
        <div className="grid grid-cols-2 p-1 rounded-xl bg-[hsl(var(--surface-0))] border border-[hsl(var(--border))]">
          <button
            onClick={() => setTextureSettings(prev => ({ ...prev, mode: 'ai' }))}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg font-medium transition-all ${
              textureSettings.mode === 'ai'
                ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))] shadow-sm font-semibold'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
            <span>AI Texture</span>
          </button>
          <button
            onClick={() => setTextureSettings(prev => ({ ...prev, mode: 'manual' }))}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg font-medium transition-all ${
              textureSettings.mode === 'manual'
                ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))] shadow-sm font-semibold'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            <Palette className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
            <span>Manual Paint</span>
          </button>
        </div>
      </div>

      {/* AI Texture Style Visual Cards (Screenshot 2) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[hsl(var(--muted-foreground))]">
          <span className="font-medium text-[hsl(var(--foreground))]">Style</span>
          <span className="text-[11px] text-[hsl(var(--primary))] capitalize font-medium">{textureSettings.style}</span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {styles.map((style) => {
            const isSelected = textureSettings.style === style.id;
            return (
              <button
                key={style.id}
                onClick={() => setTextureSettings(prev => ({ ...prev, style: style.id as 'realistic' | 'game' | 'stylized' | 'anime' }))}
                className="flex flex-col items-center group cursor-pointer"
              >
                <div className={`relative w-full aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                  isSelected ? 'border-[hsl(var(--primary))] shadow-md shadow-[hsl(var(--primary))]/20 scale-105' : 'border-[hsl(var(--border))] opacity-75 group-hover:opacity-100'
                }`}>
                  <div className={`w-full h-full ${
                    style.id === 'realistic' ? 'bg-[radial-gradient(circle_at_35%_25%,#d6b18a_0,transparent_35%),linear-gradient(135deg,#463226,#9f704d)]' :
                    style.id === 'game' ? 'bg-[radial-gradient(circle_at_70%_35%,#7d8fa8_0,transparent_35%),linear-gradient(135deg,#1f2b39,#516579)]' :
                    style.id === 'stylized' ? 'bg-[radial-gradient(circle_at_40%_30%,hsl(var(--primary))_0,transparent_30%),linear-gradient(135deg,#4c2b8a,#1f172f)]' :
                    'bg-[radial-gradient(circle_at_50%_25%,#f3a3b8_0,transparent_28%),linear-gradient(135deg,#3e1d31,#8d4967)]'
                  }`} />
                </div>
                <span className={`text-[10px] mt-1 font-medium transition-colors ${
                  isSelected ? 'text-[hsl(var(--primary))] font-bold' : 'text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]'
                }`}>
                  {style.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reference Image (Optional) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[hsl(var(--foreground))]">Reference (Optional)</span>
          {textureSettings.referenceImage && (
            <button
              onClick={clearReference}
              className="text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center h-24 rounded-xl border border-dashed cursor-pointer transition-colors p-3 text-center ${
            isDragOver
              ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
              : textureSettings.referenceImage
              ? 'border-[hsl(var(--primary))]/60 bg-[hsl(var(--surface-2))]'
              : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/60 bg-[hsl(var(--surface-1))] hover:bg-[hsl(var(--surface-2))]'
          }`}
        >
          {uploadProgress.active ? (
            <div className="flex flex-col items-center justify-center space-y-1.5 w-full">
              <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--primary))]" />
              <div className="w-full bg-[hsl(var(--surface-3))] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[hsl(var(--primary))] h-full rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                {uploadProgress.percent}% ({(uploadProgress.loadedBytes / 1024 / 1024).toFixed(1)}/{(uploadProgress.totalBytes / 1024 / 1024).toFixed(1)} MB)
              </span>
            </div>
          ) : textureSettings.referenceImage ? (
            <img
              src={textureSettings.referenceImage}
              alt="Reference"
              className="w-full h-full object-contain rounded-lg"
            />
          ) : (
            <>
              <Upload className={`w-5 h-5 mb-1 ${isDragOver ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`} />
              <span className="text-[hsl(var(--foreground))] font-medium text-[11px]">
                {isDragOver ? 'Drop image here' : 'Drag & drop an image here'}
              </span>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">JPG, PNG up to 10MB</span>
            </>
          )}
        </div>
        {referenceError && (
          <div className="flex items-center gap-1 text-[10px] text-[hsl(var(--destructive))]">
            <AlertCircle className="w-3 h-3" />
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
      <div className="space-y-3 pt-1">
        <h3 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Texture Settings</h3>

        {/* Resolution Chips */}
        <div className="space-y-1.5">
          <span className="text-[hsl(var(--foreground))]">Resolution</span>
          <div className="grid grid-cols-4 gap-1.5">
            {(['1K', '2K', '4K', '8K'] as const).map((res) => (
              <button
                key={res}
                onClick={() => setTextureSettings(prev => ({ ...prev, resolution: res }))}
                className={`py-1.5 rounded-lg font-mono font-medium transition-all ${
                  textureSettings.resolution === res
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-0))] font-bold shadow-md'
                    : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--border))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))]'
                }`}
              >
                {res}
              </button>
            ))}
          </div>
        </div>

        {/* Map Types 2-Column Checkboxes (Screenshot 2) */}
        <div className="space-y-1.5">
          <span className="text-[hsl(var(--foreground))]">Map Types</span>
          <div className="grid grid-cols-2 gap-2">
            {mapTypes.map(({ key, label }) => {
              const checked = textureSettings.maps[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleMap(key)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-colors ${
                    checked ? 'bg-[hsl(var(--surface-3))] border-[hsl(var(--primary))]/50 text-[hsl(var(--foreground))]' : 'bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                    checked ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))] text-[hsl(var(--surface-0))]' : 'border-[hsl(var(--border))]'
                  }`}>
                    {checked && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span className="font-medium text-xs">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Collapsible Advanced */}
        <div className="border-t border-[hsl(var(--surface-3))] pt-2">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center justify-between w-full text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] py-1"
          >
            <span className="font-medium">Advanced</span>
            {advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {advancedOpen && (
            <div className="mt-2 space-y-2 p-2.5 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))]">
              <div className="space-y-1">
                <span className="text-[hsl(var(--muted-foreground))]">Texture Prompt Guidance</span>
                <input
                  type="text"
                  value={textureSettings.prompt}
                  onChange={(e) => setTextureSettings(prev => ({ ...prev, prompt: e.target.value }))}
                  className="w-full py-1 px-2 rounded bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] text-xs text-[hsl(var(--foreground))]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Button (Screenshot 2) */}
      <div className="pt-2">
        {systemStats.status !== 'online' && (
          <div className="mb-2 p-2.5 rounded-xl bg-[hsl(var(--destructive))/10] border border-[hsl(var(--destructive))]/30 text-[10px] text-[hsl(var(--destructive))] flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Backend offline — texture generation requires a running FastAPI server.</span>
          </div>
        )}
        <button
          id="btn-action-generate-texture"
          onClick={runTextureGeneration}
          disabled={isExecuting || systemStats.status !== 'online'}
          className="w-full py-3 rounded-xl bg-[hsl(var(--primary))] hover:brightness-110 text-[hsl(var(--surface-0))] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[hsl(var(--primary))]/25 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4 fill-current" />
          <span>{isExecuting ? 'Baking PBR Textures...' : 'Generate Texture'}</span>
        </button>
      </div>
    </div>
  );
};
