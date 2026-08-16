import { create } from 'zustand';
import type { AssetItem } from '@/3D-SPACE/AssetPanel';

/**
 * Global "currently loaded 3D model" state.
 *
 * Why global: the 3D viewers (Canvas3D in the workspace, ViewerScene in
 * render/texture) previously kept the loaded model URL in local component
 * state. That state is destroyed on route navigation, so a model loaded in
 * the workspace would vanish when you switched to the render or texture page
 * (and vice-versa) — the viewer would fall back to its default/empty state.
 *
 * Holding the URL here means every viewer reads the same source of truth and
 * a model loaded on one page stays loaded on all of them. The `load-glb-model`
 * window event is still dispatched by the AssetPanel / drop handlers for
 * backwards compatibility, but the canonical store update happens in the
 * viewer event listeners via `setLoadedModel`.
 */
interface ViewerState {
  loadedModelUrl: string | null;
  loadedModelName: string | null;
  setLoadedModel: (url: string | null, name?: string | null) => void;
  viewport: { cameraPosition: [number, number, number]; target: [number, number, number] } | null;
  setViewport: (viewport: { cameraPosition: [number, number, number]; target: [number, number, number] }) => void;
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  loadedModelUrl: null,
  loadedModelName: null,
  viewport: null,
  setLoadedModel: (url, name = null) => {
    const prev = get().loadedModelUrl;
    if (prev && prev !== url && prev.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(prev);
      } catch {
        /* ignore */
      }
    }
    set({ loadedModelUrl: url, loadedModelName: name });
  },
  setViewport: (viewport) => set({ viewport }),
}));

/** Single entry point used by panels / drag-drop to load a model everywhere. */
export function loadModelInViewer(url: string, name?: string | null) {
  useViewerStore.getState().setLoadedModel(url, name ?? null);
  // Keep the legacy window event for any listener that hasn't migrated.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url, name: name ?? null } }));
  }
}

export type { AssetItem };
