import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useAppStore } from '@/stores/useAppStore';
import type { GenerationJob, GenerationConfig, GenerationMode, QualityPreset, RecentPrompt, UploadedImage, LogEntry } from '@/types';

interface GenerationState {
  mode: GenerationMode;
  prompt: string;
  negativePrompt: string;
  quality: QualityPreset;
  generateTexture: boolean;
  autoRig: boolean;
  uploadedImage: UploadedImage | null;
  stylePreset: string;
  selectedModel: string;
  steps: number;
  cfgScale: number;
  seed: string;
  currentJob: GenerationJob | null;
  jobHistory: GenerationJob[];
  recentPrompts: RecentPrompt[];
  loadingError: string | null;
  retryCount: number;
  isLoadingHistory: boolean;

  setMode: (mode: GenerationMode) => void;
  setPrompt: (prompt: string) => void;
  setNegativePrompt: (prompt: string) => void;
  setQuality: (quality: QualityPreset) => void;
  setGenerateTexture: (v: boolean) => void;
  setAutoRig: (v: boolean) => void;
  setUploadedImage: (img: UploadedImage | null) => void;
  setStylePreset: (s: string) => void;
  setSelectedModel: (m: string) => void;
  setSteps: (s: number) => void;
  setCfgScale: (c: number) => void;
  setSeed: (s: string) => void;
  setCurrentJob: (job: GenerationJob | null) => void;
  updateJobProgress: (jobId: string, progress: number, status: string) => void;
  addLogEntry: (jobId: string, message: string, level: LogEntry['level']) => void;
  cancelJob: () => void;
  addRecentPrompt: (prompt: RecentPrompt) => void;
  getConfig: () => GenerationConfig;
  reset: () => void;
  setLoadingError: (error: string | null) => void;
  setRetryCount: (count: number) => void;
  setIsLoadingHistory: (v: boolean) => void;
  loadHistory: () => Promise<void>;
}

