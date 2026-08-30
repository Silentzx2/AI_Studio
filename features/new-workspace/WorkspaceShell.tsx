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
    leftPanelWidth, setLeftPanelWidth,
    rightPanelWidth, setRightPanelWidth,
  } = useWorkspace();

  const [isResizingLeft, setIsResizingLeft] = React.useState(false);
  const [isResizingRight, setIsResizingRight] = React.useState(false);

  const startResizingLeft = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingLeft(true);
  }, []);

  const startResizingRight = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingRight(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizingLeft(false);
    setIsResizingRight(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizingLeft) {
      const newWidth = e.clientX - 64; // Subtract nav width
      if (newWidth > 200 && newWidth < 600) {
        setLeftPanelWidth(newWidth);
      }
    }
    if (isResizingRight) {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 200 && newWidth < 600) {
        setRightPanelWidth(newWidth);
      }
    }
  }, [isResizingLeft, isResizingRight, setLeftPanelWidth, setRightPanelWidth]);

  useEffect(() => {
    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizingLeft, isResizingRight, resize, stopResizing]);

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
    <div id="forge3d-app-root" className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--ws-bg,hsl(var(--surface-0)))] text-[var(--ws-text,hsl(var(--foreground)))]">
      <div className="flex-shrink-0 relative z-50">
        <TopHeader />
      </div>
      <div className="flex flex-1 overflow-hidden relative bg-[#22242a]">
        {/* Left tool rail - docked solid dark toolbar */}
        <div className="z-30 h-full flex-shrink-0 relative">
          <LeftNavigation />
        </div>

        {/* Center Workspace & 3D Stage */}
        <div className="flex-1 h-full relative overflow-hidden">
          {/* Continuous Full-Bleed 3D Viewport in Background */}
          {mainNav === 'workspace' && (
            <main id="center-viewport-stage" className="absolute inset-0 z-0 overflow-hidden bg-[#22242a]">
              <MeshViewer />
            </main>
          )}

          {/* Floating Context Tool Panel (Left) */}
          <AnimatePresence initial={false}>
            {mainNav === 'workspace' && isLeftPanelOpen && (
              <motion.aside
                id="context-tool-panel-container"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                style={{ width: leftPanelWidth }}
                className="absolute left-3 top-3 bottom-3 bg-[#14161b] border border-[#272a34] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] flex flex-col z-20 overflow-hidden group/panel"
              >
                <div className="flex-1 overflow-hidden relative">
                  {/* Floating Collapse Button */}
                  <div className="absolute top-3.5 right-3.5 z-20">
                    <SimpleTooltip label="Collapse panel" side="left">
                      <button
                        onClick={() => setIsLeftPanelOpen(false)}
                        className="p-1.5 rounded-lg bg-[#1c1f26] border border-[#2e323e] text-zinc-300 hover:text-[#F9CF00] hover:bg-[#252832] transition-all shadow-md"
                      >
                        <PanelLeftClose className="w-4 h-4 stroke-[2.2]" />
                      </button>
                    </SimpleTooltip>
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={activeTool}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 6 }}
                      transition={{ duration: 0.12, ease: 'easeOut' }}
                      className="h-full w-full flex flex-col overflow-hidden"
                    >
                      {renderToolPanel()}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Resize Handle Left */}
                <div
                  onMouseDown={startResizingLeft}
                  className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize z-30 group-hover/panel:bg-[#F9CF00]/40 hover:bg-[#F9CF00]/70 transition-colors"
                />
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Left collapsed toggle button */}
          {mainNav === 'workspace' && !isLeftPanelOpen && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20">
              <SimpleTooltip label="Open Tool Panel">
                <button
                  onClick={() => setIsLeftPanelOpen(true)}
                  className="w-7 h-14 rounded-r-xl bg-[#14161b] border border-l-0 border-[#272a34] text-zinc-300 hover:text-[#F9CF00] transition-colors flex items-center justify-center shadow-2xl"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              </SimpleTooltip>
            </div>
          )}

          {/* Floating Asset Store & Inspector (Right) */}
          <AnimatePresence initial={false}>
            {mainNav === 'workspace' && isRightPanelOpen && (
              <motion.aside
                id="right-inspector-assets-column"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                style={{ width: rightPanelWidth }}
                className="absolute right-3 top-3 bottom-3 bg-[#14161b] border border-[#272a34] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] flex flex-col z-20 overflow-hidden group/right"
              >
                {/* Resize Handle Right */}
                <div
                  onMouseDown={startResizingRight}
                  className="absolute left-0 top-0 w-1.5 h-full cursor-col-resize z-30 group-hover/right:bg-[#F9CF00]/40 hover:bg-[#F9CF00]/70 transition-colors"
                />

                <div className="h-10 px-3.5 flex items-center justify-between border-b border-[#272a34] bg-[#181b22] flex-shrink-0">
                   <span className="text-[11px] font-bold tracking-wider text-[#F9CF00] uppercase">Asset Studio</span>
                   <SimpleTooltip label="Collapse panel">
                     <button
                       onClick={() => setIsRightPanelOpen(false)}
                       className="p-1.5 rounded-lg text-zinc-300 hover:text-[#F9CF00] hover:bg-[#252832] transition-colors"
                     >
                       <PanelRightClose className="w-4 h-4 stroke-[2.2]" />
                     </button>
                   </SimpleTooltip>
                 </div>
                 <div className="flex items-center p-1.5 bg-[#181b22] border-b border-[#272a34] gap-1.5">
                    <button id="tab-btn-assets" onClick={() => setRightPanelMode('assets')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${rightPanelMode === 'assets' ? 'bg-[#252832] text-[#F9CF00] border border-[#343846] shadow-sm font-bold' : 'text-zinc-400 hover:text-white hover:bg-[#20232b]'}`}>
                      <FolderOpen className="w-3.5 h-3.5 stroke-[2.2]" /><span>Assets</span>
                    </button>
                    <button id="tab-btn-prompt" onClick={() => setRightPanelMode('prompt')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${rightPanelMode === 'prompt' ? 'bg-[#252832] text-[#F9CF00] border border-[#343846] shadow-sm font-bold' : 'text-zinc-400 hover:text-white hover:bg-[#20232b]'}`}>
                      <span>Prompt</span>
                    </button>
                    <button id="tab-btn-properties" onClick={() => setRightPanelMode('properties')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${rightPanelMode === 'properties' || rightPanelMode === 'property' ? 'bg-[#252832] text-[#F9CF00] border border-[#343846] shadow-sm font-bold' : 'text-zinc-400 hover:text-white hover:bg-[#20232b]'}`}>
                      <Sliders className="w-3.5 h-3.5 stroke-[2.2]" /><span>Property</span>
                    </button>
                 </div>
                <div className="flex-1 overflow-hidden bg-[#14161b]">
                  {rightPanelMode === 'assets' ? <RightAssetsPanel /> : rightPanelMode === 'prompt' ? <RightPromptPanel /> : <RightPropertyPanel />}
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Right collapsed toggle button */}
          {mainNav === 'workspace' && !isRightPanelOpen && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20">
              <SimpleTooltip label="Open Asset Store / Inspector">
                <button
                  onClick={() => setIsRightPanelOpen(true)}
                  className="w-7 h-14 rounded-l-xl bg-[#14161b] border border-r-0 border-[#272a34] text-zinc-300 hover:text-[#F9CF00] transition-colors flex items-center justify-center shadow-2xl"
                >
                  <PanelRightOpen className="w-4 h-4" />
                </button>
              </SimpleTooltip>
            </div>
          )}
        </div>

        {/* Dashboard/Assets/System overlays with smooth Framer Motion transition */}
        <AnimatePresence mode="wait" initial={false}>
          {mainNav === 'dashboard' && (
            <motion.div
              key="dashboard-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 top-[60px] z-[15] bg-[var(--ws-bg,hsl(var(--surface-0)))] overflow-auto"
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
              className="absolute inset-0 top-[60px] z-[15] bg-[var(--ws-bg,hsl(var(--surface-0)))] overflow-auto"
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
              className="absolute inset-0 top-[60px] z-[15] bg-[var(--ws-bg,hsl(var(--surface-0)))] overflow-auto"
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
