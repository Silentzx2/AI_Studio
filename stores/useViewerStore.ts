import { create } from 'zustand';
import type { AssetItem } from '@/3D-SPACE/AssetPanel';

export type ShadingPreset = 'default' | 'clay' | 'metallic' | 'wireframe' | 'normal' | 'gold' | 'cyberpunk' | 'uv';

export interface ModelMeshStats {
  vertices: number;
  triangles: number;
  dimensions: { x: number; y: number; z: number };
}

export interface RigInfo {
  boneCount: number;
  jointHierarchy: string;
  rigWeightMap: 'Complete' | 'Partial' | 'None' | string;
}

export interface AnimationInfo {
  preset: string;
  speed: number;
  isPlaying: boolean;
  duration: number;
  fps?: number;
  frameCount?: number;
}

export type ContextTabType = 'assets' | 'inspector' | 'materials' | 'rig' | 'animation' | 'jobs';

/**
 * Global persistent 3D workspace viewer store.
 * Holds canonical loaded model, viewport camera, mesh statistics,
 * material shading state, rigging metadata, and context panel tab.
 */
interface ViewerState {
  loadedModelUrl: string | null;
  loadedModelName: string | null;
  selectedAsset: AssetItem | null;
  modelStats: ModelMeshStats | null;
  shadingMode: ShadingPreset;
  wireframeOverlay: boolean;
  activeContextTab: ContextTabType;
  rigInfo: RigInfo | null;
  animationInfo: AnimationInfo | null;
  viewport: { cameraPosition: [number, number, number]; target: [number, number, number] } | null;

  setLoadedModel: (url: string | null, name?: string | null, asset?: AssetItem | null) => void;
  setSelectedAsset: (asset: AssetItem | null) => void;
  setModelStats: (stats: ModelMeshStats | null) => void;
  setShadingMode: (mode: ShadingPreset) => void;
  setWireframeOverlay: (enabled: boolean) => void;
  toggleWireframeOverlay: () => void;
  setActiveContextTab: (tab: ContextTabType) => void;
  setRigInfo: (info: RigInfo | null) => void;
  setAnimationInfo: (info: AnimationInfo | null) => void;
  setViewport: (viewport: { cameraPosition: [number, number, number]; target: [number, number, number] }) => void;
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  loadedModelUrl: null,
  loadedModelName: null,
  selectedAsset: null,
  modelStats: null,
  shadingMode: 'default',
  wireframeOverlay: false,
  activeContextTab: 'assets',
  rigInfo: null,
  animationInfo: null,
  viewport: null,

  setLoadedModel: (url, name = null, asset = null) => {
    const prev = get().loadedModelUrl;
    if (prev && prev !== url && prev.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(prev);
      } catch {
        /* ignore */
      }
    }
    set({
      loadedModelUrl: url,
      loadedModelName: name,
      selectedAsset: asset ?? get().selectedAsset,
    });
  },

  setSelectedAsset: (asset) => set({ selectedAsset: asset }),
  setModelStats: (stats) => set({ modelStats: stats }),
  setShadingMode: (shadingMode) => set({ shadingMode }),
  setWireframeOverlay: (wireframeOverlay) => set({ wireframeOverlay }),
  toggleWireframeOverlay: () => set((s) => ({ wireframeOverlay: !s.wireframeOverlay })),
  setActiveContextTab: (activeContextTab) => set({ activeContextTab }),
  setRigInfo: (rigInfo) => set({ rigInfo }),
  setAnimationInfo: (animationInfo) => set({ animationInfo }),
  setViewport: (viewport) => set({ viewport }),
}));

/** Single entry point used by panels / drag-drop to load a model everywhere. */
export function loadModelInViewer(url: string, name?: string | null, asset?: AssetItem | null) {
  useViewerStore.getState().setLoadedModel(url, name ?? null, asset ?? null);
  // Keep the legacy window event for any listener that hasn't migrated.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url, name: name ?? null } }));
  }
}

export type { AssetItem };

