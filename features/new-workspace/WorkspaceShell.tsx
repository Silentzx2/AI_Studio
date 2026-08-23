'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
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
import { NodesPanel } from './Panels/NodesPanel';
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
import { FolderOpen, Sliders } from 'lucide-react';
import type { ToolType } from './types';

const ROUTE_TO_TOOL: Record<string, ToolType> = {
  '/workspace': 'model',
  '/workspace/generate': 'model',
  '/workspace/pre-process': 'image',
  '/workspace/segment': 'segment',
  '/workspace/retopo': 'retopo',
  '/workspace/remesh': 'remesh',
  '/workspace/texture': 'texture',
  '/workspace/edit': 'edit',
  '/workspace/upscale': 'upscale',
  '/workspace/pbr': 'pbr',
  '/workspace/animate': 'animate',
  '/workspace/rigging': 'rigging',
  '/workspace/nodes': 'nodes',
};

const TOOL_TO_ROUTE: Record<ToolType, string> = {
  model: '/workspace/generate',
  image: '/workspace/pre-process',
  segment: '/workspace/segment',
  retopo: '/workspace/retopo',
  remesh: '/workspace/remesh',
  texture: '/workspace/texture',
  edit: '/workspace/edit',
  upscale: '/workspace/upscale',
  pbr: '/workspace/pbr',
  animate: '/workspace/animate',
  rigging: '/workspace/rigging',
  nodes: '/workspace/nodes',
};

export const WorkspaceShell: React.FC = () => {
  const pathname = usePathname();

  const {
    mainNav, setMainNav, activeTool, setActiveTool,
    rightPanelMode, setRightPanelMode,
    isLeftPanelOpen, isRightPanelOpen,
  } = useWorkspace();

  useEffect(() => {
    const pathnameLower = pathname?.toLowerCase() ?? '';
    if (pathnameLower === '/dashboard' || pathnameLower === '/') {
      if (mainNav !== 'dashboard') setMainNav('dashboard');
      return;
    }
    if (pathnameLower === '/outputs' || pathnameLower === '/assets') {
      if (mainNav !== 'assets') setMainNav('assets');
      return;
    }
    if (pathnameLower === '/system') {
      if (mainNav !== 'system') setMainNav('system');
      return;
    }
    if (mainNav !== 'workspace') setMainNav('workspace');
    const matchedTool = ROUTE_TO_TOOL[pathnameLower] || 'model';
    if (matchedTool !== activeTool) setActiveTool(matchedTool);
  }, [pathname]);

  const renderToolPanel = () => {
    switch (activeTool) {
      case 'image': return <SecondaryPanel tool="image" />;
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
    <div id="forge3d-app-root" className="flex flex-col h-screen w-screen overflow-hidden bg-[#0d0e12] text-[#f3f4f6]">
      <TopHeader />
      <div className="flex flex-1 overflow-hidden relative">
        <LeftNavigation />
        {mainNav === 'dashboard' ? (
          <StudioDashboard />
        ) : mainNav === 'assets' ? (
          <OutputsPage />
        ) : mainNav === 'system' ? (
          <SystemPage />
        ) : (
          <div className="flex flex-1 overflow-hidden relative">
            {activeTool !== 'nodes' && isLeftPanelOpen && (
              <aside id="context-tool-panel-container" className="w-80 h-full bg-[#101115] border-r border-[#21242c] flex flex-col flex-shrink-0 z-10 overflow-hidden">
                {renderToolPanel()}
              </aside>
            )}
            <main id="center-viewport-stage" className="flex-1 h-full relative overflow-hidden bg-[#0a0b0e]">
              <MeshViewer />
              {activeTool === 'nodes' && (
                <div className="absolute inset-0 z-30 bg-[#0a0b0e]/96">
                  <NodesPanel />
                </div>
              )}
            </main>
            {activeTool !== 'nodes' && isRightPanelOpen && (
              <aside id="right-inspector-assets-column" className="w-80 h-full bg-[#101115] border-l border-[#21242c] flex flex-col flex-shrink-0 z-10 overflow-hidden">
                <div className="flex items-center p-1 bg-[#0f1014] border-b border-[#21242c]">
                  <button id="tab-btn-assets" onClick={() => setRightPanelMode('assets')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${rightPanelMode === 'assets' ? 'bg-[#1c1f28] text-[#f5c518] shadow-sm' : 'text-[#8e95a5] hover:text-[#e5e7eb]'}`}>
                    <FolderOpen className="w-3.5 h-3.5" /><span>Assets</span>
                  </button>
                  <button id="tab-btn-prompt" onClick={() => setRightPanelMode('prompt')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${rightPanelMode === 'prompt' ? 'bg-[#1c1f28] text-[#f5c518] shadow-sm' : 'text-[#8e95a5] hover:text-[#e5e7eb]'}`}>
                    <span>Prompt</span>
                  </button>
                  <button id="tab-btn-properties" onClick={() => setRightPanelMode('properties')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${rightPanelMode === 'properties' || rightPanelMode === 'property' ? 'bg-[#1c1f28] text-[#f5c518] shadow-sm' : 'text-[#8e95a5] hover:text-[#e5e7eb]'}`}>
                    <Sliders className="w-3.5 h-3.5" /><span>Property</span>
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  {rightPanelMode === 'assets' ? <RightAssetsPanel /> : rightPanelMode === 'prompt' ? <RightPromptPanel /> : <RightPropertyPanel />}
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
      <ProgressOverlay />
      <SettingsModal />
      <DccBridgeModal />
      <ExportModal />
    </div>
  );
};

export default WorkspaceShell;
