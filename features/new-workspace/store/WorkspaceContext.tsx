import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
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
import { DEFAULT_HUMANOID_SKELETON } from '../lib/geometry';
import { apiClient } from '../lib/api';
import { useAppStore } from '@/stores/useAppStore';
import { useViewerStore } from '@/stores/useViewerStore';
import { shadingModeToPreset, presetToShadingMode } from '@/lib/storeAdapter';

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
  setCurrentFrame: (frame: number) => void;
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
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const appStore = useAppStore();
  const viewerStore = useViewerStore();

  const [activeTool, setActiveToolState] = useState<ToolType>('model');
  const [mainNav, setMainNavState] = useState<MainNavRoute>('workspace');
  const [activeRightTab, setActiveRightTab] = useState<'assets' | 'property' | 'properties' | 'prompt'>('assets');
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [assets, setAssets] = useState<ModelAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
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
    queueRunning: 0, queuePending: 0, activePromptId: null, activeNode: null, lastPingMs: 0,
  });

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
    prompt: appStore.prompt || 'A stylized medieval fantasy goblin warrior',
    aiModel: 'hd', meshQuality: 'high', textureQuality: 'high',
    quadTopology: false, seed: 42891, guidanceScale: 7.5, removeBackground: true,
  });

  const [remeshSettings, setRemeshSettings] = useState<RemeshSettings>({
    tab: 'auto', preset: 'high', targetFaces: 48512, mode: 'adaptive',
    preserveShape: true, preserveSharpEdges: true, preserveUVs: false,
    detailPreservation: 0.75, boundaryProtection: 0.50, voxelSize: 0.10,
  });

  const [textureSettings, setTextureSettings] = useState<TextureSettings>({
    workflow: 'texture', mode: 'ai', style: 'realistic', resolution: '4K',
    referenceImage: null,
    prompt: 'Weathered mechanical steampunk plating with rusted edges',
    maps: { albedo: true, normal: true, roughness: true, metallic: true, ao: true, height: false },
  });

  const [animateSettings, setAnimateSettings] = useState<AnimateSettings>({
    mode: 'animation', type: 'presets', prompt: 'Combat ready aggressive idle',
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
  const totalFrames = 120;
  const fps = 30;

  const tracks: AnimationTrack[] = useMemo(() => [
    { id: 't_root', name: 'Root Motion', type: 'root', color: '#f5c518', keyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 0.2 }, { frame: 60, value: 0 }, { frame: 90, value: -0.1 }, { frame: 120, value: 0 }] },
    { id: 't_hips', name: 'Hips / Pelvis', type: 'bone', color: '#60a5fa', keyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 0.15 }, { frame: 60, value: 0 }, { frame: 90, value: 0.15 }, { frame: 120, value: 0 }] },
    { id: 't_spine', name: 'Spine & Chest', type: 'bone', color: '#34d399', keyframes: [{ frame: 0, value: 0 }, { frame: 45, value: 0.3 }, { frame: 75, value: -0.1 }, { frame: 120, value: 0 }] },
    { id: 't_arms', name: 'Upper Limbs (Arms)', type: 'bone', color: '#f472b6', keyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 0.5 }, { frame: 60, value: 0 }, { frame: 90, value: -0.5 }, { frame: 120, value: 0 }] },
    { id: 't_legs', name: 'Lower Limbs (Legs)', type: 'bone', color: '#a78bfa', keyframes: [{ frame: 0, value: 0 }, { frame: 30, value: -0.4 }, { frame: 60, value: 0 }, { frame: 90, value: 0.4 }, { frame: 120, value: 0 }] },
  ], []);

  const [bones, setBones] = useState<BoneNode[]>(DEFAULT_HUMANOID_SKELETON);
  const [selectedBoneId, setSelectedBoneId] = useState<string | null>('spine');

  const currentAsset = useMemo(
    () => selectedAssetId ? (assets.find(a => a.id === selectedAssetId) ?? null) : null,
    [assets, selectedAssetId]
  );

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
      const local = prev.filter(a => a.source?.localUrl);
      return [...parsed, ...local];
    });
  }, []);

  useEffect(() => {
    void refreshSystemStats();
    void refreshHistory();
    const interval = setInterval(() => { void refreshSystemStats(); void refreshHistory(); }, 5000);
    return () => clearInterval(interval);
  }, [refreshSystemStats, refreshHistory]);

  useEffect(() => {
    const onProgress = (data: unknown) => {
      const d = data as { value?: number; max?: number; node?: string };
      const progress = d.max ? Math.round((d.value! / d.max) * 100) : 0;
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
      void refreshHistory();
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
  }, [refreshHistory]);

  const selectAsset = useCallback((id: string) => {
    setSelectedAssetId(id);
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
    if (!currentAsset) return;
    const cur = currentAsset.materialConfig || { roughness: 0.5, metalness: 0.5, color: '#888888', wireframe: false, wireframeColor: '#222222', normalScale: 1.0, aoIntensity: 0.8, style: 'realistic' };
    updateAssetProperties(currentAsset.id, { materialConfig: { ...cur, ...updates } });
  }, [currentAsset, updateAssetProperties]);

  const deleteAsset = useCallback((id: string) => {
    setAssets(prev => {
      const next = prev.filter(a => a.id !== id);
      if (id === selectedAssetId && next.length > 0) setSelectedAssetId(next[0].id);
      return next;
    });
  }, [selectedAssetId]);

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
        body: JSON.stringify({ prompt: promptToUse, mode: 'text-to-3d', model: generationSettings.aiModel }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { job_id?: string; id?: string };
      setActiveTask(prev => prev ? { ...prev, id: data.job_id ?? data.id ?? prev.id, status: 'running', currentStep: 'Processing' } : prev);
      setExecutionStep('Generation submitted');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Failed to submit generation');
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: 'Submission failed' } : prev);
    }
  }, [generationSettings.prompt, generationSettings.aiModel, startTask]);

  const generateImageTo3D = useCallback(async (customImage?: string) => {
    if (!customImage && !generationSettings.image) { setExecutionStep('Upload an image first'); return; }
    startTask('image-to-3d', 'Image-to-3D generation');
    setExecutionStep('Image-to-3D generation submitted');
  }, [generationSettings.image, startTask]);

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
        body: JSON.stringify({ mode: 'remesh', target_faces: remeshSettings.targetFaces, preserve_uvs: remeshSettings.preserveUVs }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setExecutionStep('Remesh submitted');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Remesh failed');
      setActiveTask(prev => prev ? { ...prev, status: 'failed' } : prev);
    }
  }, [remeshSettings.targetFaces, remeshSettings.preserveUVs, startTask]);

  const runTextureGeneration = useCallback(async () => {
    startTask('texture', 'Texture generation');
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'texture-generation', style: textureSettings.style, resolution: textureSettings.resolution, prompt: textureSettings.prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setExecutionStep('Texture generation submitted');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Texture failed');
      setActiveTask(prev => prev ? { ...prev, status: 'failed' } : prev);
    }
  }, [textureSettings.style, textureSettings.resolution, textureSettings.prompt, startTask]);

  const runAnimateGeneration = useCallback(async () => {
    startTask('animate', 'Animation generation');
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'animation', preset: animateSettings.preset, prompt: animateSettings.prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setExecutionStep('Animation submitted');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Animation failed');
      setActiveTask(prev => prev ? { ...prev, status: 'failed' } : prev);
    }
  }, [animateSettings.preset, animateSettings.prompt, startTask]);

  const runRiggingGeneration = useCallback(async () => {
    startTask('rigging', 'Rigging generation');
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'rigging', rig_type: riggingSettings.rigType, auto_rig: riggingSettings.autoRig }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setExecutionStep('Rigging submitted');
    } catch (e) {
      setExecutionStep(e instanceof Error ? e.message : 'Rigging failed');
      setActiveTask(prev => prev ? { ...prev, status: 'failed' } : prev);
    }
  }, [riggingSettings.rigType, riggingSettings.autoRig, startTask]);

  const runSegmentationGeneration = useCallback(async () => {
    startTask('segment', 'Segmentation');
    setExecutionStep('Segmentation submitted (stub)');
  }, [startTask]);

  const queueWorkflow = useCallback(async (workflow: Record<string, unknown>, type: ActiveTask['type'], title: string) => {
    startTask(type, title);
    setExecutionStep('Workflow queued');
  }, [startTask]);

  const value = {
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
    queueWorkflow,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return context;
};
