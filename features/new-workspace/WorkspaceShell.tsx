'use client';

import React, { useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import dynamic from 'next/dynamic';
import { useWorkspace } from './store/WorkspaceContext';
import { TopHeader } from './Header/TopHeader';
import { LeftNavigation } from './Navigation/LeftNavigation';

// Dynamic imports for heavy 3D components and panels
const MeshViewer = dynamic(() => import('./Viewport/MeshViewer').then(mod => mod.MeshViewer), { 
  ssr: false,
  loading: () => <div className="w-full h-full bg-[hsl(var(--surface-0))] animate-pulse" />
});

const GeneratePanel = dynamic(() => import('./Panels/GeneratePanel').then(mod => mod.GeneratePanel), { ssr: false });
const WorldGenToolPanel = dynamic(() => import('./Panels/WorldGenToolPanel').then(mod => mod.WorldGenToolPanel), { ssr: false });
const TexturePanel = dynamic(() => import('./Panels/TexturePanel').then(mod => mod.TexturePanel), { ssr: false });
const RemeshPanel = dynamic(() => import('./Panels/RemeshPanel').then(mod => mod.RemeshPanel), { ssr: false });
const SecondaryPanel = dynamic(() => import('./Panels/SecondaryPanels').then(mod => mod.SecondaryPanel), { ssr: false });

const RightAssetsPanel = dynamic(() => import('./RightPanel/RightAssetsPanel').then(mod => mod.RightAssetsPanel), { ssr: false });
const RightPropertyPanel = dynamic(() => import('./RightPanel/RightPropertyPanel').then(mod => mod.RightPropertyPanel), { ssr: false });
const RightPromptPanel = dynamic(() => import('./RightPanel/RightPromptPanel').then(mod => mod.RightPromptPanel), { ssr: false });

const OutputsPage = dynamic(() => import('./Dashboard/OutputsPage').then(mod => mod.OutputsPage), { ssr: false });
const SystemPage = dynamic(() => import('./Dashboard/SystemPage').then(mod => mod.SystemPage), { ssr: false });
const StudioDashboard = dynamic(() => import('./Dashboard/StudioDashboard').then(mod => mod.StudioDashboard), { ssr: false });

const ExportModal = dynamic(() => import('./Modals/ExportModal').then(mod => mod.ExportModal), { ssr: false });
const SettingsModal = dynamic(() => import('./Modals/SettingsModal').then(mod => mod.SettingsModal), { ssr: false });
const DccBridgeModal = dynamic(() => import('./Modals/DccBridgeModal').then(mod => mod.DccBridgeModal), { ssr: false });
const ProgressOverlay = dynamic(() => import('./Notifications/ProgressOverlay').then(mod => mod.ProgressOverlay), { ssr: false });
import { FolderOpen, Sliders, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { ToolType } from './types';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

const ROUTE_SEGMENT_TO_TOOL: Record<string, ToolType> = {
  'generate': 'model',
  'model': 'model',
  '3d-gen': 'model',
  'worldgen': 'worldgen',
  'remesh': 'remesh',
  'texture': 'texture',
  'textures': 'texture',
  'edit': 'edit',
  'upscale': 'upscale',
  'pbr': 'pbr',
};

export const WorkspaceShell: React.FC = () => {
  const pathname = usePathname();

  const {
    mainNav, setMainNav, activeTool, setActiveTool,
    rightPanelMode, setRightPanelMode,
    isLeftPanelOpen, isRightPanelOpen,
    setIsLeftPanelOpen, setIsRightPanelOpen,
  } = useWorkspace();

  useEffect(() => {
    const rawPath = pathname?.toLowerCase() ?? '';
    const cleanPath = rawPath.replace(/\/+$/, ''); // Strip trailing slashes

    // Overview / Dashboard routes
    if (cleanPath === '/workspace/overview' || cleanPath === '/workspace/dashboard' || cleanPath === '/dashboard' || cleanPath === '/') {
      setMainNav('dashboard');
      return;
    }

    // Outputs / Assets routes
    if (cleanPath === '/workspace/assets' || cleanPath === '/workspace/outputs' || cleanPath === '/outputs' || cleanPath === '/assets') {
      setMainNav('assets');
      return;
    }

    // System routes
    if (cleanPath === '/workspace/system' || cleanPath === '/system') {
      setMainNav('system');
      return;
    }

    // Workspace tool routes: /workspace/[tool] or /workspace
    setMainNav('workspace');
    if (cleanPath.startsWith('/workspace/')) {
      const toolSegment = cleanPath.replace('/workspace/', '').split('/')[0];
      const matched = ROUTE_SEGMENT_TO_TOOL[toolSegment] || 'model';
      setActiveTool(matched);
    } else if (cleanPath === '/workspace') {
      setActiveTool('model');
    }
  }, [pathname, setMainNav, setActiveTool]);

  const renderToolPanel = () => {
    switch (activeTool) {
      case 'model': return <GeneratePanel />;
      case 'worldgen': return <WorldGenToolPanel />;
      case 'remesh': return <RemeshPanel />;
      case 'texture': return <TexturePanel />;
      case 'segment': case 'edit': case 'upscale': case 'pbr': return <SecondaryPanel tool={activeTool} />;
      default: return <GeneratePanel />;
    }
  };

  return (
    <div id="forge3d-app-root" className="flex flex-col h-screen w-screen overflow-hidden bg-[#0D0E10] text-[#E0E2E8]">
      <div className="flex-shrink-0 relative z-50">
        <TopHeader />
      </div>
      <div className="flex flex-1 overflow-hidden relative bg-[#121418]">
        {/* Left tool rail - docked solid dark toolbar */}
        <div className="z-30 h-full flex-shrink-0 relative">
          <LeftNavigation />
        </div>

        {/* Center Workspace & 3D Stage */}
        <div className="flex-1 h-full relative overflow-hidden">
          {/* Continuous Full-Bleed 3D Viewport in Background */}
          {mainNav === 'workspace' && (
            <main id="center-viewport-stage" className="absolute inset-0 z-0 overflow-hidden bg-[#16181D]">
              <MeshViewer />
            </main>
          )}

          {/* Floating Context Tool Panel (Left) - Tripo Style ~264px */}
          <AnimatePresence initial={false}>
            {mainNav === 'workspace' && isLeftPanelOpen && (
              <motion.aside
                id="context-tool-panel-container"
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="absolute left-2 top-2 bottom-2 w-[264px] max-w-[calc(100vw-5rem)] bg-[#191A1D] border border-white/[0.08] rounded-xl shadow-2xl flex flex-col z-20 overflow-hidden"
              >
                <div className="flex-1 overflow-hidden relative">
                  {/* Floating Collapse Button */}
                  <div className="absolute top-2 right-2 z-20">
                    <SimpleTooltip label="Collapse panel" side="left">
                      <button
                        onClick={() => setIsLeftPanelOpen(false)}
                        className="p-1 rounded-lg bg-[#202125] border border-white/[0.08] text-zinc-400 hover:text-[#F9CF00] hover:bg-[#28292E] transition-all"
                      >
                        <PanelLeftClose className="w-3.5 h-3.5" />
                      </button>
                    </SimpleTooltip>
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={activeTool}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 4 }}
                      transition={{ duration: 0.1, ease: 'easeOut' }}
                      className="h-full w-full flex flex-col overflow-hidden"
                    >
                      {renderToolPanel()}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Left collapsed toggle button */}
          {mainNav === 'workspace' && !isLeftPanelOpen && (
            <div className="absolute left-0.5 top-1/2 -translate-y-1/2 z-20">
              <SimpleTooltip label="Open Tool Panel">
                <button
                  onClick={() => setIsLeftPanelOpen(true)}
                  className="w-5 h-10 rounded-r-lg bg-[#191A1D] border border-l-0 border-white/[0.08] text-zinc-400 hover:text-[#F9CF00] transition-colors flex items-center justify-center shadow-lg cursor-pointer"
                >
                  <PanelLeftOpen className="w-3.5 h-3.5" />
                </button>
              </SimpleTooltip>
            </div>
          )}

          {/* Floating Asset Store & Inspector (Right) - Tripo Style ~196px */}
          <AnimatePresence initial={false}>
            {mainNav === 'workspace' && isRightPanelOpen && (
              <motion.aside
                id="right-inspector-assets-column"
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="absolute right-1.5 top-1.5 bottom-1.5 w-[196px] max-w-[calc(100vw-4.5rem)] bg-[#191A1D] border border-white/[0.08] rounded-xl shadow-2xl flex flex-col z-20 overflow-hidden"
              >
                {/* Top Tab Bar: Assets | Property */}
                <div className="h-8 px-2 flex items-center justify-between border-b border-white/[0.08] bg-[#16181D] flex-shrink-0">
                  <div className="flex items-center gap-1 w-full mr-1">
                    <button
                      id="tab-btn-assets"
                      onClick={() => setRightPanelMode('assets')}
                      className={`flex-1 py-1 rounded-md text-[11px] font-bold transition-all ${
                        rightPanelMode === 'assets'
                          ? 'bg-[#25262A] text-white shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Assets
                    </button>
                    <button
                      id="tab-btn-properties"
                      onClick={() => setRightPanelMode('properties')}
                      className={`flex-1 py-1 rounded-md text-[11px] font-bold transition-all ${
                        rightPanelMode === 'properties' || rightPanelMode === 'property'
                          ? 'bg-[#25262A] text-white shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Property
                    </button>
                  </div>
                  <SimpleTooltip label="Collapse panel">
                    <button
                      onClick={() => setIsRightPanelOpen(false)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-[#F9CF00] transition-colors"
                    >
                      <PanelRightClose className="w-3.5 h-3.5" />
                    </button>
                  </SimpleTooltip>
                </div>

                <div className="flex-1 overflow-hidden bg-[#191A1D]">
                  {rightPanelMode === 'assets' ? <RightAssetsPanel /> : <RightPropertyPanel />}
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Right collapsed toggle button */}
          {mainNav === 'workspace' && !isRightPanelOpen && (
            <div className="absolute right-0.5 top-1/2 -translate-y-1/2 z-20">
              <SimpleTooltip label="Open Asset Store / Inspector">
                <button
                  onClick={() => setIsRightPanelOpen(true)}
                  className="w-5 h-10 rounded-l-lg bg-[#191A1D] border border-r-0 border-white/[0.08] text-zinc-400 hover:text-[#F9CF00] transition-colors flex items-center justify-center shadow-lg cursor-pointer"
                >
                  <PanelRightOpen className="w-3.5 h-3.5" />
                </button>
              </SimpleTooltip>
            </div>
          )}
        </div>

        {/* Dashboard/Assets/System overlays with smooth Framer Motion transition - matching exact workspace dimensions */}
        <AnimatePresence mode="wait" initial={false}>
          {mainNav === 'dashboard' && (
            <motion.div
              key="dashboard-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 left-[58px] z-[15] bg-[#0D0E10] overflow-auto flex flex-col"
            >
              <StudioDashboard />
            </motion.div>
          )}
          {mainNav === 'assets' && (
            <motion.div
              key="assets-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 left-[58px] z-[15] bg-[#0D0E10] overflow-auto flex flex-col"
            >
              <OutputsPage />
            </motion.div>
          )}
          {mainNav === 'system' && (
            <motion.div
              key="system-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 left-[58px] z-[15] bg-[#0D0E10] overflow-auto flex flex-col"
            >
              <SystemPage />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ProgressOverlay />
      <SettingsModal />
      <DccBridgeModal />
      <ExportModal />
    </div>
  );
};

export default WorkspaceShell;
