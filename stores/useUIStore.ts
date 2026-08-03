import { create } from 'zustand';
import type { ViewerState, ViewerMode } from '@/types';

export type InspectorTab = 'scene' | 'properties' | 'material' | 'lighting' | 'export' | 'logs';
export type BottomDockTab = 'recent' | 'queue' | 'progress' | 'console' | 'notifications' | 'downloads' | 'history' | 'assets';

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
  // Capabilities
  capabilities: {
    threeDGen: boolean;
    remesh: boolean;
    textureGen: boolean;
    segmentation: boolean;
    riggingAnimation: boolean;
  };
  setCapability: (cap: keyof UIState['capabilities'], enabled: boolean) => void;
}

let resetCameraCallback: (() => void) | null = null;
export const registerResetCamera = (cb: () => void) => { resetCameraCallback = cb; };

export const useUIStore = create<UIState>()((set) => ({
  leftSidebarCollapsed: false,
  rightSidebarCollapsed: false,
  bottomPanelCollapsed: false,
  mobileMenuOpen: false,
  mobileLeftSidebarOpen: false,
  mobileRightSidebarOpen: false,
  viewer: { mode: 'solid', autoRotate: false, showGrid: true, showWireframe: false, fullscreen: false, showStats: false },
  inspectorTab: 'scene',
  bottomDockTab: 'recent',
  creativeLayoutMode: true, // Default to true to show the gorgeous new Creative UI
  capabilities: {
    threeDGen: true,
    remesh: true,
    textureGen: true,
    segmentation: true,
    riggingAnimation: true,
  },
  setCapability: (cap, enabled) => set((s) => ({ capabilities: { ...s.capabilities, [cap]: enabled } })),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setBottomDockTab: (bottomDockTab) => set({ bottomDockTab }),
  toggleLeftSidebar: () => set((s) => ({ leftSidebarCollapsed: !s.leftSidebarCollapsed })),
  toggleRightSidebar: () => set((s) => ({ rightSidebarCollapsed: !s.rightSidebarCollapsed })),
  toggleBottomPanel: () => set((s) => ({ bottomPanelCollapsed: !s.bottomPanelCollapsed })),
  setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
  setMobileLeftSidebarOpen: (mobileLeftSidebarOpen) => set({ mobileLeftSidebarOpen }),
  setMobileRightSidebarOpen: (mobileRightSidebarOpen) => set({ mobileRightSidebarOpen }),
  setViewerMode: (mode) => set((s) => ({ viewer: { ...s.viewer, mode } })),
  toggleAutoRotate: () => set((s) => ({ viewer: { ...s.viewer, autoRotate: !s.viewer.autoRotate } })),
  toggleGrid: () => set((s) => ({ viewer: { ...s.viewer, showGrid: !s.viewer.showGrid } })),
  toggleWireframe: () => set((s) => ({ viewer: { ...s.viewer, showWireframe: !s.viewer.showWireframe } })),
  toggleFullscreen: () => set((s) => ({ viewer: { ...s.viewer, fullscreen: !s.viewer.fullscreen } })),
  toggleStats: () => set((s) => ({ viewer: { ...s.viewer, showStats: !s.viewer.showStats } })),
  resetCamera: () => { resetCameraCallback?.(); },
  toggleCreativeLayoutMode: () => set((s) => ({ creativeLayoutMode: !s.creativeLayoutMode })),
}));