export const useGenerationStore = create<GenerationState>()(
  subscribeWithSelector((set, get) => ({
    get mode() { return useAppStore.getState().mode; },
    get prompt() { return useAppStore.getState().prompt; },
    get negativePrompt() { return useAppStore.getState().negativePrompt; },
    get quality() { return useAppStore.getState().quality; },
    get generateTexture() { return useAppStore.getState().generateTexture; },
    get autoRig() { return useAppStore.getState().autoRig; },
    get uploadedImage() { return useAppStore.getState().uploadedImage; },
    get stylePreset() { return useAppStore.getState().stylePreset; },
    get selectedModel() { return useAppStore.getState().selectedModel; },
    get steps() { return useAppStore.getState().steps; },
    get cfgScale() { return useAppStore.getState().cfgScale; },
    get seed() { return useAppStore.getState().seed; },
    get currentJob() { return useAppStore.getState().currentJob; },
    get jobHistory() { return useAppStore.getState().jobHistory; },
    get recentPrompts() { return useAppStore.getState().recentPrompts; },
    get loadingError() { return useAppStore.getState().loadingError; },
    get retryCount() { return useAppStore.getState().retryCount; },
    get isLoadingHistory() { return useAppStore.getState().isLoadingHistory; },

    setMode: (mode) => useAppStore.setState({ mode }),
    setPrompt: (prompt) => useAppStore.setState({ prompt }),
    setNegativePrompt: (negativePrompt) => useAppStore.setState({ negativePrompt }),
    setQuality: (quality) => useAppStore.setState({ quality }),
    setGenerateTexture: (generateTexture) => useAppStore.setState({ generateTexture }),
    setAutoRig: (autoRig) => useAppStore.setState({ autoRig }),
    setUploadedImage: (uploadedImage) => useAppStore.setState({ uploadedImage }),
    setStylePreset: (stylePreset) => useAppStore.setState({ stylePreset }),
    setSelectedModel: (selectedModel) => useAppStore.setState({ selectedModel }),
    setSteps: (steps) => useAppStore.setState({ steps }),
    setCfgScale: (cfgScale) => useAppStore.setState({ cfgScale }),
    setSeed: (seed) => useAppStore.setState({ seed }),
    setCurrentJob: (currentJob) => useAppStore.setState({ currentJob }),
    updateJobProgress: (jobId, progress, status) =>
      useAppStore.setState((s) => {
        if (!s.currentJob || s.currentJob.id !== jobId) return {};
        return { currentJob: { ...s.currentJob, progress, status: status as GenerationJob['status'], updatedAt: new Date() } };
      }),
    addLogEntry: (jobId, message, level) =>
      useAppStore.setState((s) => {
        if (!s.currentJob || s.currentJob.id !== jobId) return {};
        const entry: LogEntry = { id: Math.random().toString(36).slice(2), timestamp: new Date(), level, message };
        return { currentJob: { ...s.currentJob, logs: [...s.currentJob.logs, entry] } };
      }),
    cancelJob: () =>
      useAppStore.setState((s) => {
        if (!s.currentJob) return {};
        return { currentJob: { ...s.currentJob, status: 'cancelled', updatedAt: new Date() } };
      }),
    addRecentPrompt: (prompt) =>
      useAppStore.setState((s) => ({ recentPrompts: [prompt, ...s.recentPrompts].slice(0, 10) })),
    getConfig: () => {
      const s = useAppStore.getState();
      return {
        mode: s.mode,
        prompt: s.prompt,
        negativePrompt: s.negativePrompt || undefined,
        quality: s.quality,
        generateTexture: s.generateTexture,
        autoRig: s.autoRig,
        referenceImage: s.uploadedImage?.preview,
        stylePreset: s.stylePreset,
        model: s.selectedModel || undefined,
        steps: s.steps,
        cfgScale: s.cfgScale,
        seed: s.seed || undefined,
      };
    },
    reset: () =>
      useAppStore.setState({
        mode: 'text-to-3d',
        prompt: '',
        negativePrompt: '',
        quality: 'standard',
        generateTexture: true,
        autoRig: false,
        uploadedImage: null,
        stylePreset: 'Realistic',
        selectedModel: '',
        steps: 30,
        cfgScale: 7.5,
        seed: '',
        currentJob: null,
      }),
    setLoadingError: (error) => useAppStore.setState({ loadingError: error }),
    setRetryCount: (count) => useAppStore.setState({ retryCount: count }),
    setIsLoadingHistory: (v) => useAppStore.setState({ isLoadingHistory: v }),
    loadHistory: async () => {
      useAppStore.setState({ isLoadingHistory: true, loadingError: null });
      try {
        const res = await fetch('/api/v1/generation/history?limit=50&offset=0');
        if (!res.ok) throw new Error(`Failed to load history: ${res.status}`);
        
        const json = await res.json();
        const rawJobs = json?.data?.jobs ?? json?.jobs ?? json?.history ?? [];
        
        // Normalize backend jobs to match GenerationJob type expectations
        const normalizedJobs = (rawJobs as any[]).map(job => {
          const config = job.config || {
            prompt: job.prompt || 'No Prompt',
            mode: job.mode || 'text-to-3d',
            quality: job.quality || 'standard',
            generateTexture: job.generate_texture ?? job.generateTexture ?? true,
            autoRig: job.auto_rig ?? job.autoRig ?? false,
          };
          
          return {
            ...job,
            config,
            prompt: config.prompt,
            createdAt: job.created_at ? new Date(job.created_at) : new Date(),
            updatedAt: job.updated_at ? new Date(job.updated_at) : new Date(),
            result: job.result || {
              model_url: job.model_url,
              thumbnail_url: job.thumbnail_url,
              has_rig: job.has_rig || false,
            }
          };
        });

        useAppStore.setState({ jobHistory: normalizedJobs, isLoadingHistory: false });
      } catch (error) {
        console.error('Error loading history:', error);
        useAppStore.setState({
          isLoadingHistory: false,
          loadingError: error instanceof Error ? error.message : 'Failed to load history',
          jobHistory: [],
        });
      }
    },
    refreshHistory: async () => {
      return get().loadHistory();
    },
  }))
);

// Mirror app store data into this proxy store so subscribeWithSelector
// subscribers actually re-render (getters alone never notify listeners).
useAppStore.subscribe((state) => {
  useGenerationStore.setState({
    mode: state.mode,
    prompt: state.prompt,
    negativePrompt: state.negativePrompt,
    quality: state.quality,
    generateTexture: state.generateTexture,
    autoRig: state.autoRig,
    uploadedImage: state.uploadedImage,
    stylePreset: state.stylePreset,
    selectedModel: state.selectedModel,
    steps: state.steps,
    cfgScale: state.cfgScale,
    seed: state.seed,
    currentJob: state.currentJob,
    jobHistory: state.jobHistory,
    recentPrompts: state.recentPrompts,
    loadingError: state.loadingError,
    retryCount: state.retryCount,
    isLoadingHistory: state.isLoadingHistory,
  });
});