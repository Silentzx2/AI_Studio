import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useAppStore } from '@/stores/useAppStore';
import type { ProjectLayer, ProjectAsset } from '@/types';

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

export const useProjectStore = create<ProjectState>()(
  subscribeWithSelector((set, get) => ({
    get currentProject() { return useAppStore.getState().currentProject; },
    get activeLayerId() { return useAppStore.getState().activeLayerId; },
    get isDirty() { return useAppStore.getState().isDirty; },

    setProject: (project) => useAppStore.setState({ currentProject: project, isDirty: false, activeLayerId: null }),
    clearProject: () => useAppStore.setState({ currentProject: null, activeLayerId: null, isDirty: false }),
    addLayer: (layer) => useAppStore.setState((s) => {
      if (!s.currentProject) return {};
      const existing = s.currentProject.layers.find(
        (l) => l.type === layer.type && l.sourceTab === layer.sourceTab
      );
      if (existing) {
        const updatedLayers = s.currentProject.layers.map((l) =>
          l.id === existing.id ? { ...layer, id: existing.id, timestamp: new Date() } : l
        );
        return { currentProject: { ...s.currentProject, layers: updatedLayers }, isDirty: true };
      }
      return {
        currentProject: {
          ...s.currentProject,
          layers: [...s.currentProject.layers, { ...layer, id: layer.id || Math.random().toString(36).slice(2, 10), timestamp: new Date() }],
        },
        isDirty: true,
      };
    }),
    removeLayer: (layerId) => useAppStore.setState((s) => {
      if (!s.currentProject) return {};
      return {
        currentProject: { ...s.currentProject, layers: s.currentProject.layers.filter((l) => l.id !== layerId) },
        isDirty: true,
        activeLayerId: s.activeLayerId === layerId ? null : s.activeLayerId,
      };
    }),
    toggleLayerEnabled: (layerId) => useAppStore.setState((s) => {
      if (!s.currentProject) return {};
      return {
        currentProject: { ...s.currentProject, layers: s.currentProject.layers.map((l) => l.id === layerId ? { ...l, enabled: !l.enabled } : l) },
        isDirty: true,
      };
    }),
    toggleLayerVisible: (layerId) => useAppStore.setState((s) => {
      if (!s.currentProject) return {};
      return {
        currentProject: { ...s.currentProject, layers: s.currentProject.layers.map((l) => l.id === layerId ? { ...l, visible: !l.visible } : l) },
        isDirty: true,
      };
    }),
    updateLayer: (layerId, updates) => useAppStore.setState((s) => {
      if (!s.currentProject) return {};
      return {
        currentProject: { ...s.currentProject, layers: s.currentProject.layers.map((l) => l.id === layerId ? { ...l, ...updates } : l) },
        isDirty: true,
      };
    }),
    setActiveLayer: (activeLayerId) => useAppStore.setState({ activeLayerId }),
    getEnabledLayers: () => {
      const s = useAppStore.getState();
      return s.currentProject?.layers.filter((l) => l.enabled) ?? [];
    },
    getVisibleLayers: () => {
      const s = useAppStore.getState();
      return s.currentProject?.layers.filter((l) => l.visible) ?? [];
    },
    getLayerByType: (type) => {
      const s = useAppStore.getState();
      return s.currentProject?.layers.find((l) => l.type === type);
    },
    reorderLayers: (fromId, toId) => useAppStore.setState((s) => {
      if (!s.currentProject) return {};
      const layers = [...s.currentProject.layers];
      const fromIdx = layers.findIndex((l) => l.id === fromId);
      const toIdx = layers.findIndex((l) => l.id === toId);
      if (fromIdx === -1 || toIdx === -1) return {};
      const [moved] = layers.splice(fromIdx, 1);
      layers.splice(toIdx, 0, moved);
      return { currentProject: { ...s.currentProject, layers }, isDirty: true };
    }),
  }))
);

// Mirror app store data into this proxy store so subscribers re-render.
useAppStore.subscribe((state) => {
  useProjectStore.setState({
    currentProject: state.currentProject,
    activeLayerId: state.activeLayerId,
    isDirty: state.isDirty,
  });
});