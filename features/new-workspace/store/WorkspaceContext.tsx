import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ToolType,
  MainNavRoute,
  ShadingMode,
  ModelAsset,
  MaterialConfig,
  BoneNode,
  AnimationTrack,
  SystemStats,
  GenerationSettings,
  RemeshSettings,
  TextureSettings,
  AnimateSettings,
  RiggingSettings,
  SegmentationSettings,
  ActiveTask,
} from '../types';
import { apiClient } from '../lib/api';
import { useAppStore } from '@/stores/useAppStore';
import { useViewerStore } from '@/stores/useViewerStore';
import { shadingModeToPreset, presetToShadingMode } from '@/lib/storeAdapter';
import { useRouter, usePathname } from 'next/navigation';

interface WorkspaceContextType {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  mainNav: MainNavRoute;
  setMainNav: (nav: MainNavRoute) => void;
  assets: ModelAsset[];
  selectedAssetId: string | null;
  currentAsset: ModelAsset | null;
  selectAsset: (id: string) => void;
  updateAssetProperties: (id: string, updates: Partial<ModelAsset>) => void;
  updateMaterialConfig: (updates: Partial<MaterialConfig>) => void;
  deleteAsset: (id: string) => void;
  addAsset: (asset: ModelAsset) => void;
  shadingMode: ShadingMode;
  setShadingMode: (mode: ShadingMode) => void;
  showWireframe: boolean;
  setShowWireframe: (show: boolean) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  showBones: boolean;
  setShowBones: (show: boolean) => void;
  isTurntable: boolean;
  setIsTurntable: (turntable: boolean) => void;
  activeTransformTool: 'select' | 'rotate' | 'pan' | 'frame';
  setActiveTransformTool: (tool: 'select' | 'rotate' | 'pan' | 'frame') => void;
  viewportResetTrigger: number;
  resetCamera: () => void;
  fitToScreen: () => void;
  activeRightTab: 'assets' | 'property' | 'properties' | 'prompt';
  setActiveRightTab: (tab: 'assets' | 'property' | 'properties' | 'prompt') => void;
  rightPanelMode: 'assets' | 'property' | 'properties' | 'prompt';
  setRightPanelMode: (mode: 'assets' | 'property' | 'properties' | 'prompt') => void;
  isLeftPanelOpen: boolean;
  setIsLeftPanelOpen: (open: boolean) => void;
  toolPanelOpen: boolean;
  setToolPanelOpen: (open: boolean) => void;
  isRightPanelOpen: boolean;
  setIsRightPanelOpen: (open: boolean) => void;
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
  setCurrentAsset: (asset: ModelAsset) => void;
  assetFilter: string;
  setAssetFilter: (filter: string) => void;
  duplicateAsset: (id: string) => void;
  systemStats: SystemStats;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isExportModalOpen: boolean;
  setIsExportModalOpen: (open: boolean) => void;
  isDccBridgeOpen: boolean;
  setIsDccBridgeOpen: (open: boolean) => void;
  refreshSystemStats: () => Promise<void>;
  activeTask: ActiveTask | null;
  dismissActiveTask: () => void;
  isExecuting: boolean;
  executionProgress: number;
  executionStep: string;
  cancelExecution: () => void;
  generationSettings: GenerationSettings;
  setGenerationSettings: React.Dispatch<React.SetStateAction<GenerationSettings>>;
  remeshSettings: RemeshSettings;
  setRemeshSettings: React.Dispatch<React.SetStateAction<RemeshSettings>>;
  textureSettings: TextureSettings;
  setTextureSettings: React.Dispatch<React.SetStateAction<TextureSettings>>;
  animateSettings: AnimateSettings;
  setAnimateSettings: React.Dispatch<React.SetStateAction<AnimateSettings>>;
  riggingSettings: RiggingSettings;
  setRiggingSettings: React.Dispatch<React.SetStateAction<RiggingSettings>>;
  segmentationSettings: SegmentationSettings;
  setSegmentationSettings: React.Dispatch<React.SetStateAction<SegmentationSettings>>;
  bones: BoneNode[];
  selectedBoneId: string | null;
  setSelectedBoneId: (id: string | null) => void;
  updateBone: (id: string, updates: Partial<BoneNode>) => void;
  currentFrame: number;
  setCurrentFrame: (frame: number | ((prev: number) => number)) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  totalFrames: number;
  fps: number;
  tracks: AnimationTrack[];
  generate3DModel: () => Promise<void>;
  generateTextTo3D: (customPrompt?: string) => Promise<void>;
  generateImageTo3D: (customImage?: string) => Promise<void>;
  runModelGeneration: () => Promise<void>;
  runRemeshGeneration: () => Promise<void>;
  runTextureGeneration: () => Promise<void>;
  runAnimateGeneration: () => Promise<void>;
  runRiggingGeneration: () => Promise<void>;
  runSegmentationGeneration: () => Promise<void>;
  queueWorkflow: (workflow: Record<string, unknown>, type: ActiveTask['type'], title: string) => Promise<void>;
  navigateToTool: (tool: ToolType) => void;
  navigateToMain: (nav: MainNavRoute) => void;
  navigateToMainNav: (nav: MainNavRoute) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const TOOL_TO_ROUTE: Record<ToolType, string> = {
  model: '/workspace/generate',
  segment: '/workspace/segment',
  retopo: '/workspace/retopo',
  remesh: '/workspace/remesh',
  texture: '/workspace/texture',
  edit: '/workspace/edit',
  upscale: '/workspace/upscale',
  pbr: '/workspace/pbr',
  animate: '/workspace/animate',
  rigging: '/workspace/rigging',
  compare: '/workspace/compare',
};

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const appStore = useAppStore();
  const viewerStore = useViewerStore();
  const router = useRouter();
  const pathname = usePathname();

