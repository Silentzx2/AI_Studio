import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
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

const DEFAULT_STATE = {
  mode: 'text-to-3d' as GenerationMode,
  prompt: '',
  negativePrompt: '',
  quality: 'standard' as QualityPreset,
  generateTexture: true,
  autoRig: false,
  uploadedImage: null,
  stylePreset: 'Realistic',
  selectedModel: '',
  steps: 30,
  cfgScale: 7.5,
  seed: '',
  currentJob: null,
  jobHistory: [],
  recentPrompts: [
    { id: '1', text: 'A medieval stone castle tower with moss-covered walls', mode: 'text-to-3d' as GenerationMode, createdAt: new Date() },
    { id: '2', text: 'Futuristic sci-fi spaceship with glowing engines', mode: 'text-to-3d' as GenerationMode, createdAt: new Date() },
    { id: '3', text: 'Cute cartoon robot with big expressive eyes', mode: 'text-to-3d' as GenerationMode, createdAt: new Date() },
  ],
  loadingError: null,
  retryCount: 0,
  isLoadingHistory: false,
};

export const useGenerationStore = create<GenerationState>()(
  subscribeWithSelector((set, get) => ({
    ...DEFAULT_STATE,
    setMode: (mode) => set({ mode }),
    setPrompt: (prompt) => set({ prompt }),
    setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
    setQuality: (quality) => set({ quality }),
    setGenerateTexture: (generateTexture) => set({ generateTexture }),
    setAutoRig: (autoRig) => set({ autoRig }),
    setUploadedImage: (uploadedImage) => set({ uploadedImage }),
    setStylePreset: (stylePreset) => set({ stylePreset }),
    setSelectedModel: (selectedModel) => set({ selectedModel }),
    setSteps: (steps) => set({ steps }),
    setCfgScale: (cfgScale) => set({ cfgScale }),
    setSeed: (seed) => set({ seed }),
    setCurrentJob: (currentJob) => set({ currentJob }),
    updateJobProgress: (jobId, progress, status) =>
      set((s) => {
        if (!s.currentJob || s.currentJob.id !== jobId) return {};
        return { currentJob: { ...s.currentJob, progress, status: status as GenerationJob['status'], updatedAt: new Date() } };
      }),
    addLogEntry: (jobId, message, level) =>
      set((s) => {
        if (!s.currentJob || s.currentJob.id !== jobId) return {};
        const entry: LogEntry = { id: Math.random().toString(36).slice(2), timestamp: new Date(), level, message };
        return { currentJob: { ...s.currentJob, logs: [...s.currentJob.logs, entry] } };
      }),
    cancelJob: () =>
      set((s) => {
        if (!s.currentJob) return {};
        return { currentJob: { ...s.currentJob, status: 'cancelled', updatedAt: new Date() } };
      }),
    addRecentPrompt: (prompt) => set((s) => ({ recentPrompts: [prompt, ...s.recentPrompts].slice(0, 10) })),
    getConfig: () => {
      const s = get();
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
    reset: () => set(DEFAULT_STATE),
    setLoadingError: (error) => set({ loadingError: error }),
    setRetryCount: (count) => set({ retryCount: count }),
    setIsLoadingHistory: (v) => set({ isLoadingHistory: v }),
    loadHistory: async () => {
      set({ isLoadingHistory: true, loadingError: null });
      try {
        const res = await fetch('/api/v1/jobs?limit=20');
        if (!res.ok) {
          throw new Error(`Failed to load history: ${res.status}`);
        }
        const json = await res.json();
        const jobs = json?.data?.jobs ?? [];
        set({ jobHistory: jobs, isLoadingHistory: false });
      } catch (error) {
        console.error('Error loading history:', error);
        set({ 
          isLoadingHistory: false, 
          loadingError: error instanceof Error ? error.message : 'Failed to load history' 
        });
        set({ jobHistory: [] });
      }
    },
  }))
);