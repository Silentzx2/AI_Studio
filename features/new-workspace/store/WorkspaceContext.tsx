import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useViewerStore, loadModelInViewer } from '@/stores/useViewerStore';
import { prefetchGLB } from '../lib/glbCache';
import { shadingModeToPreset, presetToShadingMode } from '@/lib/storeAdapter';
import { diagnoseJobError } from '@/lib/jobDiagnostics';
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
  generate3DModel: (forcedMode?: 'image-to-3d' | 'text-to-3d') => Promise<void>;
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
  const queryClient = useQueryClient();
  const appStore = useAppStore();
  const viewerStore = useViewerStore();
  const router = useRouter();
  const pathname = usePathname();

  const [activeTool, setActiveToolState] = useState<ToolType>('model');
  const [mainNav, setMainNavState] = useState<MainNavRoute>('workspace');
  const [activeRightTab, setActiveRightTab] = useState<'assets' | 'property' | 'properties' | 'prompt'>('properties');
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [assetFilter, setAssetFilter] = useState<string>('all');
  const [deletedAssetIds, setDeletedAssetIds] = useState<Set<string>>(() => new Set());

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
      return Object.entries(history).filter(([, h]) => h.status?.completed).map(([id, h], i) => {
        const rawPrompt = (h.prompt?.[1] as string)?.trim();
        const promptName = rawPrompt && !rawPrompt.startsWith('workflow:') && rawPrompt !== 'generate'
          ? (rawPrompt.charAt(0).toUpperCase() + rawPrompt.slice(1)).slice(0, 40)
          : null;
        const name = promptName || `Model_${id.slice(0, 8)}`;
        const outputs = (h.outputs || {}) as Record<string, any>;
        const outputUrl = (outputs.glb as string) || (outputs.model_url as string) || `/static/models/${id}/model.glb`;
        return {
          id: id || `hist-${i}`,
          name,
          category: 'generation' as const,
          thumbnail: (outputs.thumbnail as string) || (outputs.thumbnail_url as string) || '',
          source: { filename: `${id}.glb`, subfolder: 'generated', type: 'output', viewUrl: outputUrl },
          meshType: 'custom' as const, faces: 0, vertices: 0, triangles: 0,
          statsAvailable: false, topology: 'Triangle' as const, format: 'GLB' as const,
          dateCreated: '', tags: ['AI Generated'], materials: [],
        };
      }) as ModelAsset[];
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
        const cleanName = m.name?.replace(/^[0-9]+_/, '')?.replace(/\.[^.]+$/, '') || m.filename?.replace(/\.[^.]+$/, '') || '3D Model';
        const formattedName = cleanName === 'model' || cleanName === 'generate'
          ? `Model_${(m.id || m.filename).slice(0, 8)}`
          : cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        return {
          id: m.id || m.filename,
          name: formattedName,
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
      // Prioritize local session assets, then uploaded, then history
      const all = [...local, ...uploaded, ...history];
      const seenIds = new Set<string>();
      const seenFilenames = new Set<string>();
      const seenUrls = new Set<string>();

      const filtered = all.filter(a => {
        if (!a || !a.id) return false;
        if (deletedAssetIds.has(a.id)) return false;
        if (seenIds.has(a.id)) return false;

        const fn = a.source?.filename?.trim();
        if (fn && fn !== 'model.glb' && seenFilenames.has(fn)) return false;

        const rawUrl = a.source?.viewUrl || a.source?.localUrl;
        const normUrl = rawUrl?.replace(/^\/+/, '')?.toLowerCase();
        if (normUrl && seenUrls.has(normUrl)) return false;

        seenIds.add(a.id);
        if (fn && fn !== 'model.glb') seenFilenames.add(fn);
        if (normUrl) seenUrls.add(normUrl);
        return true;
      });

      if ((!selectedAssetIdRef.current || !filtered.some(a => a.id === selectedAssetIdRef.current)) && filtered.length > 0) {
        setSelectedAssetId(filtered[0].id);
      } else if (filtered.length === 0) {
        setSelectedAssetId(null);
      }
      return filtered;
    });
  }, [historyAssets, uploadedAssets, localAssets, deletedAssetIds]);

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
  const activeTaskRef = useRef<ActiveTask | null>(activeTask);
  activeTaskRef.current = activeTask;

  const dismissActiveTask = useCallback(() => setActiveTask(null), []);

  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>({
    mode: 'image-to-3d',
    image: null,
    aiModel: '', meshQuality: 'high', textureQuality: 'high',
    quadTopology: false, topologyMode: 'adaptive', seed: 42891, guidanceScale: 7.5, removeBackground: true,
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
    setLocalAssets(prev => {
      const idx = prev.findIndex(a =>
        a.id === asset.id ||
        (asset.source?.filename && a.source?.filename && asset.source.filename !== 'model.glb' && a.source.filename === asset.source.filename) ||
        (asset.source?.viewUrl && a.source?.viewUrl && asset.source.viewUrl === a.source.viewUrl)
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...asset };
        return copy;
      }
      return [asset, ...prev];
    });
    setAssets(prev => {
      const idx = prev.findIndex(a =>
        a.id === asset.id ||
        (asset.source?.filename && a.source?.filename && asset.source.filename !== 'model.glb' && a.source.filename === asset.source.filename) ||
        (asset.source?.viewUrl && a.source?.viewUrl && asset.source.viewUrl === a.source.viewUrl)
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...asset };
        return copy;
      }
      return [asset, ...prev];
    });
    setSelectedAssetId(asset.id);
    setViewportResetTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    const task = activeTaskRef.current;
    if (!task || task.status === 'completed' || task.status === 'failed' || task.status === 'interrupted') return;
    const jobId = task.id;
    const isBackendJob = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId);
    if (!isBackendJob) return;

    let stopped = false;
    let timerId: number | null = null;

    const scheduleNext = (intervalMs: number) => {
      if (stopped) return;
      if (timerId) window.clearTimeout(timerId);
      timerId = window.setTimeout(() => void poll(), intervalMs);
    };

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
            const currentLatestTask = activeTaskRef.current || task;
            const result = data.result;
            const modelUrl = result.model_url as string;
            const promptTitle = currentLatestTask.title && currentLatestTask.title !== 'Image-to-3D generation' && currentLatestTask.title !== 'generate' ? currentLatestTask.title : null;
            const rawName = promptTitle || currentLatestTask.inputImageName || (currentLatestTask.inputImage ? currentLatestTask.inputImage.split('/').pop()?.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') : null) || `Model_${jobId.slice(0, 6)}`;
            const cleanName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

            // Pre-fetch the model arrayBuffer immediately into in-memory cache
            void prefetchGLB(modelUrl);

            const qaReport = (result as any).qa_report;
            const qaScore = qaReport?.game_ready_score ?? (qaReport?.score ? Math.round(qaReport.score * 100) : undefined);
            const qaStatus = qaReport?.status ?? (qaScore !== undefined ? (qaScore >= 80 ? 'pass' : qaScore >= 50 ? 'warn' : 'fail') : undefined);
            const qaWarnings = qaReport?.warnings ?? [];

            const outputAsset: ModelAsset = {
              id: jobId,
              name: cleanName,
              category: 'generation',
              thumbnail: result.thumbnail_url || '',
              faces: result.polygon_count ?? 0,
              vertices: result.vertex_count ?? 0,
              triangles: result.polygon_count ?? 0,
              statsAvailable: (result.polygon_count ?? 0) > 0,
              source: { filename: `${jobId}.glb`, subfolder: 'generated', type: 'output', viewUrl: modelUrl },
              topology: 'Triangle',
              format: 'GLB',
              dateCreated: new Date().toISOString().split('T')[0],
              tags: ['AI Generated'],
              meshType: 'custom',
              artifacts: {
                source: (result as any).source_model_url,
                gameReady: (result as any).game_ready_url,
                lods: (result as any).lod_urls,
                collision: (result as any).collision_url,
                qaReport,
                pbrMaps: (result as any).pbr_maps,
              },
              qaScore,
              qaStatus,
              qaWarnings,
            };
            addAsset(outputAsset);
            setSelectedAssetId(outputAsset.id);
            setViewportResetTrigger(prev => prev + 1);
            loadModelInViewer(modelUrl, cleanName, outputAsset as any);
          }
          toast.success('Generation complete', { description: 'The 3D model is ready and loaded in the viewer.' });
          return;
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          const currentLatestTask = activeTaskRef.current || task;
          const message = data.error_message || data.message || (data.status === 'cancelled' ? 'Generation cancelled' : 'Generation failed');
          setIsExecuting(false);
          setExecutionStep(message);
          const diagnostic = data.status === 'failed' ? diagnoseJobError({
            id: jobId,
            status: 'failed',
            error: message,
            error_message: message,
            provider: currentLatestTask.provider || '',
          } as any) : null;
          setActiveTask(prev => prev ? {
            ...prev,
            status: data.status === 'cancelled' ? 'interrupted' : 'failed',
            currentStep: message,
            errorMessage: message,
            diagnostic,
            progress
          } : null);
          if (data.status === 'failed') toast.error('Generation failed', { description: message });
          return;
        }

        // Adaptive polling: 500ms when in active generation/texturing, 1000ms otherwise
        const nextInterval = (progress >= 50 || data.stage === 'generating' || data.stage === 'texturing' || data.stage === 'optimizing') ? 500 : 1000;
        scheduleNext(nextInterval);
      } catch (error) {
        if (stopped) return;
        if (error instanceof Error) setExecutionStep(`Syncing job status… ${error.message}`);
        scheduleNext(1500);
      }
    };

    void poll();
    return () => {
      stopped = true;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [activeTask?.id, activeTask?.status, addAsset]);

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

    // Immediately mark as deleted locally so UI updates instantly
    setDeletedAssetIds(prev => new Set(prev).add(id));
    setLocalAssets(prev => prev.filter(a => a.id !== id));
    setAssets(prev => {
      const next = prev.filter(a => a.id !== id);
      if (id === selectedAssetIdRef.current) {
        setSelectedAssetId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });

    const isJob = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
      asset.category === 'generation' ||
      asset.tags?.includes('AI Generated');

    try {
      if (isJob) {
        await fetch(`/api/v1/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
      }
      if (asset.source?.filename) {
        await fetch(`/api/v1/upload/assets/${encodeURIComponent(asset.source.filename)}`, { method: 'DELETE' });
      }
    } catch (err) {
      console.warn('Backend delete request failed:', err);
    }

    // Invalidate React Query caches so refetch does not bring back stale entries
    queryClient.invalidateQueries({ queryKey: ['uploaded-assets'] });
    queryClient.invalidateQueries({ queryKey: ['history-assets'] });
  }, [assets, queryClient]);

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

  const startTask = useCallback((type: ActiveTask['type'], title: string, promptId?: string, provider?: string, inputImage?: string, inputImageName?: string) => {
    setIsExecuting(true);
    setExecutionProgress(0);
    setExecutionStep('Queued');
    setActiveTask({
      id: promptId ?? `task-${type}-${Date.now()}`,
      type,
      title,
      startedAt: Date.now(),
      status: 'queued',
      progress: 0,
      currentStep: 'Queued',
      provider,
      inputImage,
      inputImageName,
    });
  }, []);

  const generateImageTo3D = useCallback(async (customImage?: string) => {
    const imageToUse = customImage ?? generationSettings.image;
    if (!imageToUse) {
      setExecutionStep('Please select or upload an image first');
      toast.error('Image required', { description: 'Select or upload a reference image to generate a 3D model.' });
      return;
    }
    const modelPrompt = generationSettings.prompt || generationSettings.imageName || '3D Model';
    // ponytail: derive a human-readable name from the reference image filename so
    // the saved model is labelled by its source image, not "Model_<uuid>".
    const imageFileName = generationSettings.imageName
      || (imageToUse ? decodeURIComponent(imageToUse.split('/').pop()?.replace(/\?.*$/, '') || '') : '')
      || modelPrompt;
    startTask('image-to-3d', modelPrompt, undefined, generationSettings.aiModel, imageToUse, imageFileName);

    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'image-to-3d',
          provider: generationSettings.aiModel || undefined,
          reference_image_url: imageToUse,
          prompt: modelPrompt,
          quality: generationSettings.meshQuality || 'high',
          generate_texture: generationSettings.generateTexture !== false,
          low_vram: Boolean(generationSettings.lowVram),
          vram_mode: generationSettings.lowVram ? 'low' : (generationSettings.vramMode || 'auto'),
          auto_optimize: Boolean(generationSettings.autoOptimize),
          auto_optimize_settings: {
            target_polycount: generationSettings.autoOptimizeSettings?.targetPolycount ?? 30000,
            fix_uvs: generationSettings.autoOptimizeSettings?.fixUVs ?? true,
            preserve_details: generationSettings.autoOptimizeSettings?.preserveDetails ?? 75,
            targetPolycount: generationSettings.autoOptimizeSettings?.targetPolycount ?? 30000,
            fixUVs: generationSettings.autoOptimizeSettings?.fixUVs ?? true,
            preserveDetails: generationSettings.autoOptimizeSettings?.preserveDetails ?? 75,
          },
          game_ready: Boolean(generationSettings.gameReady),
          target_platform: generationSettings.targetPlatform || 'generic',
          generate_lod: Boolean(generationSettings.generateLOD),
          lod_preset: generationSettings.lodPreset || 'medium',
          lod_count: generationSettings.lodCount || 3,
          generate_collision: Boolean(generationSettings.generateCollision),
          generate_pbr: generationSettings.generatePBR !== false,
          enable_mesh_repair: true,
          compress_output: true,
          preserve_details: generationSettings.preserveDetails ?? generationSettings.autoOptimizeSettings?.preserveDetails ?? 75,
          repair_uvs: generationSettings.repairUVs !== false,
          topology_mode: generationSettings.topologyMode || (generationSettings.quadTopology ? 'quad' : 'adaptive'),
        }),
      });
      if (!res.ok) throw await parseApiError(res);
      const data = await parseApiData<{ job_id?: string; id?: string; status?: string }>(res);
      const jobId = data.job_id ?? data.id;
      if (!jobId) throw new Error('Backend did not return a generation job ID');
      setActiveTask(prev => prev ? { ...prev, id: jobId, inputImage: imageToUse, inputImageName: modelPrompt, status: 'queued', currentStep: 'Queued on backend' } : prev);
      setExecutionStep('Generation queued on backend');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation submission failed';
      setIsExecuting(false);
      setExecutionStep(message);
      const diagnostic = diagnoseJobError({
        id: 'submit-error',
        status: 'failed',
        error: message,
        error_message: message,
        provider: generationSettings.aiModel || '',
      } as any);
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: message, errorMessage: message, diagnostic } : null);
      toast.error('Generation failed', { description: message });
    }
  }, [
    generationSettings.image,
    generationSettings.aiModel,
    generationSettings.meshQuality,
    generationSettings.topologyMode,
    generationSettings.quadTopology,
    generationSettings.lowVram,
    generationSettings.vramMode,
    generationSettings.autoOptimize,
    generationSettings.autoOptimizeSettings,
    generationSettings.generateTexture,
    generationSettings.gameReady,
    generationSettings.targetPlatform,
    generationSettings.generateLOD,
    generationSettings.lodPreset,
    generationSettings.lodCount,
    generationSettings.generateCollision,
    generationSettings.generatePBR,
    generationSettings.preserveDetails,
    generationSettings.repairUVs,
    startTask,
  ]);

  const generate3DModel = useCallback(async (forcedMode?: 'image-to-3d' | 'text-to-3d') => {
    const isTextMode = forcedMode === 'text-to-3d' || (!generationSettings.image && Boolean(generationSettings.prompt?.trim()));
    if (isTextMode) {
      const modelPrompt = generationSettings.prompt?.trim();
      if (!modelPrompt) {
        setExecutionStep('Please enter a text prompt first');
        toast.error('Prompt required', { description: 'Please enter a text prompt to generate a 3D model.' });
        return;
      }
      startTask('text-to-3d', modelPrompt, undefined, generationSettings.aiModel, undefined, modelPrompt);

      try {
        const res = await fetch('/api/v1/generation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'text-to-3d',
            provider: generationSettings.aiModel || undefined,
            prompt: modelPrompt,
            quality: generationSettings.meshQuality || 'high',
            generate_texture: generationSettings.generateTexture !== false,
            low_vram: Boolean(generationSettings.lowVram),
            vram_mode: generationSettings.lowVram ? 'low' : (generationSettings.vramMode || 'auto'),
            auto_optimize: Boolean(generationSettings.autoOptimize),
            auto_optimize_settings: {
              target_polycount: generationSettings.autoOptimizeSettings?.targetPolycount ?? 30000,
              fix_uvs: generationSettings.autoOptimizeSettings?.fixUVs ?? true,
              preserve_details: generationSettings.autoOptimizeSettings?.preserveDetails ?? 75,
              targetPolycount: generationSettings.autoOptimizeSettings?.targetPolycount ?? 30000,
              fixUVs: generationSettings.autoOptimizeSettings?.fixUVs ?? true,
              preserveDetails: generationSettings.autoOptimizeSettings?.preserveDetails ?? 75,
            },
            game_ready: Boolean(generationSettings.gameReady),
            target_platform: generationSettings.targetPlatform || 'generic',
            generate_lod: Boolean(generationSettings.generateLOD),
            lod_preset: generationSettings.lodPreset || 'medium',
            lod_count: generationSettings.lodCount || 3,
            generate_collision: Boolean(generationSettings.generateCollision),
            generate_pbr: generationSettings.generatePBR !== false,
            enable_mesh_repair: true,
            compress_output: true,
            preserve_details: generationSettings.preserveDetails ?? generationSettings.autoOptimizeSettings?.preserveDetails ?? 75,
            repair_uvs: generationSettings.repairUVs !== false,
            topology_mode: generationSettings.topologyMode || (generationSettings.quadTopology ? 'quad' : 'adaptive'),
          }),
        });
        if (!res.ok) throw await parseApiError(res);
        const data = await parseApiData<{ job_id?: string; id?: string; status?: string }>(res);
        const jobId = data.job_id ?? data.id;
        if (!jobId) throw new Error('Backend did not return a generation job ID');
        setActiveTask(prev => prev ? { ...prev, id: jobId, inputImageName: modelPrompt, status: 'queued', currentStep: 'Queued on backend' } : prev);
        setExecutionStep('Generation queued on backend');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Generation submission failed';
        setIsExecuting(false);
        setExecutionStep(message);
        const diagnostic = diagnoseJobError({
          id: 'submit-error',
          status: 'failed',
          error: message,
          error_message: message,
          provider: generationSettings.aiModel || '',
        } as any);
        setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: message, errorMessage: message, diagnostic } : null);
        toast.error('Generation failed', { description: message });
      }
      return;
    }
    return generateImageTo3D();
  }, [
    generationSettings.prompt,
    generationSettings.image,
    generationSettings.aiModel,
    generationSettings.meshQuality,
    generationSettings.topologyMode,
    generationSettings.quadTopology,
    generationSettings.lowVram,
    generationSettings.vramMode,
    generationSettings.autoOptimize,
    generationSettings.autoOptimizeSettings,
    generationSettings.generateTexture,
    generationSettings.gameReady,
    generationSettings.targetPlatform,
    generationSettings.generateLOD,
    generationSettings.lodPreset,
    generationSettings.lodCount,
    generationSettings.generateCollision,
    generationSettings.generatePBR,
    generationSettings.preserveDetails,
    generationSettings.repairUVs,
    startTask,
    generateImageTo3D,
  ]);

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
          source_mesh_url: currentAsset?.source?.localUrl || currentAsset?.source?.viewUrl || undefined,
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
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: message, errorMessage: message } : null);
      toast.error('Remesh failed', { description: message });
    }
  }, [remeshSettings, currentAsset, startTask]);

  const runTextureGeneration = useCallback(async () => {
    startTask('texture', 'Texture generation', undefined, textureSettings.modelId);
    try {
      const sourceMeshUrl = currentAsset?.source?.localUrl || currentAsset?.source?.viewUrl || undefined;
      const refImageUrl = textureSettings.referenceImage || undefined;
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
          reference_image_url: refImageUrl || sourceMeshUrl,
          source_mesh_url: sourceMeshUrl,
          low_vram: Boolean(textureSettings.lowVram),
          vram_mode: textureSettings.lowVram ? 'low' : 'auto',
          generate_texture: true,
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
      const diagnostic = diagnoseJobError({
        id: 'submit-error',
        status: 'failed',
        error: message,
        error_message: message,
        provider: textureSettings.modelId || '',
      } as any);
      setActiveTask(prev => prev ? { ...prev, status: 'failed', currentStep: message, errorMessage: message, diagnostic } : null);
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
