'use client';

import React, { useEffect, useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
    const TexturePanel = dynamic(() => import('./Panels/TexturePanel').then(mod => mod.TexturePanel), { ssr: false });
const RemeshPanel = dynamic(() => import('./Panels/RemeshPanel').then(mod => mod.RemeshPanel), { ssr: false });
const SecondaryPanel = dynamic(() => import('./Panels/SecondaryPanels').then(mod => mod.SecondaryPanel), { ssr: false });

const RightWorkspacePanel = dynamic(() => import('./RightPanel/RightWorkspacePanel').then(mod => mod.RightWorkspacePanel), { ssr: false });

const OutputsPage = dynamic(() => import('./Dashboard/OutputsPage').then(mod => mod.OutputsPage), { ssr: false });
const SystemPage = dynamic(() => import('./Dashboard/SystemPage').then(mod => mod.SystemPage), { ssr: false });
const StudioDashboard = dynamic(() => import('./Dashboard/StudioDashboard').then(mod => mod.StudioDashboard), { ssr: false });

const ExportModal = dynamic(() => import('./Modals/ExportModal').then(mod => mod.ExportModal), { ssr: false });
const SettingsModal = dynamic(() => import('./Modals/SettingsModal').then(mod => mod.SettingsModal), { ssr: false });
const DccBridgeModal = dynamic(() => import('./Modals/DccBridgeModal').then(mod => mod.DccBridgeModal), { ssr: false });
import { FolderOpen, Sliders, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Menu, X } from 'lucide-react';
import type { ToolType } from './types';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

const ROUTE_SEGMENT_TO_TOOL: Record<string, ToolType> = {
'generate': 'model',
    'model': 'model',
    '3d-gen': 'model',
    'remesh': 'remesh',
  'texture': 'texture',
  'textures': 'texture',
  'edit': 'edit',
  'upscale': 'upscale',
  'pbr': 'pbr',
};

export const WorkspaceShell: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();

  const {
    mainNav, setMainNav, activeTool, setActiveTool,
    rightPanelMode, setRightPanelMode,
    isLeftPanelOpen, isRightPanelOpen,
    setIsLeftPanelOpen, setIsRightPanelOpen,
  } = useWorkspace();

  // Mobile menu state: left navigation drawer
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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

  // Close mobile nav on tool change
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [activeTool]);

  // Redirect / to /workspace/overview
  useEffect(() => {
    if (pathname === '/') {
      router.replace('/workspace/overview');
    }
  }, [pathname, router]);

  const renderToolPanel = () => {
    switch (activeTool) {
      case 'model': return <GeneratePanel />;
      case 'remesh': return <RemeshPanel />;
      case 'texture': return <TexturePanel />;
      case 'segment': case 'edit': case 'upscale': case 'pbr': return <SecondaryPanel tool={activeTool} />;
      default: return <GeneratePanel />;
    }
  };

  return (
    <div id="forge3d-app-root" className="flex flex-col h-screen w-screen overflow-hidden bg-[#0D0E10] text-[#E0E2E8]">
      <div className="flex-shrink-0 relative z-50">
        <TopHeader onMobileMenuToggle={() => setIsMobileNavOpen(!isMobileNavOpen)} isMobileNavOpen={isMobileNavOpen} />
      </div>
      <div className="flex flex-1 overflow-hidden relative bg-[#121418]">
        {/* Left tool rail - desktop: docked | mobile: hidden (drawer used instead) */}
        <div className="z-30 h-full flex-shrink-0 relative hidden md:block">
          <LeftNavigation />
        </div>

        {/* Mobile navigation drawer overlay */}
        <AnimatePresence>
          {isMobileNavOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileNavOpen(false)}
                className="fixed inset-0 bg-black/60 z-40 md:hidden"
              />
              {/* Drawer */}
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="fixed left-0 top-0 bottom-0 w-[260px] max-w-[85vw] z-50 md:hidden"
              >
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between px-3 py-3 bg-[#0D0E10] border-b border-white/[0.08]">
                    <span className="font-extrabold text-xs tracking-wider text-white uppercase">Tools</span>
                    <button
                      onClick={() => setIsMobileNavOpen(false)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#191A1D] transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto bg-[#0D0E10]">
                    <LeftNavigation isMobileDrawer onToolSelect={() => setIsMobileNavOpen(false)} />
                  </div>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Center Workspace & 3D Stage */}
        <div className="flex-1 h-full relative overflow-hidden min-w-0">
          {/* Continuous Full-Bleed 3D Viewport in Background */}
          {mainNav === 'workspace' && (
            <main id="center-viewport-stage" className="absolute inset-0 z-0 overflow-hidden bg-[#16181D]">
              <MeshViewer />
            </main>
          )}

          {/* Floating Context Tool Panel (Left) - Tripo Style ~264px desktop | full-screen mobile */}
          <AnimatePresence initial={false}>
            {mainNav === 'workspace' && isLeftPanelOpen && (
              <motion.aside
                id="context-tool-panel-container"
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="absolute inset-0 md:inset-auto md:left-2 md:top-2 md:bottom-2 md:w-[320px] md:max-w-[calc(100vw-5rem)] bg-[#191A1D] md:border md:border-white/[0.1] md:rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex flex-col z-20 overflow-hidden"
              >
                {/* Mobile panel header with close button */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08] bg-[#16181D] md:hidden flex-shrink-0">
                  <span className="font-bold text-xs text-white">Tool Panel</span>
                  <button
                    onClick={() => setIsLeftPanelOpen(false)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-[#F9CF00] hover:bg-[#202125] transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-hidden relative">
                  {/* Floating Collapse Button - desktop only */}
                  <div className="absolute top-2 right-2 z-20 hidden md:block">
                    <SimpleTooltip label="Collapse panel" side="left">
                      <button
                        onClick={() => setIsLeftPanelOpen(false)}
                        className="p-1 rounded-lg bg-[#202125] border border-white/[0.08] text-zinc-400 hover:text-[#F9CF00] hover:bg-[#28292E] transition-all cursor-pointer"
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

          {/* Left collapsed toggle button - hidden on mobile (use hamburger menu instead) */}
          {mainNav === 'workspace' && !isLeftPanelOpen && (
            <div className="absolute left-0.5 top-1/2 -translate-y-1/2 z-20 hidden md:block">
              <SimpleTooltip label="Open Tool Panel">
                <button
                  onClick={() => setIsLeftPanelOpen(true)}
                  className="w-5 h-11 rounded-r-lg bg-[#191A1D]/90 backdrop-blur-md border border-l-0 border-white/[0.1] text-zinc-400 hover:text-[#F9CF00] hover:border-[#F9CF00]/40 hover:bg-[#202227] transition-all flex items-center justify-center shadow-xl cursor-pointer active:scale-95"
                >
                  <PanelLeftOpen className="w-3.5 h-3.5" />
                </button>
              </SimpleTooltip>
            </div>
          )}

          {/* Mobile: floating action button to open tool panel */}
          {mainNav === 'workspace' && !isLeftPanelOpen && (
            <button
              onClick={() => setIsLeftPanelOpen(true)}
              className="md:hidden absolute left-3 bottom-3 z-20 w-12 h-12 rounded-full bg-[#F9CF00] text-black shadow-lg flex items-center justify-center hover:bg-[#ffe033] transition-colors"
              aria-label="Open tool panel"
            >
              <Sliders className="w-5 h-5" />
            </button>
          )}

          {/* Floating Context-Aware Control & Property Panel (Right) */}
          <AnimatePresence initial={false}>
            {mainNav === 'workspace' && isRightPanelOpen && (
              <motion.aside
                id="right-inspector-assets-column"
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="absolute inset-0 md:inset-auto md:right-2 md:top-2 md:bottom-2 md:w-[320px] md:max-w-[calc(100vw-4.5rem)] bg-[#14161A] md:border md:border-white/[0.08] md:rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex flex-col z-20 overflow-hidden"
              >
                <RightWorkspacePanel />
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Right collapsed toggle button - hidden on mobile */}
          {mainNav === 'workspace' && !isRightPanelOpen && (
            <div className="absolute right-0.5 top-1/2 -translate-y-1/2 z-20 hidden md:block">
              <SimpleTooltip label="Open Asset Store / Inspector">
                <button
                  onClick={() => setIsRightPanelOpen(true)}
                  className="w-5 h-11 rounded-l-lg bg-[#191A1D]/90 backdrop-blur-md border border-r-0 border-white/[0.1] text-zinc-400 hover:text-[#F9CF00] hover:border-[#F9CF00]/40 hover:bg-[#202227] transition-all flex items-center justify-center shadow-xl cursor-pointer active:scale-95"
                >
                  <PanelRightOpen className="w-3.5 h-3.5" />
                </button>
              </SimpleTooltip>
            </div>
          )}

          {/* Mobile: floating action button to open asset panel */}
          {mainNav === 'workspace' && !isRightPanelOpen && (
            <button
              onClick={() => setIsRightPanelOpen(true)}
              className="md:hidden absolute right-3 bottom-3 z-20 w-12 h-12 rounded-full bg-[#191A1D] border border-white/[0.08] shadow-lg flex items-center justify-center text-zinc-400 hover:text-[#F9CF00] transition-colors"
              aria-label="Open asset panel"
            >
              <FolderOpen className="w-5 h-5" />
            </button>
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
              className="absolute inset-0 left-0 md:left-[58px] z-[15] bg-[#0D0E10] overflow-auto flex flex-col"
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
              className="absolute inset-0 left-0 md:left-[58px] z-[15] bg-[#0D0E10] overflow-auto flex flex-col"
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
              className="absolute inset-0 left-0 md:left-[58px] z-[15] bg-[#0D0E10] overflow-auto flex flex-col"
            >
              <SystemPage />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <SettingsModal />
      <DccBridgeModal />
      <ExportModal />
    </div>
  );
};

export default WorkspaceShell;
