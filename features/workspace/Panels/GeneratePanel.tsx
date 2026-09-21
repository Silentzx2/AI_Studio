import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Gauge,
  Eraser,
  Plus,
  Eye,
  Undo2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useWorkspace } from '../store/WorkspaceContext';
import { useUploadProgress } from '@/hooks/useUploadProgress';
import { getApiClient } from '@/services/apiClient';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { Switch } from '@/components/ui/switch';

export interface MeshQualityPreset {
  id: 'low' | 'medium' | 'high' | 'ultra' | 'raw';
  label: string;
  subLabel: string;
  tagline: string;
  grid: string;
  steps: number;
  polyEstimate: string;
  badge: string;
  tooltip: string;
}

export const MESH_QUALITY_OPTIONS: MeshQualityPreset[] = [
  {
    id: 'low',
    label: 'Low',
    subLabel: '256³ / 20s',
    tagline: 'Fast preview',
    grid: '256',
    steps: 20,
    polyEstimate: '~15k tris',
    badge: '256³ • 20 steps (Fast)',
    tooltip: 'Low: Fast preview (256³ grid • 20 steps • ~15k tris)',
  },
  {
    id: 'medium',
    label: 'Medium',
    subLabel: '384³ / 35s',
    tagline: 'Balanced workflow',
    grid: '384',
    steps: 35,
    polyEstimate: '~30k tris',
    badge: '384³ • 35 steps (Balanced)',
    tooltip: 'Medium: Balanced workflow (384³ grid • 35 steps • ~30k tris)',
  },
  {
    id: 'high',
    label: 'High',
    subLabel: '512³ / 50s',
    tagline: 'Detailed production',
    grid: '512',
    steps: 50,
    polyEstimate: '~60k tris',
    badge: '512³ • 50 steps (Detailed)',
    tooltip: 'High: Detailed production (512³ grid • 50 steps • ~60k tris)',
  },
  {
    id: 'ultra',
    label: 'Ultra',
    subLabel: '640³ / 75s',
    tagline: 'Maximum fidelity',
    grid: '640',
    steps: 75,
    polyEstimate: '~100k tris',
    badge: '640³ • 75 steps (Maximum)',
    tooltip: 'Ultra: Maximum fidelity (640³ grid • 75 steps • ~100k tris)',
  },
  {
    id: 'raw',
    label: 'Raw',
    subLabel: 'Master',
    tagline: 'Unoptimized Master',
    grid: '640',
    steps: 75,
    polyEstimate: 'Full Polycount',
    badge: 'Master • Full Polycount',
    tooltip: 'Raw: Unoptimized Master (640³ grid • 75 steps • Full native density)',
  },
];

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

  const isRawQualityActive = !generationSettings.autoOptimize && generationSettings.meshQuality === 'ultra';
  const currentQualityKey: 'low' | 'medium' | 'high' | 'ultra' | 'raw' = 
    !generationSettings.autoOptimize
      ? 'raw'
      : (generationSettings.meshQuality || 'high');

  const activeQualityConfig = MESH_QUALITY_OPTIONS.find(q => q.id === currentQualityKey) || MESH_QUALITY_OPTIONS[2];

  const handleSelectQuality = useCallback((id: 'low' | 'medium' | 'high' | 'ultra' | 'raw') => {
    if (id === 'raw') {
      setGenerationSettings(prev => ({
        ...prev,
        autoOptimize: false,
        meshQuality: 'ultra',
      }));
    } else if (id === 'ultra') {
      setGenerationSettings(prev => ({
        ...prev,
        autoOptimize: true,
        meshQuality: 'ultra',
        autoOptimizeSettings: {
          ...prev.autoOptimizeSettings,
          targetPolycount: prev.autoOptimizeSettings?.targetPolycount && prev.autoOptimizeSettings.targetPolycount > 75000
            ? prev.autoOptimizeSettings.targetPolycount
            : 100000,
        },
      }));
    } else if (id === 'high') {
      setGenerationSettings(prev => ({
        ...prev,
        autoOptimize: true,
        meshQuality: 'high',
        autoOptimizeSettings: {
          ...prev.autoOptimizeSettings,
          targetPolycount: 60000,
        },
      }));
    } else if (id === 'medium') {
      setGenerationSettings(prev => ({
        ...prev,
        autoOptimize: true,
        meshQuality: 'medium',
        autoOptimizeSettings: {
          ...prev.autoOptimizeSettings,
          targetPolycount: 30000,
        },
      }));
    } else if (id === 'low') {
      setGenerationSettings(prev => ({
        ...prev,
        autoOptimize: true,
        meshQuality: 'low',
        autoOptimizeSettings: {
          ...prev.autoOptimizeSettings,
          targetPolycount: 15000,
        },
      }));
    }
  }, [setGenerationSettings]);

  const [isEnhancing, setIsEnhancing] = useState(false);

  // Manifest-driven: only mesh-capable models with weights + repo present
  // (useManifestModels hook was removed; fallback to empty state)
  const meshCapableModels: any[] = [];
  const optionsLoading = false;
  const gpuAvailable = false;
  const freeVramMb = 0;
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

  const [panelTab, setPanelTab] = useState<'create' | 'mesh' | 'engine' | 'advanced'>('create');
  const [generalSettingsOpen, setGeneralSettingsOpen] = useState(true);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [subAction, setSubAction] = useState<'upload' | 'crop' | 'wand' | 'edit'>('upload');
  const [activeMvSlot, setActiveMvSlot] = useState<'front' | 'back' | 'left' | 'right'>('front');
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  // Sketchpad state
  const sketchCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [sketchTool, setSketchTool] = useState<'brush' | 'eraser'>('brush');
  const [sketchColor, setSketchColor] = useState('#F59E0B');
  const [sketchSize, setSketchSize] = useState<number>(4);

  // Text / Prompt state
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);

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
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
    // ponytail: the current 3DAIGC-API backend does not expose a /api/v1/runtime/prewarm
    // endpoint. Prewarm is a no-op here; the scheduler loads models on demand.
    if (!modelId) return;
  };

  // HD Mesh Quality Enhancement state and handlers
  const isMeshEnhanceEnabled = Boolean(
    generationSettings.detailPass ||
    generationSettings.triposfPass ||
    (generationSettings.meshEnhancementMode && generationSettings.meshEnhancementMode !== 'none')
  );

  const currentEnhanceMode = generationSettings.meshEnhancementMode || (
    generationSettings.detailPass && generationSettings.triposfPass ? 'both' :
    generationSettings.detailPass ? 'detailgen3d' :
    generationSettings.triposfPass ? 'triposf' : 'none'
  );

  const toggleMeshEnhancement = (enabled: boolean) => {
    if (!enabled) {
      setGenerationSettings(prev => ({
        ...prev,
        detailPass: false,
        triposfPass: false,
        meshEnhancementMode: 'none',
      }));
    } else {
      const hasImage = Boolean(generationSettings.image || generationSettings.mode === 'image-to-3d');
      const defaultMode: 'both' | 'triposf' = hasImage ? 'both' : 'triposf';
      setGenerationSettings(prev => ({
        ...prev,
        detailPass: hasImage,
        triposfPass: true,
        meshEnhancementMode: defaultMode,
        detailGuidance: prev.detailGuidance ?? 7.5,
      }));
    }
  };

  const setEnhanceMode = (mode: 'detailgen3d' | 'triposf' | 'both') => {
    setGenerationSettings(prev => ({
      ...prev,
      meshEnhancementMode: mode,
      detailPass: mode === 'both' || mode === 'detailgen3d',
      triposfPass: mode === 'both' || mode === 'triposf',
    }));
  };

  const renderMeshEnhancementCard = () => (
    <div className="rounded-xl border border-white/[0.12] bg-[hsl(var(--surface-0))] p-2.5 space-y-2 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-primary/10 text-primary">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-zinc-100">HD Mesh Quality Enhancement</span>
              {isMeshEnhanceEnabled && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-primary/20 text-primary border border-primary/30">
                  AI ACTIVE
                </span>
              )}
            </div>
            <span className="text-[10px] text-zinc-400 block leading-tight">
              Post-processing AI refinement (DetailGen3D &amp; TripoSF)
            </span>
          </div>
        </div>
        <Switch
          id="btn-toggle-mesh-enhancement"
          checked={isMeshEnhanceEnabled}
          onCheckedChange={toggleMeshEnhancement}
          className="data-[state=checked]:bg-primary"
        />
      </div>

      <AnimatePresence>
        {isMeshEnhanceEnabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-2 pt-1 border-t border-white/[0.06] overflow-hidden"
          >
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
                Refinement Engine
              </span>
              <div className="grid grid-cols-3 gap-1">
                {[
                  {
                    id: 'both',
                    label: 'Dual Refine',
                    desc: 'TripoSF + DetailGen3D',
                    badge: 'Best',
                  },
                  {
                    id: 'detailgen3d',
                    label: 'DetailGen3D',
                    desc: 'Micro-relief &amp; eyes',
                    badge: 'Image AI',
                  },
                  {
                    id: 'triposf',
                    label: 'TripoSF',
                    desc: 'SparseFlex super-res',
                    badge: 'Topology',
                  },
                ].map((engine) => {
                  const isEngineActive = currentEnhanceMode === engine.id;
                  return (
                    <button
                      key={engine.id}
                      type="button"
                      onClick={() => setEnhanceMode(engine.id as any)}
                      className={`p-1.5 rounded-lg text-left transition-all relative cursor-pointer border ${
                        isEngineActive
                          ? 'bg-primary/15 border-primary text-white shadow-sm'
                          : 'bg-[hsl(var(--surface-1))] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-[hsl(var(--surface-2))]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-[11px] font-bold ${isEngineActive ? 'text-primary' : 'text-zinc-200'}`}>
                          {engine.label}
                        </span>
                        <span className={`text-[8px] px-1 py-0.2 rounded font-mono ${
                          isEngineActive ? 'bg-primary text-black font-bold' : 'bg-white/[0.05] text-zinc-500'
                        }`}>
                          {engine.badge}
                        </span>
                      </div>
                      <span className="text-[9px] block leading-tight text-zinc-400">
                        {engine.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {(currentEnhanceMode === 'detailgen3d' || currentEnhanceMode === 'both') && (
              <div className="p-2 rounded-lg bg-[hsl(var(--surface-1))] border border-white/[0.06] space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[10px] text-zinc-300 font-semibold flex items-center gap-1">
                    <span>Detail Guidance Scale</span>
                    <SimpleTooltip label="Controls micro-feature contrast and surface displacement intensity for DetailGen3D (default 7.5).">
                      <Info className="w-3 h-3 text-zinc-500" />
                    </SimpleTooltip>
                  </span>
                  <div className="text-[10px] font-mono font-bold text-primary flex items-center gap-0.5">
                    <span>{(generationSettings.detailGuidance ?? 7.5).toFixed(1)}</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={5.0}
                  max={12.0}
                  step={0.5}
                  value={generationSettings.detailGuidance ?? 7.5}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setGenerationSettings(prev => ({ ...prev, detailGuidance: isNaN(val) ? 7.5 : val }));
                  }}
                  className="w-full h-1 bg-[hsl(var(--surface-2))] rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[9px] text-zinc-400 bg-white/[0.02] p-1.5 rounded-lg border border-white/[0.04]">
              <Info className="w-3 h-3 text-primary flex-shrink-0" />
              <span>Optional &amp; non-destructive: base <code>source.glb</code> and <code>game_ready.glb</code> are always preserved.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

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
      const formData = new FormData();
      formData.append('file', file);
      const res = await getApiClient().post<{ file_id: string; filename?: string }>(
        '/api/v1/file-upload/image',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress: (progressEvent) => updateProgress(Math.round((progressEvent.loaded / (progressEvent.total || 1)) * 100)) }
      );
      finishUpload();
      if (!res.file_id) throw new Error('Backend did not return a file ID for the uploaded image.');
      const previewUrl = URL.createObjectURL(file);
      const cleanPrompt = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setGenerationSettings(prev => ({
        ...prev,
        image: previewUrl,
        imageFileId: res.file_id,
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

  const processImageFileForSlot = async (file: File, slot: 'front' | 'back' | 'left' | 'right') => {
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
      const formData = new FormData();
      formData.append('file', file);
      const res = await getApiClient().post<{ file_id: string }>(
        '/api/v1/file-upload/image',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress: (progressEvent) => updateProgress(Math.round((progressEvent.loaded / (progressEvent.total || 1)) * 100)) }
      );
      finishUpload();
      if (!res.file_id) throw new Error('Backend did not return a file ID for the uploaded image.');
      const previewUrl = URL.createObjectURL(file);
      const cleanPrompt = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setGenerationSettings(prev => ({
        ...prev,
        multiviewImages: {
          ...(prev.multiviewImages || {}),
          [slot]: previewUrl,
        },
        image: slot === 'front' || !prev.image ? previewUrl : prev.image,
        imageFileId: slot === 'front' || !prev.imageFileId ? res.file_id : prev.imageFileId,
        imageName: slot === 'front' || !prev.imageName ? cleanPrompt : prev.imageName,
        mode: 'image-to-3d',
      }));
    } catch (err) {
      failUpload();
      setUploadError('Failed to upload multiview image.');
    }
  };

  const handleMultiFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFileForSlot(file, activeMvSlot);
    if (multiFileInputRef.current) multiFileInputRef.current.value = '';
  };

  // Sketchpad Canvas Initialization and Pointer Handlers
  const initSketchCanvas = useCallback(() => {
    const canvas = sketchCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#14151a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Draw subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    if (subAction === 'edit') {
      const timer = setTimeout(initSketchCanvas, 40);
      return () => clearTimeout(timer);
    }
  }, [subAction, initSketchCanvas]);

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sketchCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handleSketchPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const canvas = sketchCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = sketchTool === 'eraser' ? '#14151a' : sketchColor;
    ctx.lineWidth = sketchTool === 'eraser' ? sketchSize * 3 : sketchSize;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleSketchPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = sketchCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.strokeStyle = sketchTool === 'eraser' ? '#14151a' : sketchColor;
    ctx.lineWidth = sketchTool === 'eraser' ? sketchSize * 3 : sketchSize;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleSketchPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const clearSketchCanvas = () => {
    initSketchCanvas();
  };

  const handleApplySketchTo3D = () => {
    const canvas = sketchCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setGenerationSettings(prev => ({
      ...prev,
      image: dataUrl,
      imageName: 'sketch-reference.png',
      mode: 'image-to-3d',
    }));
    setNoticeMessage('Sketch applied as 3D reference!');
    setTimeout(() => setNoticeMessage(null), 3500);
  };

  const RANDOM_PROMPTS = [
    'Cyberpunk combat drone with matte carbon plating, glowing cyan thrusters, and twin antenna sensors',
    'Ancient runic battle axe with glowing sapphire veins and weathered obsidian handle',
    'Futuristic mech pilot helmet with holographic HUD visor and titanium ventilation grilles',
    'Stylized enchanted potion bottle with swirling glowing purple liquid and star particles',
    'Steampunk robotic owl with polished brass gears, copper wings, and warm amber ocular lenses',
    'Weathered stone gargoyle statue perched on Gothic cathedral pedestal with moss detailing',
    'Low-poly Japanese bonsai tree in a ceramic pot with pink cherry blossom foliage',
    'Sci-Fi plasma blaster rifle with heat sinks, orange energy coils, and ergonomic matte grip',
    'Ornate golden treasure chest with ruby inlays and intricate filigree relief carvings',
    'Hard-surface industrial sci-fi crate with hazard warning stripes and hydraulic latch mechanisms',
  ];

  const SAMPLE_MULTIVIEW = {
    front: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%2318191D"/><polygon points="100,30 150,70 140,160 60,160 50,70" fill="%232e3440" stroke="%23F9CF00" stroke-width="3"/><circle cx="100" cy="85" r="22" fill="%23F9CF00"/><circle cx="100" cy="85" r="10" fill="%23111"/><text x="100" y="185" text-anchor="middle" fill="%23eceff4" font-family="sans-serif" font-size="10" font-weight="bold">FRONT VIEW</text></svg>',
    back: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%2318191D"/><polygon points="100,30 150,70 140,160 60,160 50,70" fill="%23232731" stroke="%2364748b" stroke-width="3"/><rect x="80" y="70" width="40" height="40" rx="4" fill="%23334155"/><text x="100" y="185" text-anchor="middle" fill="%23eceff4" font-family="sans-serif" font-size="10" font-weight="bold">BACK VIEW</text></svg>',
    left: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%2318191D"/><polygon points="80,30 130,50 120,160 70,160" fill="%232a303c" stroke="%2338bdf8" stroke-width="3"/><circle cx="115" cy="85" r="8" fill="%23F9CF00"/><text x="100" y="185" text-anchor="middle" fill="%23eceff4" font-family="sans-serif" font-size="10" font-weight="bold">LEFT PROFILE</text></svg>',
    right: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%2318191D"/><polygon points="120,30 70,50 80,160 130,160" fill="%232a303c" stroke="%2338bdf8" stroke-width="3"/><circle cx="85" cy="85" r="8" fill="%23F9CF00"/><text x="100" y="185" text-anchor="middle" fill="%23eceff4" font-family="sans-serif" font-size="10" font-weight="bold">RIGHT PROFILE</text></svg>',
  };

  const handleRollRandomPrompt = () => {
    const random = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
    setGenerationSettings(prev => ({
      ...prev,
      prompt: random,
      imageName: random,
      mode: 'text-to-3d',
    }));
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

  const handleModelSelect = (model: any) => {
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
      // ponytail: the current 3DAIGC-API backend does not expose a prompt
      // enhancement endpoint. Surface the limitation honestly instead of
      // silently falling back to the obsolete /api/v1/generation route.
      setNoticeMessage('Prompt enhancement is not available on the current backend.');
      setTimeout(() => setNoticeMessage(null), 3500);
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
    <div id="panel-generate-model" className="flex flex-col h-full bg-[hsl(var(--surface-1))] text-xs select-none">
      {/* Panel Header */}
      <div className="px-3 py-2 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0">
        <span className="font-bold text-[11px] text-white flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Generate Model</span>
        </span>
        {statusInfo && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-bold">
            <AlertTriangle className="w-2.5 h-2.5" />
            {statusInfo.label}
          </span>
        )}
      </div>

      {/* Segmented Mode Navigation Tabs: Create | Mesh | Engine | Advanced */}
      <div className="px-2 pt-1.5 pb-1 border-b border-white/[0.06] bg-[hsl(var(--surface-0))]/60 flex-shrink-0">
        <div className="w-full grid grid-cols-4 p-0.5 bg-[hsl(var(--surface-1))] border border-white/[0.08] rounded-lg">
            {([
              { id: 'create', label: 'Create', icon: Sparkles },
              { id: 'mesh', label: 'Mesh', icon: Box },
              { id: 'engine', label: 'Engine', icon: Gauge },
              { id: 'advanced', label: 'Settings', icon: Sliders },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              const isActive = panelTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPanelTab(tab.id)}
                  className={`relative py-1.5 px-1 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                    isActive ? 'text-black font-black bg-primary' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
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
              className="p-2 rounded-xl bg-primary/15 border border-primary/40 text-primary text-[10px] flex items-center justify-between gap-2 overflow-hidden"
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
            <div className="rounded-xl border border-white/[0.12] bg-[hsl(var(--surface-0))] p-2 space-y-2">
              <div className="relative grid grid-cols-4 gap-1 p-1 rounded-lg bg-[hsl(var(--surface-1))] border border-white/[0.06]">
                {[
                  {
                    id: 'upload',
                    domId: 'subaction-btn-upload',
                    label: 'Image',
                    tooltip: 'Single Image to 3D',
                    icon: ImageIcon,
                    onClick: () => {
                      setSubAction('upload');
                      setGenerationSettings(prev => ({ ...prev, mode: 'image-to-3d' }));
                      fileInputRef.current?.click();
                    },
                  },
                  {
                    id: 'crop',
                    domId: 'subaction-btn-crop',
                    label: 'Multi',
                    tooltip: 'Multiview Images / Mesh',
                    icon: Box,
                    onClick: () => setSubAction('crop'),
                  },
                  {
                    id: 'wand',
                    domId: 'subaction-btn-wand',
                    label: 'Text',
                    tooltip: 'Text Prompt to 3D',
                    icon: Wand2,
                    onClick: () => {
                      setSubAction('wand');
                      setGenerationSettings(prev => ({ ...prev, mode: 'text-to-3d' }));
                    },
                  },
                  {
                    id: 'edit',
                    domId: 'subaction-btn-edit',
                    label: 'Sketch',
                    tooltip: 'Draw / Sketch to 3D',
                    icon: Pencil,
                    onClick: () => setSubAction('edit'),
                  },
                ].map((tab) => {
                  const active = subAction === tab.id;
                  const Icon = tab.icon;
                  return (
                    <SimpleTooltip key={tab.id} label={tab.tooltip}>
                      <button
                        id={tab.domId}
                        type="button"
                        onClick={tab.onClick}
                        className={`relative w-full py-1.5 px-1 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer active:scale-95 z-10 ${
                          active ? 'text-primary font-bold' : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {active && (
                          <motion.div
                            layoutId="subActionActiveTab"
                            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                            className="absolute inset-0 rounded-md bg-[hsl(var(--surface-2))] border border-primary/35 shadow-sm -z-10"
                          />
                        )}
                        <Icon className="w-3.5 h-3.5" />
                        <span className="truncate">{tab.label}</span>
                      </button>
                    </SimpleTooltip>
                  );
                })}
              </div>

              {/* Mode 1: Single Image Upload */}
              {subAction === 'upload' && (
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
                      borderColor: isDragOver ? 'hsl(var(--primary))' : uploadError ? '#ef4444' : 'rgba(255,255,255,0.08)',
                    }}
                    transition={springTransition}
                    className="relative w-full h-28 rounded-lg border border-dashed border-white/[0.1] cursor-pointer overflow-hidden flex flex-col items-center justify-center p-2 group/dropzone bg-[hsl(var(--surface-1))]/50 hover:bg-[hsl(var(--surface-1))]"
                  >
                    {uploadProgress.active ? (
                      <div className="text-center space-y-2 w-full px-2 z-10">
                        <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" />
                        <div className="font-bold text-[10px] text-white">Uploading...</div>
                        <div className="w-full bg-[hsl(var(--surface-2))] rounded-full h-1 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${uploadProgress.percent}%` }}
                            className="bg-primary h-full rounded-full"
                          />
                        </div>
                      </div>
                    ) : generationSettings.image ? (
                      <div className="relative w-full h-full group z-10">
                        <img
                          src={generationSettings.image}
                          alt="Source reference"
                          className="w-full h-full object-contain border-0 bg-transparent rounded-none"
                        />
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          className="absolute bottom-1.5 right-1.5 bg-black/80 hover:bg-black border border-white/20 text-primary px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer z-20 transition-all opacity-0 group-hover:opacity-100 shadow-md"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Replace</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-1.5 z-10">
                        <div className={`w-8 h-8 mx-auto rounded-full bg-[hsl(var(--surface-2))] border border-white/[0.08] flex items-center justify-center transition-all ${
                          isDragOver ? 'text-primary border-primary' : 'text-zinc-400 group-hover/dropzone:text-primary'
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
                        className="text-primary hover:underline cursor-pointer"
                      >
                        Load Sample &gt;
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Mode 2: Multi-View Grid */}
              {subAction === 'crop' && (
                <>
                  <input
                    ref={multiFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleMultiFileUpload}
                  />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5 text-primary" />
                        <span>Multiview Perspective Angles</span>
                      </span>
                      <span className="text-[9px] text-zinc-400">
                        {Object.values(generationSettings.multiviewImages || {}).filter(Boolean).length}/4 angles loaded
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      {([
                        { key: 'front', label: 'Front', req: true },
                        { key: 'right', label: 'Right', req: false },
                        { key: 'back', label: 'Back', req: false },
                        { key: 'left', label: 'Left', req: false },
                      ] as const).map(({ key, label, req }) => {
                        const imgUrl = generationSettings.multiviewImages?.[key];
                        return (
                          <div
                            key={key}
                            onClick={() => {
                              setActiveMvSlot(key);
                              multiFileInputRef.current?.click();
                            }}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const f = e.dataTransfer.files?.[0];
                              if (f) processImageFileForSlot(f, key);
                            }}
                            className={`relative h-24 rounded-lg border flex flex-col items-center justify-center p-1 cursor-pointer transition-all overflow-hidden group ${
                              imgUrl
                                ? 'border-primary/40 bg-[hsl(var(--surface-2))] shadow-sm'
                                : 'border-dashed border-white/[0.12] bg-[hsl(var(--surface-1))]/60 hover:bg-[hsl(var(--surface-1))] hover:border-primary/40'
                            }`}
                          >
                            {imgUrl ? (
                              <>
                                <img src={imgUrl} alt={`${label} view`} className="w-full h-full object-contain" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <span className="text-[8px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded">Change</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setGenerationSettings(prev => {
                                      const nextMv = { ...(prev.multiviewImages || {}) };
                                      delete nextMv[key];
                                      return {
                                        ...prev,
                                        multiviewImages: nextMv,
                                        image: key === 'front' ? (nextMv.right || nextMv.back || nextMv.left || null) : prev.image,
                                      };
                                    });
                                  }}
                                  className="absolute top-1 right-1 p-0.5 rounded bg-black/70 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                                  title={`Remove ${label} view`}
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </>
                            ) : (
                              <div className="text-center space-y-1">
                                <Plus className="w-4 h-4 mx-auto text-zinc-500 group-hover:text-primary transition-colors" />
                                <span className="text-[8px] text-zinc-400 font-medium block">{label}</span>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 px-1 py-0.2 rounded text-[7px] font-bold bg-black/70 text-zinc-300">
                              {label}{req ? ' *' : ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between text-[9px] pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setGenerationSettings(prev => ({
                            ...prev,
                            multiviewImages: SAMPLE_MULTIVIEW,
                            image: SAMPLE_MULTIVIEW.front,
                            imageName: 'Sample Multiview Set',
                            mode: 'image-to-3d',
                          }));
                        }}
                        className="text-primary hover:underline font-medium cursor-pointer"
                      >
                        Load 4-View Sample &gt;
                      </button>
                      {Boolean(generationSettings.multiviewImages && Object.values(generationSettings.multiviewImages).some(Boolean)) && (
                        <button
                          type="button"
                          onClick={() => {
                            setGenerationSettings(prev => ({
                              ...prev,
                              multiviewImages: undefined,
                              image: null,
                              imageName: undefined,
                            }));
                          }}
                          className="text-rose-400 hover:underline cursor-pointer"
                        >
                          Clear All Views
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Mode 3: Text to 3D Banner */}
              {subAction === 'wand' && (
                <div className="rounded-lg bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-white flex items-center gap-1.5">
                      <Wand2 className="w-3.5 h-3.5 text-primary" />
                      <span>Text-to-3D Neural Mode</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleRollRandomPrompt}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-white/[0.06] hover:bg-white/[0.12] text-primary border border-primary/30 transition-all cursor-pointer active:scale-95"
                      title="Roll random prompt idea"
                    >
                      <Dices className="w-3 h-3" />
                      <span>Inspire Me</span>
                    </button>
                  </div>
                  <p className="text-[9px] text-zinc-400 leading-relaxed">
                    Direct neural shape & texture synthesis from descriptive prompt. No reference image required.
                  </p>
                </div>
              )}

              {/* Mode 4: 2D Concept Sketchpad */}
              {subAction === 'edit' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Pencil className="w-3.5 h-3.5 text-primary" />
                      <span>2D Concept Sketchpad</span>
                    </span>
                    <span className="text-[9px] text-zinc-400">Sketch &gt; Use as Reference</span>
                  </div>

                  <div className="relative rounded-lg overflow-hidden border border-white/[0.12] bg-[#14151a]">
                    <canvas
                      ref={sketchCanvasRef}
                      width={320}
                      height={160}
                      onPointerDown={handleSketchPointerDown}
                      onPointerMove={handleSketchPointerMove}
                      onPointerUp={handleSketchPointerUp}
                      onPointerLeave={handleSketchPointerUp}
                      className="w-full h-36 cursor-crosshair touch-none block"
                    />

                    {/* Floating Controls Overlay */}
                    <div className="absolute top-1.5 right-1.5 flex items-center gap-1 bg-black/80 backdrop-blur-sm px-1.5 py-1 rounded-md border border-white/10 shadow-lg">
                      <button
                        type="button"
                        onClick={() => setSketchTool('brush')}
                        className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                          sketchTool === 'brush' ? 'bg-primary text-black font-bold' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Brush Tool"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSketchTool('eraser')}
                        className={`p-1 rounded text-xs transition-colors cursor-pointer ${
                          sketchTool === 'eraser' ? 'bg-primary text-black font-bold' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Eraser Tool"
                      >
                        <Eraser className="w-3 h-3" />
                      </button>
                      <div className="w-px h-3.5 bg-white/20 mx-0.5" />
                      {['#FFFFFF', '#F59E0B', '#06B6D4', '#10B981'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => { setSketchColor(c); setSketchTool('brush'); }}
                          className={`w-3 h-3 rounded-full border transition-transform cursor-pointer ${
                            sketchColor === c && sketchTool === 'brush' ? 'scale-125 border-white' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                      <div className="w-px h-3.5 bg-white/20 mx-0.5" />
                      <button
                        type="button"
                        onClick={clearSketchCanvas}
                        className="p-1 rounded text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Clear Canvas"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <span className="text-zinc-400">Size:</span>
                      {[2, 5, 10].map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setSketchSize(sz)}
                          className={`px-1.5 py-0.2 rounded text-[8px] font-bold border transition-colors cursor-pointer ${
                            sketchSize === sz
                              ? 'bg-primary/20 text-primary border-primary/40'
                              : 'bg-white/[0.04] text-zinc-400 border-white/[0.06]'
                          }`}
                        >
                          {sz === 2 ? 'Fine' : sz === 5 ? 'Med' : 'Bold'}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleApplySketchTo3D}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary hover:bg-primary/90 text-black font-bold text-[10px] shadow-sm transition-all active:scale-95 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Use as 3D Reference</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Text Prompt & AI Enhance Card */}
            <div className="rounded-xl border border-white/[0.08] bg-[hsl(var(--surface-0))] p-2.5 space-y-2.5">
              <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-primary" />
                  <span>Prompt / 3D Concept</span>
                </span>
                {/* Smart Action Button Group */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleRollRandomPrompt}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/[0.08] transition-all font-semibold text-[9px] cursor-pointer active:scale-95"
                    title="Roll random 3D prompt inspiration"
                  >
                    <Dices className="w-3 h-3 text-primary" />
                    <span>Inspire</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleEnhancePrompt}
                    disabled={isEnhancing || !(generationSettings.prompt || generationSettings.imageName)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 transition-all font-bold text-[9px] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95"
                    title="Enhance prompt with 3D quality descriptors (PBR, topology, lighting)"
                  >
                    {isEnhancing ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-2.5 h-2.5" />
                    )}
                    <span>{isEnhancing ? 'Enhancing...' : 'AI Enhance'}</span>
                  </button>

                  {Boolean(generationSettings.prompt?.trim()) && (
                    <button
                      type="button"
                      onClick={() => setGenerationSettings(prev => ({ ...prev, prompt: '', imageName: undefined }))}
                      className="p-1 rounded-md bg-white/[0.04] hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-white/[0.08] hover:border-rose-500/30 transition-all text-[9px] cursor-pointer"
                      title="Clear prompt"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="relative">
                <textarea
                  value={generationSettings.prompt || ''}
                  onChange={(e) => setGenerationSettings(prev => ({ ...prev, prompt: e.target.value }))}
                  placeholder={
                    subAction === 'wand'
                      ? "Describe your 3D model (e.g. Cyberpunk samurai helmet with gold accents, glowing visor)..."
                      : "Describe or refine model concept (optional for image-to-3d)..."
                  }
                  rows={2}
                  className="w-full bg-[hsl(var(--surface-1))] border border-white/[0.08] focus:border-primary/50 rounded-lg p-2 text-xs text-white placeholder-zinc-500 focus:outline-none resize-none font-sans transition-colors"
                />
              </div>

              {/* Quick Style Chips */}
              <div className="space-y-1">
                <div className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">
                  Quick Style Descriptors
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['PBR Game Asset', 'Clean Quad Topology', 'Stylized 3D', 'Photorealistic', 'Cyberpunk', 'Hard Surface'].map((style) => {
                    const isApplied = (generationSettings.prompt || '').toLowerCase().includes(style.toLowerCase());
                    return (
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
                        className={`px-2 py-0.5 rounded-md border text-[9px] font-medium transition-all active:scale-95 cursor-pointer ${
                          isApplied
                            ? 'bg-primary/20 border-primary/40 text-primary font-bold shadow-xs'
                            : 'bg-[hsl(var(--surface-2))] hover:bg-white/[0.08] text-zinc-300 hover:text-white border-white/[0.08]'
                        }`}
                      >
                        {isApplied ? `✓ ${style}` : `+ ${style}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Collapsible Negative Prompt */}
              <div className="pt-1 border-t border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowNegativePrompt(!showNegativePrompt)}
                    className="flex items-center gap-1.5 text-[9px] font-semibold text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    {showNegativePrompt ? <ChevronDown className="w-3 h-3 text-primary" /> : <ChevronRight className="w-3 h-3" />}
                    <span>Negative Prompt (Exclude artifacts)</span>
                  </button>
                  {Boolean(generationSettings.negativePrompt?.trim()) && (
                    <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Active
                    </span>
                  )}
                </div>
                {showNegativePrompt && (
                  <input
                    type="text"
                    value={generationSettings.negativePrompt || ''}
                    onChange={(e) => setGenerationSettings(prev => ({ ...prev, negativePrompt: e.target.value }))}
                    placeholder="e.g. blurry, low poly, distorted, holes, non-manifold, floating geometry..."
                    className="mt-1.5 w-full bg-[hsl(var(--surface-1))] border border-white/[0.08] rounded-md px-2 py-1 text-[10px] text-white placeholder-zinc-500 focus:outline-none focus:border-primary/50"
                  />
                )}
              </div>
            </div>

            {/* AI Model Generator Choice */}
            <div className="rounded-xl border border-white/[0.08] bg-[hsl(var(--surface-0))] p-2 space-y-1 relative">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">AI 3D Model Engine</span>
                <button
                  onClick={() => router.push('/admin?tab=models')}
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
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
                className="w-full flex items-center justify-between p-2 rounded-lg bg-[hsl(var(--surface-1))] border border-white/[0.08] hover:border-white/[0.16] hover:bg-[hsl(var(--surface-2))] transition-all text-left cursor-pointer"
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
                <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${modelDropdownOpen ? 'rotate-180 text-primary' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {modelDropdownOpen && (
                <div 
                  ref={modelDropdownRef}
                  className="absolute left-0 right-0 top-full mt-1 bg-[hsl(var(--surface-1))] border border-white/[0.12] rounded-xl p-1.5 shadow-2xl z-50 space-y-1 max-h-56 overflow-y-auto"
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
                        ? 'bg-primary text-black shadow-sm font-bold'
                        : isReady
                          ? 'text-white hover:bg-[hsl(var(--surface-2))]'
                          : isInstalled
                            ? 'text-amber-300/90 hover:bg-[hsl(var(--surface-2))]'
                            : 'text-zinc-500 opacity-70 hover:bg-[hsl(var(--surface-2))] hover:opacity-100';
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
                              ? 'bg-primary text-black shadow-sm font-bold'
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
                        router.push('/admin?tab=models');
                      }}
                      className="w-full py-2 px-2.5 rounded-lg bg-[hsl(var(--surface-0))] hover:bg-[hsl(var(--surface-2))] text-zinc-300 hover:text-primary text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>Download / Manage Model Weights</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Texture Synthesis Card */}
            <div className="rounded-xl border border-white/[0.08] bg-[hsl(var(--surface-0))] p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-300">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-primary" />
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
                        generationSettings.generateTexture !== false ? 'bg-emerald-500' : 'bg-[hsl(var(--surface-2))]'
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
                      <Gauge className="w-3 h-3 text-primary" />
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
                        generationSettings.lowVram ? 'bg-primary' : 'bg-[hsl(var(--surface-2))]'
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
                      <span className="text-primary">Sequential offload active (&lt;8GB GPU mode)</span>
                    ) : (
                      <span>Full VRAM mode (~{Math.round((activeVramMb || 0) / 1024)} GB required)</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* HD Mesh Quality & Detail Enhancement Toggle Card */}
            {renderMeshEnhancementCard()}

            {/* Quick Summary Pill Strip (Jump to Mesh / Engine / Settings) */}
            <div className="p-2 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between text-[10px]">
              <button
                type="button"
                onClick={() => setPanelTab('mesh')}
                className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Click to configure polygon budget & topology"
              >
                <Box className="w-3 h-3 text-primary" />
                <span>
                  Mesh:{' '}
                  <strong className="text-zinc-200">
                    {activeQualityConfig.label} ({generationSettings.autoOptimize
                      ? `${Math.round((generationSettings.autoOptimizeSettings?.targetPolycount || 60000) / 1000)}k`
                      : 'Raw Master'})
                    {isMeshEnhanceEnabled ? ' + HD' : ''}
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
            {/* Mesh Quality & Resolution (Low, Medium, High, Ultra, Master) */}
            <div id="mesh-quality-section" className="rounded-xl border border-white/[0.08] bg-[hsl(var(--surface-0))] p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Mesh Quality & Resolution</span>
                </div>
                <div className="flex items-center gap-1">
                  {currentQualityKey === 'raw' ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[9px] font-bold shadow-[0_0_8px_rgba(251,191,36,0.2)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Unoptimized Master • Full Poly
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-zinc-300 font-mono text-[9px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <strong className="text-primary font-bold">{activeQualityConfig.grid}³</strong> grid • <strong className="text-zinc-200 font-bold">{activeQualityConfig.steps}</strong> steps
                    </span>
                  )}
                </div>
              </div>

              {/* 5-Button Quality Grid */}
              <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[hsl(var(--surface-1))] border border-white/[0.06] shadow-inner">
                {MESH_QUALITY_OPTIONS.map((opt) => {
                  const isActive = currentQualityKey === opt.id;
                  return (
                    <SimpleTooltip
                      key={opt.id}
                      side="top"
                      className="w-full flex-1"
                      label={opt.tooltip}
                    >
                      <button
                        type="button"
                        id={`btn-mesh-quality-${opt.id}`}
                        onClick={() => handleSelectQuality(opt.id)}
                        className={`relative w-full py-2 px-1 rounded-lg text-center transition-all duration-150 cursor-pointer flex flex-col items-center justify-center select-none ${
                          isActive
                            ? opt.id === 'raw'
                              ? 'bg-amber-400 text-black font-black shadow-[0_0_14px_rgba(251,191,36,0.45)] border border-amber-300 ring-1 ring-amber-400/50'
                              : 'bg-primary text-black font-black shadow-[0_0_14px_rgba(249,207,0,0.4)] border border-primary ring-1 ring-primary/50'
                            : 'text-zinc-400 hover:text-white hover:bg-white/[0.05] border border-transparent'
                        }`}
                      >
                        <span className="text-[11px] font-black leading-tight tracking-tight">
                          {opt.label}
                        </span>
                        <span className={`text-[8.5px] leading-none font-mono mt-0.5 ${
                          isActive ? 'text-black/80 font-bold' : 'text-zinc-500'
                        }`}>
                          {opt.id === 'raw' ? 'Master' : `${opt.grid}³`}
                        </span>
                        {isActive && (
                          <span className={`absolute -bottom-0.5 w-2 h-0.5 rounded-full ${
                            opt.id === 'raw' ? 'bg-amber-950' : 'bg-black'
                          }`} />
                        )}
                      </button>
                    </SimpleTooltip>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[hsl(var(--surface-0))] p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                  <Box className="w-3.5 h-3.5 text-primary" />
                  <span>Mesh Budget & Topology</span>
                  <SimpleTooltip label="Configures target polygon count, UV unwrapping, and topology decimation for all 3D models.">
                    <Info className="w-3.5 h-3.5 text-zinc-500" />
                  </SimpleTooltip>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  generationSettings.autoOptimize
                    ? 'bg-primary/15 text-primary border border-primary/30 font-bold'
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
                        <Layers className="w-3.5 h-3.5 text-primary" />
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
                        className="text-[10px] px-2 py-0.5 rounded-md bg-primary/15 hover:bg-primary/25 text-primary font-bold transition-colors cursor-pointer"
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
                            ? 'bg-primary text-black shadow-sm'
                            : 'bg-[hsl(var(--surface-1))] text-zinc-300 hover:text-white hover:bg-[hsl(var(--surface-2))] border border-white/[0.08]'
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

              {/* HD Mesh Quality & Detail Enhancement Toggle Card */}
              {renderMeshEnhancementCard()}

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
                    generationSettings.autoOptimize ? 'bg-primary' : 'bg-[hsl(var(--surface-2))]'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-black transition-transform ${
                    generationSettings.autoOptimize ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {generationSettings.autoOptimize ? (
                <div className="space-y-2.5 pt-1">
                  {/* Target Polycount Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-medium">Target Polycount</span>
                      <span className="font-mono text-primary font-bold">
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
                      className="w-full h-1.5 rounded-full appearance-none bg-[hsl(var(--surface-2))] accent-primary cursor-pointer"
                    />
                  </div>

                  {/* Detail Preservation Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300 font-medium">Preserve Details</span>
                      <span className="font-mono text-primary font-bold">
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
                      className="w-full h-1.5 rounded-full appearance-none bg-[hsl(var(--surface-2))] accent-primary cursor-pointer"
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
                        (generationSettings.autoOptimizeSettings?.fixUVs ?? true) ? 'bg-emerald-500' : 'bg-[hsl(var(--surface-2))]'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                        (generationSettings.autoOptimizeSettings?.fixUVs ?? true) ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Raw Density Master Mode</span>
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 font-bold">
                      640³ • Full Poly
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-300 leading-tight">
                    Mesh decimation is bypassed. Reconstructing at native 640³ voxel resolution with 75 diffusion steps and maximum polycount.
                  </p>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectQuality('high')}
                      className="text-[10px] px-2 py-1 rounded bg-white/[0.08] hover:bg-white/[0.15] text-zinc-200 font-bold transition-colors cursor-pointer"
                    >
                      Switch to High (60k)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectQuality('medium')}
                      className="text-[10px] px-2 py-1 rounded bg-white/[0.08] hover:bg-white/[0.15] text-zinc-200 font-bold transition-colors cursor-pointer"
                    >
                      Switch to Medium (30k)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ENGINE (Game-Ready Platforms, LODs, Collisions, Pipeline Summary) */}
        {panelTab === 'engine' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[0.08] bg-[hsl(var(--surface-0))] p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                  <Gauge className="w-3.5 h-3.5 text-[hsl(var(--neon-green))]" />
                  <span>Game Engine & LOD Pipeline</span>
                  <SimpleTooltip label="Configures target platform budgets, multi-tier LODs (LOD0–LOD3), physics collision hulls, and game engine asset compliance.">
                    <Info className="w-3.5 h-3.5 text-zinc-500" />
                  </SimpleTooltip>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  generationSettings.gameReady
                    ? 'bg-emerald-500/15 text-[hsl(var(--neon-green))] border border-emerald-500/30 font-bold'
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
                    generationSettings.gameReady ? 'bg-emerald-500' : 'bg-[hsl(var(--surface-2))]'
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
                            : 'bg-[hsl(var(--surface-1))] text-zinc-300 hover:text-white hover:bg-[hsl(var(--surface-2))] border border-white/[0.08]'
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
                    generationSettings.generateLOD ? 'bg-emerald-500' : 'bg-[hsl(var(--surface-2))]'
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
                            ? 'bg-[hsl(var(--neon-green))] text-black'
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
                    generationSettings.generateCollision ? 'bg-emerald-500' : 'bg-[hsl(var(--surface-2))]'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-black transition-transform ${
                    generationSettings.generateCollision ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>

            {/* Real-time Pipeline Execution Summary */}
            <div className="rounded-xl border border-white/[0.08] bg-[hsl(var(--surface-0))] p-2.5 space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between font-bold text-zinc-300">
                <span className="flex items-center gap-1 text-primary">
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
                  <span className={generationSettings.generateTexture !== false ? 'text-[hsl(var(--neon-green))]' : 'text-zinc-400'}>
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
                    <span className="text-primary">
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

        {/* TAB 4: ADVANCED SETTINGS (Seed, CFG, Background, Multi-part, Visibility) */}
        {panelTab === 'advanced' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[0.08] bg-[hsl(var(--surface-0))] p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                  <Sliders className="w-3.5 h-3.5 text-primary" />
                  <span>Advanced Parameters</span>
                  <SimpleTooltip label="Configure generation seed, guidance scale, foreground extraction, and multi-part hierarchy.">
                    <Info className="w-3.5 h-3.5 text-zinc-500" />
                  </SimpleTooltip>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-zinc-400">
                  {generationSettings.seed > 0 ? `Seed ${generationSettings.seed}` : 'Random Seed'}
                </span>
              </div>

              {/* Seed Input & Randomize */}
              <div className="space-y-1 pt-1 border-t border-white/[0.04]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium">Generation Seed</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newSeed = Math.floor(Math.random() * 2147483647);
                      setGenerationSettings(prev => ({ ...prev, seed: newSeed }));
                    }}
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline cursor-pointer font-semibold"
                  >
                    <Dices className="w-3 h-3" />
                    <span>Randomize</span>
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    placeholder="Random (-1 or empty)"
                    value={generationSettings.seed > 0 ? generationSettings.seed : ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setGenerationSettings(prev => ({ ...prev, seed: isNaN(val) ? -1 : val }));
                    }}
                    className="flex-1 bg-[hsl(var(--surface-1))] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-primary/50"
                  />
                  {generationSettings.seed > 0 && (
                    <button
                      type="button"
                      onClick={() => setGenerationSettings(prev => ({ ...prev, seed: -1 }))}
                      className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400 text-xs cursor-pointer"
                      title="Reset to Random"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Guidance Scale Slider */}
              <div className="space-y-1 pt-1 border-t border-white/[0.04]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium">Guidance Scale (CFG)</span>
                  <span className="font-mono text-primary font-bold">{(generationSettings.guidanceScale || 7.5).toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={1.0}
                  max={15.0}
                  step={0.5}
                  value={generationSettings.guidanceScale || 7.5}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setGenerationSettings(prev => ({ ...prev, guidanceScale: val }));
                  }}
                  className="w-full h-1.5 rounded-full appearance-none bg-[hsl(var(--surface-2))] accent-primary cursor-pointer"
                />
              </div>

              {/* Background Removal Switch */}
              <div className="pt-1.5 border-t border-white/[0.04]">
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-white/[0.04]">
                  <div>
                    <span className="text-zinc-200 font-medium block">Remove Image Background</span>
                    <span className="text-[10px] text-zinc-400">Isolates foreground subject before 3D reconstruction</span>
                  </div>
                  <Switch
                    checked={Boolean(generationSettings.removeBackground ?? true)}
                    onCheckedChange={(val) => setGenerationSettings(prev => ({ ...prev, removeBackground: val }))}
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </div>
              </div>

              {/* Generate In Parts Switch */}
              <div className="pt-1.5 border-t border-white/[0.04]">
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-white/[0.04]">
                  <div>
                    <span className="text-zinc-200 font-medium block flex items-center gap-1">
                      <span>Multi-Part Generation</span>
                      <span className="text-[8px] px-1 py-0.2 rounded bg-primary/20 text-primary font-bold">Pro</span>
                    </span>
                    <span className="text-[10px] text-zinc-400">Deconstructs complex objects into articulated sub-assemblies</span>
                  </div>
                  <Switch
                    checked={generateInParts}
                    onCheckedChange={(val) => setGenerateInParts(val)}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>
              </div>

              {/* Asset Visibility / Privacy */}
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-white/[0.04]">
                <span className="text-zinc-300 font-medium">Asset Visibility</span>
                <div className="flex items-center gap-1 bg-[hsl(var(--surface-1))] p-0.5 rounded-lg border border-white/[0.06]">
                  {(['public', 'private'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPrivacy(mode)}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold capitalize transition-colors cursor-pointer ${
                        privacy === mode
                          ? 'bg-[#25272D] text-primary shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sticky Action Footer */}
      <div className="p-2.5 sm:p-3 border-t border-white/[0.1] bg-[hsl(var(--surface-1))]/95 backdrop-blur-md relative z-20 flex-shrink-0 space-y-2">
        {/* Smart Pre-flight Configuration Summary Bar */}
        <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400 px-0.5 pb-0.5">
          <div className="flex items-center gap-1.5 truncate">
            <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300 font-semibold truncate max-w-[120px]">
              {activeModelObj?.label || activeModelObj?.id || 'Trellis'}
            </span>
            <span>•</span>
            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase">
              {generationSettings.meshQuality || 'high'}
            </span>
          </div>
          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${generationSettings.generateTexture !== false ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' : 'bg-zinc-800 text-zinc-400'}`}>
            {generationSettings.generateTexture !== false ? 'PBR TEXTURED' : 'GEOMETRY ONLY'}
          </span>
        </div>

        {/* Bottom Sticky Action Button */}
        <ShimmerButton
          id="btn-generate-model-action"
          onClick={handleGenerate}
          disabled={isExecuting}
          shimmerColor="hsl(var(--neon-amber))"
          shimmerSize="0.1em"
          shimmerDuration="2.5s"
          borderRadius="12px"
          background={
            isExecuting
              ? "hsl(var(--surface-2))"
              : "linear-gradient(to bottom, hsl(var(--neon-amber)), hsl(var(--primary)))"
          }
          className={`w-full h-10 font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            isExecuting 
              ? 'text-primary border border-primary/20' 
              : 'text-black shadow-[0_4px_16px_rgba(249,207,0,0.25)] hover:shadow-[0_6px_20px_rgba(249,207,0,0.35)]'
          }`}
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="tracking-wide">{executionStep || 'Generating 3D Model...'}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 stroke-[2.5]" />
              <span className="tracking-wider">GENERATE 3D MODEL</span>
            </>
          )}
        </ShimmerButton>
        {isExecuting && (
          <div className="relative mt-2 p-2 rounded-xl bg-[hsl(var(--surface-2))] border border-white/[0.08] overflow-hidden space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 px-0.5">
              <span>{executionStep || 'Processing'}</span>
              <span className="text-primary font-bold">{Math.round(executionProgress || 0)}%</span>
            </div>
            <div className="w-full bg-[hsl(var(--surface-2))] h-1.5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${executionProgress || 0}%` }}
                className="bg-primary h-full rounded-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
