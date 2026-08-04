import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface ProjectLayer {
  id: string;
  type: 'texture' | 'rigging' | 'animation' | 'lod' | 'segmentation' | 'remesh' | 'part_separation';
  name: string;
  enabled: boolean;
  visible: boolean;
  data: any;
  sourceTab: string;
  timestamp: Date;
}

export interface ProjectAsset {
  id: string;
  name: string;
  modelUrl: string | null;
  modelData: any;
  layers: ProjectLayer[];
  metadata: {
    prompt: string;
    model: string;
    quality: string;
    createdAt: Date;
  };
}

interface ProjectState {
  currentProject: ProjectAsset | null;
  activeLayerId: string | null;
  isDirty: boolean;

  setProject: (project: ProjectAsset) => void;
  clearProject: () => void;
  addLayer: (layer: ProjectLayer) => void;
  removeLayer: (layerId: string) => void;
  toggleLayerEnabled: (layerId: string) => void;
  toggleLayerVisible: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<ProjectLayer>) => void;
  setActiveLayer: (layerId: string | null) => void;
  getEnabledLayers: () => ProjectLayer[];
  getVisibleLayers: () => ProjectLayer[];
  getLayerByType: (type: ProjectLayer['type']) => ProjectLayer | undefined;
  reorderLayers: (fromId: string, toId: string) => void;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useProjectStore = create<ProjectState>()(
  subscribeWithSelector((set, get) => ({
    currentProject: null,
    activeLayerId: null,
    isDirty: false,

    setProject: (project) =>
      set({ currentProject: project, isDirty: false, activeLayerId: null }),

    clearProject: () =>
      set({ currentProject: null, activeLayerId: null, isDirty: false }),

    addLayer: (layer) =>
      set((s) => {
        if (!s.currentProject) return {};
        const existing = s.currentProject.layers.find(
          (l) => l.type === layer.type && l.sourceTab === layer.sourceTab
        );
        if (existing) {
          const updatedLayers = s.currentProject.layers.map((l) =>
            l.id === existing.id ? { ...layer, id: existing.id, timestamp: new Date() } : l
          );
          return {
            currentProject: {
              ...s.currentProject,
              layers: updatedLayers,
            },
            isDirty: true,
          };
        }
        return {
          currentProject: {
            ...s.currentProject,
            layers: [...s.currentProject.layers, { ...layer, id: layer.id || generateId(), timestamp: new Date() }],
          },
          isDirty: true,
        };
      }),

    removeLayer: (layerId) =>
      set((s) => {
        if (!s.currentProject) return {};
        return {
          currentProject: {
            ...s.currentProject,
            layers: s.currentProject.layers.filter((l) => l.id !== layerId),
          },
          isDirty: true,
          activeLayerId:
            s.activeLayerId === layerId ? null : s.activeLayerId,
        };
      }),

    toggleLayerEnabled: (layerId) =>
      set((s) => {
        if (!s.currentProject) return {};
        return {
          currentProject: {
            ...s.currentProject,
            layers: s.currentProject.layers.map((l) =>
              l.id === layerId ? { ...l, enabled: !l.enabled } : l
            ),
          },
          isDirty: true,
        };
      }),

    toggleLayerVisible: (layerId) =>
      set((s) => {
        if (!s.currentProject) return {};
        return {
          currentProject: {
            ...s.currentProject,
            layers: s.currentProject.layers.map((l) =>
              l.id === layerId ? { ...l, visible: !l.visible } : l
            ),
          },
          isDirty: true,
        };
      }),

    updateLayer: (layerId, updates) =>
      set((s) => {
        if (!s.currentProject) return {};
        return {
          currentProject: {
            ...s.currentProject,
            layers: s.currentProject.layers.map((l) =>
              l.id === layerId ? { ...l, ...updates } : l
            ),
          },
          isDirty: true,
        };
      }),

    setActiveLayer: (layerId) => set({ activeLayerId: layerId }),

    getEnabledLayers: () => {
      const s = get();
      return s.currentProject?.layers.filter((l) => l.enabled) ?? [];
    },

    getVisibleLayers: () => {
      const s = get();
      return s.currentProject?.layers.filter((l) => l.visible) ?? [];
    },

    getLayerByType: (type) => {
      const s = get();
      return s.currentProject?.layers.find((l) => l.type === type);
    },

    reorderLayers: (fromId, toId) =>
      set((s) => {
        if (!s.currentProject) return {};
        const layers = [...s.currentProject.layers];
        const fromIdx = layers.findIndex((l) => l.id === fromId);
        const toIdx = layers.findIndex((l) => l.id === toId);
        if (fromIdx === -1 || toIdx === -1) return {};
        const [moved] = layers.splice(fromIdx, 1);
        layers.splice(toIdx, 0, moved);
        return {
          currentProject: { ...s.currentProject, layers },
          isDirty: true,
        };
      }),
  }))
);