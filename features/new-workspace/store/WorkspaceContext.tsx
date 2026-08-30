import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ToolType,
  MainNavRoute,
  ShadingMode,
  ModelAsset,
  MaterialConfig,
  SystemStats,
  GenerationSettings,
  RemeshSettings,
  TextureSettings,
  ActiveTask,
  EnvironmentSettings,
} from '../types';
import { apiClient } from '../lib/api';
import { useAppStore } from '@/stores/useAppStore';
import { useViewerStore } from '@/stores/useViewerStore';
import { shadingModeToPreset, presetToShadingMode } from '@/lib/storeAdapter';
import { useRouter, usePathname } from 'next/navigation';
import { dedupedGet, TTL } from '@/lib/requestDedup';

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
  environmentSettings: EnvironmentSettings;
  setEnvironmentSettings: React.Dispatch<React.SetStateAction<EnvironmentSettings>>;
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
  generate3DModel: () => Promise<void>;
  generateImageTo3D: (customImage?: string) => Promise<void>;
  runModelGeneration: () => Promise<void>;
  runRemeshGeneration: () => Promise<void>;
  runTextureGeneration: () => Promise<void>;
  queueWorkflow: (workflow: Record<string, unknown>, type: ActiveTask['type'], title: string) => Promise<void>;
  navigateToTool: (tool: ToolType) => void;
  navigateToMain: (nav: MainNavRoute) => void;
  navigateToMainNav: (nav: MainNavRoute) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const TOOL_TO_ROUTE: Record<ToolType, string> = {
  model: '/workspace/generate',
  worldgen: '/workspace/worldgen',
  remesh: '/workspace/remesh',
  texture: '/workspace/texture',
  edit: '/workspace/edit',
  upscale: '/workspace/upscale',
  pbr: '/workspace/pbr',
  environment: '/workspace/generate',
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
    mode: 'image-to-3d',
    image: null,
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

  const [environmentSettings, setEnvironmentSettings] = useState<EnvironmentSettings>({
    ambientIntensity: 1.2,
    keyLightIntensity: 3.0,
    fillLightIntensity: 1.8,
    rimLightIntensity: 2.5,
    exposure: 1.5,
    gridVisible: true,
    gridColor: 'hsl(var(--muted-foreground))',
    backgroundColor: 'hsl(var(--surface-1))',
    autoRotate: false,
    showAxes: true,
    showStats: true,
  });

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
    setSystemStats(stats as unknown as SystemStats);
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
      // Keep local assets AND uploaded assets (input/upload types)
      const local = prev.filter(a => a.source?.localUrl || a.source?.type === 'upload' || a.source?.type === 'input');
      return [...newParsed, ...local];
    });
  }, []);

  const refreshHistoryRef = useRef(refreshHistory);
  useEffect(() => {
    refreshHistoryRef.current = refreshHistory;
  }, [refreshHistory]);

  // Fetch uploaded MODELS from backend on mount (persistence across refresh)
  // NOTE: Images are NOT fetched — they stay in backend storage only.
  useEffect(() => {
    const fetchUploadedAssets = async () => {
      try {
        const res = await fetch('/api/v1/upload/assets');
        if (!res.ok) return;
        const data = await res.json();
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
        // Merge uploaded models without duplicates
        setAssets(prev => {
          const existingIds = new Set(prev.map(a => a.id));
          const newAssets = uploadedModels.filter(a => !existingIds.has(a.id));
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
    let statsTimeoutId: ReturnType<typeof setTimeout>;
    let historyTimeoutId: ReturnType<typeof setTimeout>;
    let isStatsPending = false;
    let isHistoryPending = false;

    // Immediately fetch stats and history on mount
    void refreshSystemStats();
    void refreshHistory();

    // Poll system stats every 20s (reduced frequency to avoid UI blocking)
    const pollStats = () => {
      if (cancelled) return;
      if (typeof document === 'undefined' || !document.hidden) {
        if (!isStatsPending) {
          isStatsPending = true;
          refreshSystemStats().finally(() => { isStatsPending = false; });
        }
      }
      statsTimeoutId = setTimeout(pollStats, 20000);
    };

    // Poll history every 60s (less frequent — only new completed jobs)
    const pollHistory = () => {
      if (cancelled) return;
      if (typeof document === 'undefined' || !document.hidden) {
        if (!isHistoryPending) {
          isHistoryPending = true;
          refreshHistory().finally(() => { isHistoryPending = false; }
          );
        }
      }
      historyTimeoutId = setTimeout(pollHistory, 60000);
    };

    statsTimeoutId = setTimeout(pollStats, 20000);
    historyTimeoutId = setTimeout(pollHistory, 60000);
    return () => {
      cancelled = true;
      clearTimeout(statsTimeoutId);
      clearTimeout(historyTimeoutId);
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
    const cur = asset.materialConfig || { roughness: 0.5, metalness: 0.5, color: 'hsl(0, 0%, 50%)', wireframe: false, wireframeColor: 'hsl(0, 0%, 10%)', normalScale: 1.0, aoIntensity: 0.8, style: 'realistic' };
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
    return generateImageTo3D();
  }, [generateImageTo3D]);

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

  const queueWorkflow = useCallback(async (workflow: Record<string, unknown>, type: ActiveTask['type'], title: string) => {
    startTask(type, title);
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'image-to-3d',
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

  // Split context value into smaller memos to reduce re-render scope.
  // Each memo only recalculates when its specific dependencies change.
  const viewportValue = useMemo(() => ({
    shadingMode, setShadingMode, showWireframe, setShowWireframe,
    showGrid, setShowGrid, showBones, setShowBones,
    isTurntable, setIsTurntable,
    activeTransformTool, setActiveTransformTool,
    viewportResetTrigger, resetCamera, fitToScreen,
  }), [shadingMode, setShadingMode, showWireframe, setShowWireframe,
    showGrid, setShowGrid, showBones, setShowBones,
    isTurntable, setIsTurntable,
    activeTransformTool, setActiveTransformTool,
    viewportResetTrigger, resetCamera, fitToScreen]);

  const toolValue = useMemo(() => ({
    activeTool, setActiveTool, mainNav, setMainNav,
    activeRightTab, setActiveRightTab,
    rightPanelMode: activeRightTab, setRightPanelMode: setActiveRightTab,
    isLeftPanelOpen, setIsLeftPanelOpen,
    toolPanelOpen: isLeftPanelOpen, setToolPanelOpen: setIsLeftPanelOpen,
    isRightPanelOpen, setIsRightPanelOpen,
    rightPanelOpen: isRightPanelOpen, setRightPanelOpen: setIsRightPanelOpen,
    navigateToTool, navigateToMain, navigateToMainNav: navigateToMain,
  }), [activeTool, setActiveTool, mainNav, setMainNav,
    activeRightTab, setActiveRightTab,
    isLeftPanelOpen, setIsLeftPanelOpen,
    isRightPanelOpen, setIsRightPanelOpen,
    navigateToTool, navigateToMain]);

  const assetValue = useMemo(() => ({
    assets, selectedAssetId, currentAsset,
    selectAsset, updateAssetProperties, updateMaterialConfig,
    deleteAsset, addAsset, setCurrentAsset,
    assetFilter, setAssetFilter, duplicateAsset,
  }), [assets, selectedAssetId, currentAsset,
    selectAsset, updateAssetProperties, updateMaterialConfig,
    deleteAsset, addAsset, setCurrentAsset,
    assetFilter, setAssetFilter, duplicateAsset]);

  const systemValue = useMemo(() => ({
    systemStats, isSettingsOpen, setIsSettingsOpen,
    isExportModalOpen, setIsExportModalOpen,
    isDccBridgeOpen, setIsDccBridgeOpen,
    refreshSystemStats,
  }), [systemStats, isSettingsOpen, setIsSettingsOpen,
    isExportModalOpen, setIsExportModalOpen,
    isDccBridgeOpen, setIsDccBridgeOpen,
    refreshSystemStats]);

  const executionValue = useMemo(() => ({
    activeTask, dismissActiveTask,
    isExecuting, executionProgress, executionStep, cancelExecution,
  }), [activeTask, dismissActiveTask,
    isExecuting, executionProgress, executionStep, cancelExecution]);

  const generationSettingsValue = useMemo(() => ({
    generationSettings, setGenerationSettings,
    remeshSettings, setRemeshSettings,
    textureSettings, setTextureSettings,
    environmentSettings, setEnvironmentSettings,
  }), [generationSettings, setGenerationSettings,
    remeshSettings, setRemeshSettings,
    textureSettings, setTextureSettings,
    environmentSettings, setEnvironmentSettings]);

  const generationActionsValue = useMemo(() => ({
    generate3DModel, generateImageTo3D,
    runModelGeneration: generate3DModel,
    runRemeshGeneration, runTextureGeneration,
    queueWorkflow,
  }), [generate3DModel, generateImageTo3D,
    runRemeshGeneration, runTextureGeneration,
    queueWorkflow]);

  const value = React.useMemo(() => ({
    ...viewportValue, ...toolValue, ...assetValue, ...systemValue,
    ...executionValue, ...generationSettingsValue,
    ...generationActionsValue,
  }), [viewportValue, toolValue, assetValue, systemValue,
    executionValue, generationSettingsValue,
    generationActionsValue]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return context;
};
