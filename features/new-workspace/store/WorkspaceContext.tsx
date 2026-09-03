import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
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
  leftPanelWidth: number;
  setLeftPanelWidth: (width: number) => void;
  rightPanelWidth: number;
  setRightPanelWidth: (width: number) => void;
  activeTask: ActiveTask | null;
  dismissActiveTask: () => void;
  isExecuting: boolean;
  executionProgress: number;
  executionStep: string;
  cancelExecution: () => Promise<void>;
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
    remesh: '/workspace/remesh',
    texture: '/workspace/texture',
    edit: '/workspace/edit',
    upscale: '/workspace/upscale',
    pbr: '/workspace/pbr',
    environment: '/workspace/generate',
    segment: '/workspace/segment',
  };

async function parseApiData<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (payload?.success === false) {
    throw new Error(payload?.message || 'Backend request failed');
  }
  return (payload?.data ?? payload) as T;
}

async function parseApiError(response: Response): Promise<Error> {
  try {
    const payload = await response.json();
    return new Error(payload?.detail || payload?.message || `Backend returned HTTP ${response.status}`);
  } catch {
    return new Error(`Backend returned HTTP ${response.status}`);
  }
}

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
  const [leftPanelWidth, setLeftPanelWidth] = useState(184); // Tripo style ~184px
  const [rightPanelWidth, setRightPanelWidth] = useState(188); // Tripo style ~188px
  const [assetFilter, setAssetFilter] = useState<string>('all');

  // React Query for System Stats
  const { data: polledSystemStats, refetch: queryRefetchSystemStats } = useQuery({
    queryKey: ['system-stats'],
    queryFn: async () => {
      const stats = await apiClient.getSystemStats();
      return stats as unknown as SystemStats;
    },
    refetchInterval: 20000, // Poll every 20s
    staleTime: 10000,
  });

  const refreshSystemStats = useCallback(async () => {
    await queryRefetchSystemStats();
  }, [queryRefetchSystemStats]);

  const [localAssets, setLocalAssets] = useState<ModelAsset[]>([]);

  // React Query for History
  const { data: historyAssets } = useQuery({
    queryKey: ['history-assets'],
    queryFn: async () => {
      const history = await apiClient.getHistory();
      return Object.entries(history).filter(([, h]) => h.status?.completed).map(([id, h], i) => ({
        id: id || `hist-${i}`,
        name: (h.prompt?.[1] as string)?.slice(0, 40) || 'Generated Model',
        category: 'generation' as const,
        thumbnail: '',
        source: { filename: '', subfolder: 'output', type: 'output', viewUrl: '' },
        meshType: 'custom' as const, faces: 0, vertices: 0, triangles: 0,
        statsAvailable: false, topology: 'Triangle' as const, format: 'GLB' as const,
        dateCreated: '', tags: ['Generated'], materials: [],
      })) as ModelAsset[];
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // React Query for Uploaded Assets
  const { data: uploadedAssets } = useQuery({
    queryKey: ['uploaded-assets'],
    queryFn: async () => {
      const res = await fetch('/api/v1/upload/assets');
      if (!res.ok) return [];
      const data = await res.json();
      return (data?.data?.models || data?.models || []).map((m: any) => {
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
      }) as ModelAsset[];
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const [assets, setAssets] = useState<ModelAsset[]>([]);

  // Merge assets
  useEffect(() => {
    const history = historyAssets || [];
    const uploaded = uploadedAssets || [];
    const local = localAssets;

    setAssets(() => {
      // Prioritize uploaded assets from backend/storage/models
      const all = [...uploaded, ...history, ...local];
      const seen = new Set();
      const filtered = all.filter(a => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
      if ((!selectedAssetIdRef.current || !filtered.some(a => a.id === selectedAssetIdRef.current)) && filtered.length > 0) {
        setSelectedAssetId(filtered[0].id);
      }
      return filtered;
    });
  }, [historyAssets, uploadedAssets, localAssets]);

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const selectedAssetIdRef = useRef(selectedAssetId);
  const mainNavRef = useRef(mainNav);

  const [shadingMode, setShadingModeState] = useState<ShadingMode>('textured');
  const [showWireframe, setShowWireframeState] = useState(false);
  const [showGrid, setShowGridState] = useState(false);
  const [showBones, setShowBonesState] = useState(false);
  const [isTurntable, setIsTurntableState] = useState(appStore.viewer?.autoRotate ?? false);
  const [activeTransformTool, setActiveTransformTool] = useState<'select' | 'rotate' | 'pan' | 'frame'>('select');
  const [viewportResetTrigger, setViewportResetTrigger] = useState(0);

  const systemStats = useMemo(() => polledSystemStats || ({
    status: 'offline' as const, host: '/api/v1', gpu: 'Unavailable',
    vramUsedGb: null, vramTotalGb: null, ramUsedGb: null, ramTotalGb: null,
    torchVramUsedGb: null, torchVramTotalGb: null, gpuType: null, gpuIndex: null,
    pythonVersion: null, torchVersion: null, apiVersion: null,
    queueRunning: 0, queuePending: 0, activePromptId: null, activeNode: null, lastPingMs: 0,
  } as SystemStats), [polledSystemStats]);
  const systemStatsStatusRef = useRef(systemStats.status);

  useEffect(() => {
    if (polledSystemStats?.status === 'offline' && systemStatsStatusRef.current !== 'offline') {
      toast.warning('Backend is offline', {
        description: 'Unable to sync with the generation engine. Check your connection.',
      });
    }
    systemStatsStatusRef.current = systemStats.status;
  }, [polledSystemStats, systemStats.status]);

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
    generateTexture: true,
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
    modelId: '',
    maps: { albedo: true, normal: true, roughness: true, metallic: true, ao: true, height: false },
  });

  const [environmentSettings, setEnvironmentSettings] = useState<EnvironmentSettings>({
    ambientIntensity: 2.5,
    keyLightIntensity: 3.5,
    fillLightIntensity: 3.0,
    rimLightIntensity: 2.0,
    exposure: 2.0,
    gridVisible: false,
    gridColor: '#3d4252',
    backgroundColor: '#22242a',
    autoRotate: false,
    showAxes: false,
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

  useEffect(() => {
    const activeTaskRef = { current: activeTask };
    activeTaskRef.current = activeTask;

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
      toast.success('Process completed successfully', {
        description: activeTaskRef.current?.title || '3D Asset Generation finished',
      });
    };
    const onError = (data: unknown) => {
      const d = data as { exception_message?: string; message?: string };
      setIsExecuting(false);
      setExecutionProgress(0);
      setExecutionStep(d.exception_message || d.message || 'Error');
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: d.exception_message || 'Error' } : prev);
      toast.error('Process failed', {
        description: d.exception_message || d.message || 'An error occurred during execution',
      });
    };
    const off1 = apiClient.on('progress', onProgress);
    const off2 = apiClient.on('executing', onExecuting);
    const off3 = apiClient.on('executed', onExecuted);
    const off4 = apiClient.on('execution_error', onError);
    return () => { off1(); off2(); off3(); off4(); };
  }, []);

  const addAsset = useCallback((asset: ModelAsset) => {
    setLocalAssets(prev => [asset, ...prev]);
    setAssets(prev => [asset, ...prev]);
    setSelectedAssetId(asset.id);
  }, []);

  useEffect(() => {
    const task = activeTask;
    if (!task || task.status === 'completed' || task.status === 'failed' || task.status === 'interrupted') return;
    const jobId = task.id;
    const isBackendJob = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
    if (!isBackendJob) return;

    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/generation/${encodeURIComponent(jobId)}/status`, { cache: 'no-store' });
        if (!res.ok) throw await parseApiError(res);
        const data = await parseApiData<{
          status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
          progress?: number; stage?: string; message?: string; error_message?: string | null; result?: {
            model_url?: string; thumbnail_url?: string; polygon_count?: number; vertex_count?: number; file_size?: number;
          };
        }>(res);
        if (stopped) return;

        const progress = Math.max(0, Math.min(100, Number(data.progress ?? 0)));
        setExecutionProgress(progress);
        setExecutionStep(data.message || data.stage || 'Processing');

        if (data.status === 'completed') {
          setIsExecuting(false);
          setExecutionProgress(100);
          setExecutionStep('Completed');
          setActiveTask(prev => prev ? { ...prev, status: 'completed', progress: 100, currentStep: 'Completed' } : null);
          if (data.result?.model_url) {
            const result = data.result;
            const outputAsset: ModelAsset = {
              id: jobId,
              name: `Generated_${jobId.slice(0, 8)}`,
              category: 'generation',
              thumbnail: result.thumbnail_url || '',
              faces: result.polygon_count ?? 0,
              vertices: result.vertex_count ?? 0,
              triangles: result.polygon_count ?? 0,
              statsAvailable: (result.polygon_count ?? 0) > 0,
              source: { filename: `${jobId}.glb`, subfolder: 'generated', type: 'output', viewUrl: result.model_url },
              topology: 'Triangle',
              format: 'GLB',
              dateCreated: new Date().toISOString().split('T')[0],
              tags: ['AI Generated'],
              meshType: 'custom',
            };
            addAsset(outputAsset);
          }
          toast.success('Generation complete', { description: 'The backend produced a valid output and the model is ready.' });
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          const message = data.error_message || data.message || (data.status === 'cancelled' ? 'Generation cancelled' : 'Generation failed');
          setIsExecuting(false);
          setExecutionStep(message);
          setActiveTask(prev => prev ? { ...prev, status: data.status === 'cancelled' ? 'interrupted' : 'failed', currentStep: message, progress } : null);
          if (data.status === 'failed') toast.error('Generation failed', { description: message });
        }
      } catch (error) {
        if (stopped) return;
        // Do not mark a real backend job failed for one transient polling error.
        if (error instanceof Error) setExecutionStep(`Syncing job status… ${error.message}`);
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [activeTask, addAsset]);

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
    setLocalAssets(prev => [dup, ...prev]);
    setAssets(prev => [dup, ...prev]);
    setSelectedAssetId(dup.id);
  }, [assets]);

  const updateAssetProperties = useCallback((id: string, updates: Partial<ModelAsset>) => {
    setLocalAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  }, []);

  const updateMaterialConfig = useCallback((updates: Partial<MaterialConfig>) => {
    const asset = currentAssetRef.current;
    if (!asset) return;
    const cur = asset.materialConfig || { roughness: 0.5, metalness: 0.5, color: 'hsl(0, 0%, 50%)', wireframe: false, wireframeColor: 'hsl(0, 0%, 10%)', normalScale: 1.0, aoIntensity: 0.8, style: 'realistic' };
    updateAssetProperties(asset.id, { materialConfig: { ...cur, ...updates } });
  }, [updateAssetProperties]);

  const deleteAsset = useCallback(async (id: string) => {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;

    const isUploadedAsset = asset.source?.type === 'upload' || asset.tags?.includes('User-Upload') || asset.tags?.includes('Uploaded');
    if (isUploadedAsset && asset.source?.filename) {
      try {
        const res = await fetch(`/api/v1/upload/assets/${encodeURIComponent(asset.source.filename)}`, { method: 'DELETE' });
        if (!res.ok) throw await parseApiError(res);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete uploaded asset from backend';
        toast.error('Delete failed', { description: message });
        return;
      }
    }

    setLocalAssets(prev => prev.filter(a => a.id !== id));
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
  }, [assets]);

  const resetCamera = useCallback(() => {
    setViewportResetTrigger(prev => prev + 1);
  }, []);

  const fitToScreen = useCallback(() => setViewportResetTrigger(prev => prev + 1), []);

  const cancelExecution = useCallback(async () => {
    const jobId = activeTask?.id;
    if (!jobId) return;

    try {
      const res = await fetch(`/api/v1/generation/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
      if (!res.ok) throw await parseApiError(res);
      const data = await parseApiData<{ status?: string }>(res);
      if (data.status === 'cancelled') {
        setIsExecuting(false);
        setExecutionProgress(0);
        setExecutionStep('Execution cancelled');
        setActiveTask(prev => prev ? { ...prev, status: 'interrupted', currentStep: 'Execution cancelled' } : null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel generation job';
      setExecutionStep(message);
      toast.error('Cancel failed', { description: message });
    }
  }, [activeTask?.id]);

  const startTask = useCallback((type: ActiveTask['type'], title: string, promptId?: string) => {
    setIsExecuting(true);
    setExecutionProgress(0);
    setExecutionStep('Queued');
    setActiveTask({ id: promptId ?? `task-${type}-${Date.now()}`, type, title, startedAt: Date.now(), status: 'queued', progress: 0, currentStep: 'Queued' });
  }, []);

  const generateImageTo3D = useCallback(async (customImage?: string) => {
    const imageToUse = customImage ?? generationSettings.image;
    if (!imageToUse) {
      setExecutionStep('Please select or upload an image first');
      toast.error('Image required', { description: 'Select or upload a reference image to generate a 3D model.' });
      return;
    }
    startTask('image-to-3d', 'Image-to-3D generation');

    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'image-to-3d',
          provider: generationSettings.aiModel || undefined,
          reference_image_url: imageToUse,
          quality: generationSettings.meshQuality || 'high',
          generate_texture: generationSettings.generateTexture !== false,
          low_vram: Boolean(generationSettings.lowVram),
          vram_mode: generationSettings.lowVram ? 'low' : (generationSettings.vramMode || 'auto'),
          auto_optimize: generationSettings.autoOptimize,
          auto_optimize_settings: generationSettings.autoOptimizeSettings,
        }),
      });
      if (!res.ok) throw await parseApiError(res);
      const data = await parseApiData<{ job_id?: string; id?: string; status?: string }>(res);
      const jobId = data.job_id ?? data.id;
      if (!jobId) throw new Error('Backend did not return a generation job ID');
      setActiveTask(prev => prev ? { ...prev, id: jobId, inputImage: imageToUse, status: 'queued', currentStep: 'Queued on backend' } : prev);
      setExecutionStep('Generation queued on backend');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation submission failed';
      setIsExecuting(false);
      setExecutionStep(message);
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: message } : null);
      toast.error('Generation failed', { description: message });
    }
  }, [generationSettings.image, generationSettings.aiModel, generationSettings.meshQuality, generationSettings.lowVram, generationSettings.vramMode, generationSettings.autoOptimize, generationSettings.autoOptimizeSettings, startTask]);

  const generate3DModel = useCallback(async () => {
    return generateImageTo3D();
  }, [generateImageTo3D]);

  const runRemeshGeneration = useCallback(async () => {
    startTask('remesh', 'Remesh / topology optimization');
    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'remesh',
          quality: 'standard',
          reference_image_url: currentAsset?.source?.localUrl || currentAsset?.source?.viewUrl || undefined,
          remesh_settings: remeshSettings,
          generate_texture: false,
          auto_rig: false,
          workspace: 'remesh',
        }),
      });
      if (!res.ok) throw await parseApiError(res);
      const data = await parseApiData<{ job_id?: string; id?: string }>(res);
      const jobId = data.job_id ?? data.id;
      if (!jobId) throw new Error('Backend did not return a remesh job ID');
      setActiveTask(prev => prev ? { ...prev, id: jobId, status: 'queued', currentStep: 'Queued on backend' } : prev);
      setExecutionStep('Remesh queued on backend');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remesh submission failed';
      setIsExecuting(false);
      setExecutionStep(message);
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: message } : null);
      toast.error('Remesh failed', { description: message });
    }
  }, [remeshSettings, currentAsset, startTask]);

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
          provider: textureSettings.modelId || undefined,
          workspace: 'texture-generation',
          reference_image_url: textureSettings.referenceImage || currentAsset?.source?.localUrl || currentAsset?.source?.viewUrl || undefined,
        }),
      });
      if (!res.ok) throw await parseApiError(res);
      const data = await parseApiData<{ job_id?: string; id?: string }>(res);
      const jobId = data.job_id ?? data.id;
      if (!jobId) throw new Error('Backend did not return a texture job ID');
      setActiveTask(prev => prev ? { ...prev, id: jobId, status: 'queued', currentStep: 'Queued on backend' } : prev);
      setExecutionStep('Texture generation queued on backend');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Texture generation submission failed';
      setIsExecuting(false);
      setExecutionStep(message);
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: message } : null);
      toast.error('Texture generation failed', { description: message });
    }
  }, [textureSettings, currentAsset, startTask]);

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
      const data = await parseApiData<{ job_id?: string; id?: string }>(res);
      const jobId = data.job_id ?? data.id;
      if (!jobId) throw new Error('Backend did not return a workflow job ID');
      setActiveTask(prev => prev ? { ...prev, id: jobId, status: 'queued', currentStep: 'Queued on backend' } : prev);
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
    if (pathname !== route) {
      // Use replaceState instead of router.push to avoid full page remount.
      // This keeps the MeshViewer mounted while updating the URL.
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', route);
      }
    }
  }, [pathname, setMainNav, setActiveTool, setIsLeftPanelOpen]);

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
    leftPanelWidth, setLeftPanelWidth,
    rightPanelWidth, setRightPanelWidth,
    toolPanelOpen: isLeftPanelOpen, setToolPanelOpen: setIsLeftPanelOpen,
    isRightPanelOpen, setIsRightPanelOpen,
    rightPanelOpen: isRightPanelOpen, setRightPanelOpen: setIsRightPanelOpen,
    navigateToTool, navigateToMain, navigateToMainNav: navigateToMain,
  }), [activeTool, setActiveTool, mainNav, setMainNav,
    activeRightTab, setActiveRightTab,
    isLeftPanelOpen, setIsLeftPanelOpen,
    leftPanelWidth, setLeftPanelWidth,
    rightPanelWidth, setRightPanelWidth,
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