  const [activeTool, setActiveToolState] = useState<ToolType>('model');
  const [mainNav, setMainNavState] = useState<MainNavRoute>('workspace');
  const [activeRightTab, setActiveRightTab] = useState<'assets' | 'property' | 'properties' | 'prompt'>('assets');
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [assets, setAssets] = useState<ModelAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const selectedAssetIdRef = useRef(selectedAssetId);
  const mainNavRef = useRef(mainNav);
  const [assetFilter, setAssetFilter] = useState<string>('all');

  const [shadingMode, setShadingModeState] = useState<ShadingMode>('textured');
  const [showWireframe, setShowWireframeState] = useState(false);
  const [showGrid, setShowGridState] = useState(appStore.viewer?.showGrid ?? true);
  const [showBones, setShowBonesState] = useState(false);
  const [isTurntable, setIsTurntableState] = useState(appStore.viewer?.autoRotate ?? false);
  const [activeTransformTool, setActiveTransformTool] = useState<'select' | 'rotate' | 'pan' | 'frame'>('select');
  const [viewportResetTrigger, setViewportResetTrigger] = useState(0);

  const [systemStats, setSystemStats] = useState<SystemStats>({
    status: 'offline', host: '/api/v1', gpu: 'Unavailable',
    vramUsedGb: null, vramTotalGb: null, ramUsedGb: null, ramTotalGb: null,
    torchVramUsedGb: null, torchVramTotalGb: null, gpuType: null, gpuIndex: null,
    pythonVersion: null, torchVersion: null, apiVersion: null,
    queueRunning: 0, queuePending: 0, activePromptId: null, activeNode: null,     lastPingMs: 0,
  });
  const systemStatsStatusRef = useRef(systemStats.status);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isDccBridgeOpen, setIsDccBridgeOpen] = useState(false);

  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [executionStep, setExecutionStep] = useState('');
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null);

  const dismissActiveTask = useCallback(() => setActiveTask(null), []);

  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>({
    mode: 'text-to-3d',
    image: null,
    prompt: appStore.prompt || '',
    aiModel: '', meshQuality: 'high', textureQuality: 'high',
    quadTopology: false, seed: 42891, guidanceScale: 7.5, removeBackground: true,
    lowVram: false,
    vramMode: 'auto',
    autoOptimize: false,
    autoOptimizeSettings: { targetPolycount: 30000, fixUVs: true, preserveDetails: 75 },
  });

  const [remeshSettings, setRemeshSettings] = useState<RemeshSettings>({
    tab: 'auto', preset: 'high', targetFaces: 48512, mode: 'adaptive',
    preserveShape: true, preserveSharpEdges: true, preserveUVs: false,
    detailPreservation: 0.75, boundaryProtection: 0.50, voxelSize: 0.10,
  });

  const [textureSettings, setTextureSettings] = useState<TextureSettings>({
    workflow: 'texture', mode: 'ai', style: 'realistic', resolution: '4K',
    referenceImage: null,
    prompt: '',
    maps: { albedo: true, normal: true, roughness: true, metallic: true, ao: true, height: false },
  });

  const [animateSettings, setAnimateSettings] = useState<AnimateSettings>({
    mode: 'animation', type: 'presets', prompt: '',
    preset: 'idle', intensity: 1.0, speed: 1.0, loop: true,
  });

  const [riggingSettings, setRiggingSettings] = useState<RiggingSettings>({
    tab: 'rigging', rigType: 'humanoid', autoRig: true,
    bonesDetection: true, symmetry: true, boneSize: 1.0, boneCount: 32,
  });

  const [segmentationSettings, setSegmentationSettings] = useState<SegmentationSettings>({
    mode: 'auto', target: 'character', selectedPart: 'Whole Character',
    feather: 0.15, preserveTextures: true,
  });

  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [totalFrames, setTotalFrames] = useState(0);
  const [fps, setFps] = useState(30);
  const [tracks, setTracks] = useState<AnimationTrack[]>([]);

  const [bones, setBones] = useState<BoneNode[]>([]);
  const [selectedBoneId, setSelectedBoneId] = useState<string | null>(null);

  const currentAsset = useMemo(
    () => selectedAssetId ? (assets.find(a => a.id === selectedAssetId) ?? null) : null,
    [assets, selectedAssetId]
  );
  const currentAssetRef = useRef(currentAsset);

  useEffect(() => {
    selectedAssetIdRef.current = selectedAssetId;
    currentAssetRef.current = currentAsset;
    mainNavRef.current = mainNav;
    systemStatsStatusRef.current = systemStats.status;
  }, [selectedAssetId, currentAsset, mainNav, systemStats.status]);

  useEffect(() => {
    try {
      const savedLowVram = localStorage.getItem('lowVramMode');
      if (savedLowVram !== null) {
        const isLow = JSON.parse(savedLowVram);
        setGenerationSettings(prev => ({ ...prev, lowVram: isLow }));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (activeTool === 'rigging' || activeTool === 'animate') setShowBonesState(true);
    else setShowBonesState(false);
    if (activeTool === 'remesh') setShowWireframeState(true);
  }, [activeTool]);

  const setActiveTool = useCallback((tool: ToolType) => {
    setActiveToolState(tool);
  }, []);

  const setMainNav = useCallback((nav: MainNavRoute) => {
    setMainNavState(nav);
  }, []);

  const setShadingMode = useCallback((mode: ShadingMode) => {
    setShadingModeState(mode);
    viewerStore.setShadingMode(shadingModeToPreset(mode));
  }, [viewerStore]);

  const setShowWireframe = useCallback((show: boolean) => {
    setShowWireframeState(show);
    useViewerStore.setState({ wireframeOverlay: show });
  }, []);

  const setShowGrid = useCallback((show: boolean) => {
    setShowGridState(show);
    useAppStore.setState((s) => ({ viewer: { ...s.viewer, showGrid: show } }));
  }, []);

  const setShowBones = useCallback((show: boolean) => setShowBonesState(show), []);

  const setIsTurntable = useCallback((val: boolean) => {
    setIsTurntableState(val);
    useAppStore.setState((s) => ({ viewer: { ...s.viewer, autoRotate: val } }));
  }, []);

  const refreshSystemStats = useCallback(async () => {
    const stats = await apiClient.getSystemStats();
    setSystemStats(stats as SystemStats);
  }, []);

  const refreshHistory = useCallback(async () => {
    const history = await apiClient.getHistory();
    const parsed: ModelAsset[] = Object.entries(history).filter(([, h]) => h.status?.completed).map(([id, h], i) => ({
      id: id || `hist-${i}`,
      name: (h.prompt?.[1] as string)?.slice(0, 40) || 'Generated Model',
      category: 'generation' as const,
      thumbnail: '',
      source: { filename: '', subfolder: 'output', type: 'output', viewUrl: '' },
      meshType: 'custom' as const, faces: 0, vertices: 0, triangles: 0,
      statsAvailable: false, topology: 'Triangle' as const, format: 'GLB' as const,
      dateCreated: '', tags: ['Generated'], materials: [],
    }));
    setAssets(prev => {
      const existingIds = new Set(prev.map(a => a.id));
      const newParsed = parsed.filter(a => !existingIds.has(a.id));
      const local = prev.filter(a => a.source?.localUrl);
      return [...newParsed, ...local];
    });
  }, []);

  const refreshHistoryRef = useRef(refreshHistory);
  useEffect(() => {
    refreshHistoryRef.current = refreshHistory;
  }, [refreshHistory]);

  // Fetch uploaded assets from backend on mount (persistence across refresh)
  useEffect(() => {
    const fetchUploadedAssets = async () => {
      try {
        const res = await fetch('/api/v1/upload/assets');
        if (!res.ok) return;
        const data = await res.json();
        const uploadedImages = (data?.data?.images || data?.images || []).map((img: any) => ({
          id: img.id || img.filename,
          name: img.name || img.filename,
          category: 'texture' as const,
          meshType: 'custom' as const,
          thumbnail: img.url || '',
          faces: 0, vertices: 0, triangles: 0,
          statsAvailable: false,
          source: { filename: img.filename, subfolder: '', type: 'upload', viewUrl: img.url || '' },
          topology: 'Triangle' as const,
          format: img.format || 'PNG',
          dateCreated: img.created_at || '',
          tags: ['Uploaded', 'Image'],
        }));
        const uploadedModels = (data?.data?.models || data?.models || []).map((m: any) => {
          const meshStats = m.mesh_stats;
          return {
            id: m.id || m.filename,
            name: m.name || m.filename,
            category: 'mesh' as const,
            meshType: 'custom' as const,
            thumbnail: m.thumbnail_url || '',
            faces: meshStats?.polygon_count || m.faces || 0,
            vertices: meshStats?.vertex_count || m.vertices || 0,
            triangles: meshStats?.polygon_count || m.triangles || 0,
            statsAvailable: !!(meshStats && meshStats.polygon_count > 0),
            source: { filename: m.filename, subfolder: '', type: 'upload', viewUrl: m.url || '' },
            topology: 'Triangle' as const,
            format: m.format || 'GLB',
            dateCreated: m.created_at || '',
            tags: ['Uploaded', 'Model'],
          };
        });
        // Merge uploaded assets without duplicates
        setAssets(prev => {
          const existingIds = new Set(prev.map(a => a.id));
          const newAssets = [...uploadedImages, ...uploadedModels].filter(a => !existingIds.has(a.id));
          return [...prev, ...newAssets];
        });
      } catch (err) {
        // Silently fail - backend might not be available
      }
    };
    void fetchUploadedAssets();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    // Immediately fetch stats and history on mount
    void refreshSystemStats();
    void refreshHistory();

    const poll = () => {
      if (cancelled) return;
      if (typeof document === 'undefined' || !document.hidden) {
        void refreshSystemStats();
        void refreshHistory();
      }
      timeoutId = setTimeout(poll, 8000);
    };
    timeoutId = setTimeout(poll, 8000);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [refreshSystemStats, refreshHistory]);

  useEffect(() => {
    const onProgress = (data: unknown) => {
      const d = data as { value?: number; max?: number; node?: string };
      const progress = (d.max && d.max > 0) ? Math.min(100, Math.round(((d.value ?? 0) / d.max) * 100)) : 0;
      setExecutionProgress(progress);
      setActiveTask(prev => prev ? { ...prev, status: 'running', progress, activeNode: d.node ?? prev.activeNode, currentStep: d.node ? `Executing ${d.node}` : prev.currentStep } : prev);
    };
    const onExecuting = (data: unknown) => {
      const d = data as { node?: string };
      setIsExecuting(!!d.node);
      setExecutionStep(d.node ? `Executing ${d.node}` : '');
    };
    const onExecuted = () => {
      setIsExecuting(false);
      setExecutionProgress(100);
      setExecutionStep('Completed');
      setActiveTask(prev => prev ? { ...prev, status: 'completed', progress: 100, currentStep: 'Completed' } : prev);
      void refreshHistoryRef.current();
    };
    const onError = (data: unknown) => {
      const d = data as { exception_message?: string; message?: string };
      setIsExecuting(false);
      setExecutionProgress(0);
      setExecutionStep(d.exception_message || d.message || 'Error');
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: d.exception_message || 'Error' } : prev);
    };
    const off1 = apiClient.on('progress', onProgress);
    const off2 = apiClient.on('executing', onExecuting);
    const off3 = apiClient.on('executed', onExecuted);
    const off4 = apiClient.on('execution_error', onError);
    return () => { off1(); off2(); off3(); off4(); };
  }, []);

  const selectAsset = useCallback((id: string) => {
    setSelectedAssetId(id);
    // Increment viewport trigger to force MeshViewer reload
    setViewportResetTrigger(prev => prev + 1);
    const asset = assets.find(a => a.id === id);
    if (asset?.faces) setRemeshSettings(prev => ({ ...prev, targetFaces: asset.faces }));
  }, [assets]);

  const setCurrentAsset = useCallback((asset: ModelAsset) => selectAsset(asset.id), [selectAsset]);

  const duplicateAsset = useCallback((id: string) => {
    const existing = assets.find(a => a.id === id);
    if (!existing) return;
    const dup: ModelAsset = { ...existing, id: `asset-${Date.now()}`, name: `${existing.name}_copy`, dateCreated: new Date().toISOString().split('T')[0] };
    setAssets(prev => [dup, ...prev]);
    setSelectedAssetId(dup.id);
  }, [assets]);

  const updateAssetProperties = useCallback((id: string, updates: Partial<ModelAsset>) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  }, []);

  const updateMaterialConfig = useCallback((updates: Partial<MaterialConfig>) => {
    const asset = currentAssetRef.current;
    if (!asset) return;
    const cur = asset.materialConfig || { roughness: 0.5, metalness: 0.5, color: '#888888', wireframe: false, wireframeColor: '#222222', normalScale: 1.0, aoIntensity: 0.8, style: 'realistic' };
    updateAssetProperties(asset.id, { materialConfig: { ...cur, ...updates } });
  }, [updateAssetProperties]);

  const deleteAsset = useCallback((id: string) => {
    setAssets(prev => {
      const next = prev.filter(a => a.id !== id);
      if (id === selectedAssetIdRef.current) {
        if (next.length > 0) {
          setSelectedAssetId(next[0].id);
        } else {
          setSelectedAssetId(null);
        }
      }
      return next;
    });
  }, []);

  const addAsset = useCallback((asset: ModelAsset) => {
    setAssets(prev => [asset, ...prev]);
    setSelectedAssetId(asset.id);
  }, []);

  const updateBone = useCallback((id: string, updates: Partial<BoneNode>) => {
    setBones(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const resetCamera = useCallback(() => {
    setViewportResetTrigger(prev => prev + 1);
  }, []);

  const fitToScreen = useCallback(() => setViewportResetTrigger(prev => prev + 1), []);

  const cancelExecution = useCallback(() => {
    setIsExecuting(false);
    setExecutionProgress(0);
    setExecutionStep('');
    setActiveTask(prev => prev ? { ...prev, status: 'interrupted', currentStep: 'Execution cancelled' } : null);
    apiClient.cancelExecution();
  }, []);

  const startTask = useCallback((type: ActiveTask['type'], title: string, promptId?: string) => {
    setIsExecuting(true);
    setExecutionProgress(0);
    setExecutionStep('Queued');
    setActiveTask({ id: promptId ?? `task-${type}-${Date.now()}`, type, title, startedAt: Date.now(), status: 'queued', progress: 0, currentStep: 'Queued' });
  }, []);

  const generateTextTo3D = useCallback(async (customPrompt?: string) => {
    const promptToUse = (customPrompt ?? generationSettings.prompt).trim();
    if (!promptToUse) { setExecutionStep('Enter a text prompt'); return; }
    startTask('text-to-3d', 'Text-to-3D generation');
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'text-to-3d',
          prompt: promptToUse,
          provider: generationSettings.aiModel,
          quality: generationSettings.meshQuality,
          guidance_scale: generationSettings.guidanceScale,
          seed: generationSettings.seed,
          generate_texture: true,
          auto_rig: false,
          low_vram: Boolean(generationSettings.lowVram),
          vram_mode: generationSettings.lowVram ? 'low' : (generationSettings.vramMode || 'auto'),
          workspace: 'mesh-generation',
          auto_optimize: generationSettings.autoOptimize,
          auto_optimize_settings: generationSettings.autoOptimizeSettings,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { job_id?: string; id?: string };
      setActiveTask(prev => prev ? { ...prev, id: data.job_id ?? data.id ?? prev.id, status: 'running', currentStep: 'Processing' } : prev);
      setExecutionStep('Generation submitted');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Failed to submit generation');
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: 'Submission failed' } : prev);
    }
  }, [generationSettings.prompt, generationSettings.aiModel, generationSettings.meshQuality, generationSettings.guidanceScale, generationSettings.seed, generationSettings.lowVram, generationSettings.vramMode, generationSettings.autoOptimize, generationSettings.autoOptimizeSettings, startTask]);

  const generateImageTo3D = useCallback(async (customImage?: string) => {
    const imageToUse = customImage ?? generationSettings.image;
    if (!imageToUse) { setExecutionStep('Upload an image first'); return; }
    startTask('image-to-3d', 'Image-to-3D generation');
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'image-to-3d',
          provider: generationSettings.aiModel,
          reference_image_url: imageToUse,
          quality: generationSettings.meshQuality,
          low_vram: Boolean(generationSettings.lowVram),
          vram_mode: generationSettings.lowVram ? 'low' : (generationSettings.vramMode || 'auto'),
          auto_optimize: generationSettings.autoOptimize,
          auto_optimize_settings: generationSettings.autoOptimizeSettings,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { job_id?: string; id?: string };
      setActiveTask(prev => prev ? { ...prev, id: data.job_id ?? data.id ?? prev.id, status: 'running', currentStep: 'Processing' } : prev);
      setExecutionStep('Image-to-3D generation submitted');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Failed to submit generation');
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: 'Submission failed' } : prev);
    }
  }, [generationSettings.image, generationSettings.aiModel, generationSettings.meshQuality, generationSettings.lowVram, generationSettings.vramMode, generationSettings.autoOptimize, generationSettings.autoOptimizeSettings, startTask]);

  const generate3DModel = useCallback(async () => {
    if (generationSettings.mode === 'text-to-3d') return generateTextTo3D();
    return generateImageTo3D();
  }, [generationSettings.mode, generateTextTo3D, generateImageTo3D]);

  const runRemeshGeneration = useCallback(async () => {
    startTask('retopo', 'Remesh / retopology');
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'remesh',
          quality: 'standard',
          preserve_uvs: remeshSettings.preserveUVs,
          workspace: 'remesh',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { job_id?: string; id?: string };
      setActiveTask(prev => prev ? { ...prev, id: data.job_id ?? data.id ?? prev.id, status: 'running', currentStep: 'Processing' } : prev);
      setExecutionStep('Remesh submitted');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Remesh failed');
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: 'Submission failed' } : prev);
    }
  }, [remeshSettings.preserveUVs, startTask]);

  const runTextureGeneration = useCallback(async () => {
    startTask('texture', 'Texture generation');
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'texture-generation',
          quality: 'standard',
          style_preset: textureSettings.style,
          prompt: textureSettings.prompt,
          workspace: 'texture-generation',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { job_id?: string; id?: string };
      setActiveTask(prev => prev ? { ...prev, id: data.job_id ?? data.id ?? prev.id, status: 'running', currentStep: 'Processing' } : prev);
      setExecutionStep('Texture generation submitted');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Texture failed');
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: 'Submission failed' } : prev);
    }
  }, [textureSettings.style, textureSettings.prompt, startTask]);

  const runAnimateGeneration = useCallback(async () => {
    startTask('animate', 'Animation generation');
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'rigging',
          quality: 'standard',
          prompt: animateSettings.prompt || animateSettings.preset,
          workspace: 'rigging',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { job_id?: string; id?: string };
      setActiveTask(prev => prev ? { ...prev, id: data.job_id ?? data.id ?? prev.id, status: 'running', currentStep: 'Processing' } : prev);
      setExecutionStep('Animation submitted');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Animation failed');
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: 'Submission failed' } : prev);
    }
  }, [animateSettings.preset, animateSettings.prompt, startTask]);

  const runRiggingGeneration = useCallback(async () => {
    startTask('rigging', 'Rigging generation');
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'rigging',
          quality: 'standard',
          auto_rig: riggingSettings.autoRig,
          workspace: 'rigging',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { job_id?: string; id?: string };
      setActiveTask(prev => prev ? { ...prev, id: data.job_id ?? data.id ?? prev.id, status: 'running', currentStep: 'Processing' } : prev);
      setExecutionStep('Rigging submitted');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Rigging failed');
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: 'Submission failed' } : prev);
    }
  }, [riggingSettings.autoRig, startTask]);

  const runSegmentationGeneration = useCallback(async () => {
    startTask('segment', 'Segmentation');
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'render',
          quality: 'standard',
          workspace: 'post-processing',
          prompt: `segment:${segmentationSettings.target}:${segmentationSettings.selectedPart}`,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { job_id?: string; id?: string };
      setActiveTask(prev => prev ? { ...prev, id: data.job_id ?? data.id ?? prev.id, status: 'running', currentStep: 'Processing' } : prev);
      setExecutionStep('Segmentation submitted');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Segmentation failed');
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: 'Submission failed' } : prev);
    }
  }, [segmentationSettings.target, segmentationSettings.selectedPart, startTask]);

  const queueWorkflow = useCallback(async (workflow: Record<string, unknown>, type: ActiveTask['type'], title: string) => {
    startTask(type, title);
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'text-to-3d',
          quality: 'standard',
          prompt: `workflow:${Object.keys(workflow).join(',')}`,
          workspace: 'mesh-generation',
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { job_id?: string; id?: string };
      setActiveTask(prev => prev ? { ...prev, id: data.job_id ?? data.id ?? prev.id, status: 'running', currentStep: 'Processing' } : prev);
      setExecutionStep('Workflow queued');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Workflow failed');
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: 'Submission failed' } : prev);
    }
  }, [startTask]);

  const navigateToTool = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    setMainNav('workspace');
    mainNavRef.current = 'workspace';
    setIsLeftPanelOpen(true);
    const route = TOOL_TO_ROUTE[tool] || '/workspace/generate';
    if (pathname !== route) router.push(route);
  }, [pathname, router, setMainNav, setActiveTool, setIsLeftPanelOpen]);

  const navigateToMain = useCallback((nav: MainNavRoute) => {
    if (mainNavRef.current === nav) return;
    setMainNav(nav);
    if (nav === 'dashboard') router.push('/workspace/overview');
    else if (nav === 'assets') router.push('/workspace/assets');
    else if (nav === 'system') router.push('/workspace/system');
    else if (nav === 'settings') router.push('/settings');
  }, [router]);

  const value = React.useMemo(() => ({
    activeTool, setActiveTool, mainNav, setMainNav,
    assets, selectedAssetId, currentAsset, selectAsset, updateAssetProperties, updateMaterialConfig, deleteAsset, addAsset,
    shadingMode, setShadingMode, showWireframe, setShowWireframe, showGrid, setShowGrid, showBones, setShowBones,
    isTurntable, setIsTurntable, activeTransformTool, setActiveTransformTool,
    viewportResetTrigger, resetCamera, fitToScreen,
    activeRightTab, setActiveRightTab,
    rightPanelMode: activeRightTab, setRightPanelMode: setActiveRightTab,
    isLeftPanelOpen, setIsLeftPanelOpen, toolPanelOpen: isLeftPanelOpen, setToolPanelOpen: setIsLeftPanelOpen,
    isRightPanelOpen, setIsRightPanelOpen, rightPanelOpen: isRightPanelOpen, setRightPanelOpen: setIsRightPanelOpen,
    setCurrentAsset, assetFilter, setAssetFilter, duplicateAsset,
    systemStats, isSettingsOpen, setIsSettingsOpen,
    isExportModalOpen, setIsExportModalOpen, isDccBridgeOpen, setIsDccBridgeOpen,
    refreshSystemStats, activeTask, dismissActiveTask,
    isExecuting, executionProgress, executionStep, cancelExecution,
    generationSettings, setGenerationSettings, remeshSettings, setRemeshSettings,
    textureSettings, setTextureSettings, animateSettings, setAnimateSettings,
    riggingSettings, setRiggingSettings, segmentationSettings, setSegmentationSettings,
    bones, selectedBoneId, setSelectedBoneId, updateBone,
    currentFrame, setCurrentFrame, isPlaying, setIsPlaying, totalFrames, fps, tracks,
    generate3DModel, generateTextTo3D, generateImageTo3D, runModelGeneration: generate3DModel,
    runRemeshGeneration, runTextureGeneration, runAnimateGeneration, runRiggingGeneration, runSegmentationGeneration,
    queueWorkflow, navigateToTool, navigateToMain, navigateToMainNav: navigateToMain,
  }), [
    activeTool, mainNav, assets, selectedAssetId, currentAsset, shadingMode, showWireframe, showGrid, showBones,
    isTurntable, activeTransformTool, viewportResetTrigger, activeRightTab, isLeftPanelOpen, isRightPanelOpen,
    assetFilter, systemStats, isSettingsOpen, isExportModalOpen, isDccBridgeOpen, refreshSystemStats,
    activeTask, isExecuting, executionProgress, executionStep, generationSettings, remeshSettings,
    textureSettings, animateSettings, riggingSettings, segmentationSettings, bones, selectedBoneId,
    currentFrame, isPlaying, totalFrames, fps, tracks, selectAsset, updateAssetProperties,
    updateMaterialConfig, deleteAsset, addAsset, setShadingMode, setShowWireframe, setShowGrid, setShowBones,
    setIsTurntable, setActiveTransformTool, resetCamera, fitToScreen, setActiveRightTab,
    setIsLeftPanelOpen, setIsRightPanelOpen, setCurrentAsset, setAssetFilter, duplicateAsset,
    setIsSettingsOpen, setIsExportModalOpen, setIsDccBridgeOpen, dismissActiveTask, cancelExecution,
    setGenerationSettings, setRemeshSettings, setTextureSettings, setAnimateSettings, setRiggingSettings,
    setSegmentationSettings, setSelectedBoneId, updateBone, setCurrentFrame, setIsPlaying,
    generate3DModel, generateTextTo3D, generateImageTo3D, runRemeshGeneration, runTextureGeneration,
    runAnimateGeneration, runRiggingGeneration, runSegmentationGeneration, queueWorkflow,
    navigateToTool, navigateToMain,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return context;
};
