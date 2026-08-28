'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useWorkspace } from './store/WorkspaceContext';
import { TopHeader } from './Header/TopHeader';
import { LeftNavigation } from './Navigation/LeftNavigation';
import { MeshViewer } from './Viewport/MeshViewer';
import { GeneratePanel } from './Panels/GeneratePanel';
import { TexturePanel } from './Panels/TexturePanel';
import { RemeshPanel } from './Panels/RemeshPanel';
import { AnimatePanel } from './Panels/AnimatePanel';
import { SegmentationPanel } from './Panels/SegmentationPanel';
import { RiggingPanel } from './Panels/RiggingPanel';
import { SecondaryPanel } from './Panels/SecondaryPanels';
import { RightAssetsPanel } from './RightPanel/RightAssetsPanel';
import { RightPropertyPanel } from './RightPanel/RightPropertyPanel';
import { RightPromptPanel } from './RightPanel/RightPromptPanel';
import { OutputsPage } from './Dashboard/OutputsPage';
import { SystemPage } from './Dashboard/SystemPage';
import { StudioDashboard } from './Dashboard/StudioDashboard';
import { ExportModal } from './Modals/ExportModal';
import { SettingsModal } from './Modals/SettingsModal';
import { DccBridgeModal } from './Modals/DccBridgeModal';
import { ProgressOverlay } from './Notifications/ProgressOverlay';
import { FolderOpen, Sliders, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { ToolType } from './types';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

const ROUTE_SEGMENT_TO_TOOL: Record<string, ToolType> = {
  'generate': 'model',
  'model': 'model',
  '3d-gen': 'model',
  'segment': 'segment',
  'segmentation': 'segment',
  'retopo': 'retopo',
  'remesh': 'remesh',
  'texture': 'texture',
  'textures': 'texture',
  'edit': 'edit',
  'upscale': 'upscale',
  'pbr': 'pbr',
  'animate': 'animate',
  'animation': 'animate',
  'rigging': 'rigging',
  'rig': 'rigging',
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
      case 'segment': return <SegmentationPanel />;
      case 'texture': return <TexturePanel />;
      case 'remesh': return <RemeshPanel />;
      case 'animate': return <AnimatePanel />;
      case 'rigging': return <RiggingPanel />;
      case 'retopo': case 'edit': case 'upscale': case 'pbr': return <SecondaryPanel tool={activeTool} />;
      default: return <GeneratePanel />;
    }
  };

  return (
    <div id="forge3d-app-root" className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--ws-bg,#0d0e12)] text-[var(--ws-text,#f3f4f6)]">
      <TopHeader />
      <div className="flex flex-1 overflow-hidden relative">
        <LeftNavigation />
        <div className="flex flex-1 overflow-hidden relative">
           {/* Workspace mode: left panel + viewport + right panel in a row with smooth transitions */}
          <AnimatePresence initial={false}>
            {mainNav === 'workspace' && isLeftPanelOpen && (
              <motion.aside
                id="context-tool-panel-container"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="w-72 h-full bg-[#101115] border-r border-[#21242c] flex flex-col flex-shrink-0 z-10 overflow-hidden"
              >
                <div className="h-8 px-2.5 flex items-center justify-between border-b border-[#21242c] bg-[#0c0d12] flex-shrink-0">
                   <span className="text-[10px] font-bold tracking-wider text-[#9ca3af] uppercase">Tools</span>
                   <SimpleTooltip label="Collapse panel">
                    <button
                      onClick={() => setIsLeftPanelOpen(false)}
                      className="p-1 rounded-md text-[#6b7280] hover:text-[#f5c518] hover:bg-[#1a1d26] transition-colors"
                    >
                      <PanelLeftClose className="w-4 h-4" />
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
              </motion.aside>
            )}
          </AnimatePresence>

          <main id="center-viewport-stage" className="flex-1 h-full relative overflow-hidden bg-[#0a0b0e]">
            {mainNav === 'workspace' && <MeshViewer />}

            {/* Left collapsed toggle - inside viewport so it sits at viewport edge */}
            {mainNav === 'workspace' && !isLeftPanelOpen && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 z-20">
                <SimpleTooltip label="Open Tool Panel">
                  <button
                    onClick={() => setIsLeftPanelOpen(true)}
                    className="w-6 h-14 rounded-r-lg bg-[#16181f] border border-l-0 border-[#272b36] text-[#6b7280] hover:text-[#f5c518] transition-colors flex items-center justify-center"
                  >
                    <PanelLeftOpen className="w-3.5 h-3.5" />
                  </button>
                </SimpleTooltip>
              </div>
            )}

            {/* Right collapsed toggle - inside viewport so it sits at viewport edge */}
            {mainNav === 'workspace' && !isRightPanelOpen && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 z-20">
                <SimpleTooltip label="Open Right Panel">
                  <button
                    onClick={() => setIsRightPanelOpen(true)}
                    className="w-6 h-14 rounded-l-lg bg-[#16181f] border border-r-0 border-[#272b36] text-[#6b7280] hover:text-[#f5c518] transition-colors flex items-center justify-center"
                  >
                    <PanelRightOpen className="w-3.5 h-3.5" />
                  </button>
                </SimpleTooltip>
              </div>
            )}
          </main>

          <AnimatePresence initial={false}>
            {mainNav === 'workspace' && isRightPanelOpen && (
              <motion.aside
                id="right-inspector-assets-column"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="w-72 h-full bg-[var(--ws-panel,#101115)] border-l border-[var(--ws-border,#21242c)] flex flex-col flex-shrink-0 z-10 overflow-hidden"
              >
                <div className="h-8 px-2.5 flex items-center justify-between border-b border-[var(--ws-border,#21242c)] bg-[#0c0d12] flex-shrink-0">
                  <SimpleTooltip label="Collapse panel">
                    <button
                      onClick={() => setIsRightPanelOpen(false)}
                      className="p-1 rounded-md text-[#6b7280] hover:text-[#f5c518] hover:bg-[#1a1d26] transition-colors"
                    >
                      <PanelRightClose className="w-4 h-4" />
                    </button>
                  </SimpleTooltip>
                  <span className="text-[10px] font-bold tracking-wider text-[#9ca3af] uppercase">Inspector</span>
                </div>
                <div className="flex items-center p-0.5 bg-[var(--ws-tab-bar-bg,#0f1014)] border-b border-[var(--ws-border,#21242c)]">
                   <button id="tab-btn-assets" onClick={() => setRightPanelMode('assets')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${rightPanelMode === 'assets' ? 'bg-[var(--ws-tab-active-bg,#1c1f28)] text-[#f5c518] shadow-sm' : 'text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)]'}`}>
                     <FolderOpen className="w-3 h-3" /><span>Assets</span>
                   </button>
                   <button id="tab-btn-prompt" onClick={() => setRightPanelMode('prompt')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${rightPanelMode === 'prompt' ? 'bg-[var(--ws-tab-active-bg,#1c1f28)] text-[#f5c518] shadow-sm' : 'text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)]'}`}>
                     <span>Prompt</span>
                   </button>
                   <button id="tab-btn-properties" onClick={() => setRightPanelMode('properties')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${rightPanelMode === 'properties' || rightPanelMode === 'property' ? 'bg-[var(--ws-tab-active-bg,#1c1f28)] text-[#f5c518] shadow-sm' : 'text-[var(--ws-text-muted,#8e95a5)] hover:text-[var(--ws-text,#f3f4f6)]'}`}>
                     <Sliders className="w-3 h-3" /><span>Property</span>
                   </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  {rightPanelMode === 'assets' ? <RightAssetsPanel /> : rightPanelMode === 'prompt' ? <RightPromptPanel /> : <RightPropertyPanel />}
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
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
              className="absolute inset-0 z-[15] bg-[var(--ws-bg,#0d0e12)] overflow-auto pl-16"
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
              className="absolute inset-0 z-[15] bg-[var(--ws-bg,#0d0e12)] overflow-auto pl-16"
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
              className="absolute inset-0 z-[15] bg-[var(--ws-bg,#0d0e12)] overflow-auto pl-16"
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
