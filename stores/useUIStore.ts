import { create } from 'zustand';
import { useAppStore } from '@/stores/useAppStore';
import type { ViewerState, ViewerMode } from '@/types';

export type InspectorTab = 'scene' | 'properties' | 'material' | 'lighting' | 'export' | 'logs';
export type BottomDockTab = 'recent' | 'queue' | 'progress' | 'notifications' | 'downloads' | 'history' | 'assets';

interface UIState {
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  bottomPanelCollapsed: boolean;
  mobileMenuOpen: boolean;
  mobileLeftSidebarOpen: boolean;
  mobileRightSidebarOpen: boolean;
  viewer: ViewerState;
  inspectorTab: InspectorTab;
  bottomDockTab: BottomDockTab;
  setInspectorTab: (tab: InspectorTab) => void;
  setBottomDockTab: (tab: BottomDockTab) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  toggleBottomPanel: () => void;
  setMobileMenuOpen: (v: boolean) => void;
  setMobileLeftSidebarOpen: (v: boolean) => void;
  setMobileRightSidebarOpen: (v: boolean) => void;
  setViewerMode: (mode: ViewerMode) => void;
  toggleAutoRotate: () => void;
  toggleGrid: () => void;
  toggleWireframe: () => void;
  toggleFullscreen: () => void;
  toggleStats: () => void;
  resetCamera: () => void;
  creativeLayoutMode: boolean;
  toggleCreativeLayoutMode: () => void;
  capabilities: {
    threeDGen: boolean;
    remesh: boolean;
    textureGen: boolean;
  };
  setCapability: (cap: keyof UIState['capabilities'], enabled: boolean) => void;
}

let resetCameraCallback: (() => void) | null = null;
export const registerResetCamera = (cb: () => void) => { resetCameraCallback = cb; };

export const useUIStore = create<UIState>()((set) => ({
  get leftSidebarCollapsed() { return useAppStore.getState().leftSidebarCollapsed; },
  get rightSidebarCollapsed() { return useAppStore.getState().rightSidebarCollapsed; },
  get bottomPanelCollapsed() { return useAppStore.getState().bottomPanelCollapsed; },
  get mobileMenuOpen() { return useAppStore.getState().mobileMenuOpen; },
  get mobileLeftSidebarOpen() { return useAppStore.getState().mobileLeftSidebarOpen; },
  get mobileRightSidebarOpen() { return useAppStore.getState().mobileRightSidebarOpen; },
  get viewer() { return useAppStore.getState().viewer; },
  get inspectorTab() { return useAppStore.getState().inspectorTab as InspectorTab; },
  get bottomDockTab() { return useAppStore.getState().bottomDockTab as BottomDockTab; },
  get creativeLayoutMode() { return useAppStore.getState().creativeLayoutMode; },
  get capabilities() { return useAppStore.getState().capabilities as UIState['capabilities']; },

  setCapability: (cap, enabled) =>
    useAppStore.setState((s) => ({ capabilities: { ...s.capabilities, [cap]: enabled } })),
  setInspectorTab: (inspectorTab) => useAppStore.setState({ inspectorTab }),
  setBottomDockTab: (bottomDockTab) => useAppStore.setState({ bottomDockTab }),
  toggleLeftSidebar: () => useAppStore.setState((s) => ({ leftSidebarCollapsed: !s.leftSidebarCollapsed })),
  toggleRightSidebar: () => useAppStore.setState((s) => ({ rightSidebarCollapsed: !s.rightSidebarCollapsed })),
  toggleBottomPanel: () => useAppStore.setState((s) => ({ bottomPanelCollapsed: !s.bottomPanelCollapsed })),
  setMobileMenuOpen: (mobileMenuOpen) => useAppStore.setState({ mobileMenuOpen }),
  setMobileLeftSidebarOpen: (mobileLeftSidebarOpen) => useAppStore.setState({ mobileLeftSidebarOpen }),
  setMobileRightSidebarOpen: (mobileRightSidebarOpen) => useAppStore.setState({ mobileRightSidebarOpen }),
  setViewerMode: (mode) =>
    useAppStore.setState((s) => ({ viewer: { ...s.viewer, mode } })),
  toggleAutoRotate: () =>
    useAppStore.setState((s) => ({ viewer: { ...s.viewer, autoRotate: !s.viewer.autoRotate } })),
  toggleGrid: () =>
    useAppStore.setState((s) => ({ viewer: { ...s.viewer, showGrid: !s.viewer.showGrid } })),
  toggleWireframe: () =>
    useAppStore.setState((s) => ({ viewer: { ...s.viewer, showWireframe: !s.viewer.showWireframe } })),
  toggleFullscreen: () =>
    useAppStore.setState((s) => ({ viewer: { ...s.viewer, fullscreen: !s.viewer.fullscreen } })),
  toggleStats: () =>
    useAppStore.setState((s) => ({ viewer: { ...s.viewer, showStats: !s.viewer.showStats } })),
  resetCamera: () => { resetCameraCallback?.(); },
  toggleCreativeLayoutMode: () =>
    useAppStore.setState((s) => ({ creativeLayoutMode: !s.creativeLayoutMode })),
}));

// Mirror app store data into this proxy store so subscribers re-render.
// Only update fields that actually changed to avoid unnecessary re-renders.
useAppStore.subscribe((state) => {
  const cur = useUIStore.getState();
  const next: Partial<UIState> = {};
  if (cur.leftSidebarCollapsed !== state.leftSidebarCollapsed) next.leftSidebarCollapsed = state.leftSidebarCollapsed;
  if (cur.rightSidebarCollapsed !== state.rightSidebarCollapsed) next.rightSidebarCollapsed = state.rightSidebarCollapsed;
  if (cur.bottomPanelCollapsed !== state.bottomPanelCollapsed) next.bottomPanelCollapsed = state.bottomPanelCollapsed;
  if (cur.mobileMenuOpen !== state.mobileMenuOpen) next.mobileMenuOpen = state.mobileMenuOpen;
  if (cur.mobileLeftSidebarOpen !== state.mobileLeftSidebarOpen) next.mobileLeftSidebarOpen = state.mobileLeftSidebarOpen;
  if (cur.mobileRightSidebarOpen !== state.mobileRightSidebarOpen) next.mobileRightSidebarOpen = state.mobileRightSidebarOpen;
  if (cur.viewer !== state.viewer) next.viewer = state.viewer;
  if (cur.inspectorTab !== state.inspectorTab) next.inspectorTab = state.inspectorTab as InspectorTab;
  if (cur.bottomDockTab !== state.bottomDockTab) next.bottomDockTab = state.bottomDockTab as BottomDockTab;
  if (cur.creativeLayoutMode !== state.creativeLayoutMode) next.creativeLayoutMode = state.creativeLayoutMode;
  if (cur.capabilities !== state.capabilities) next.capabilities = state.capabilities as UIState['capabilities'];
  if (Object.keys(next).length > 0) useUIStore.setState(next);
});