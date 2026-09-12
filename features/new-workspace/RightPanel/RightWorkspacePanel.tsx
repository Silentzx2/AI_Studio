import React, { useEffect } from 'react';
import {
  Sliders,
  FolderOpen,
  Wrench,
  Activity,
  PanelRightClose,
  Sparkles,
  Layers,
  CircleDashed,
  Box
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

// Import panels
import { GeneratePanel } from '../Panels/GeneratePanel';
import { TexturePanel } from '../Panels/TexturePanel';
import { RemeshPanel } from '../Panels/RemeshPanel';
import { SecondaryPanel } from '../Panels/SecondaryPanels';
import { RightPropertyPanel } from './RightPropertyPanel';
import { RightAssetsPanel } from './RightAssetsPanel';
import { LiveExecutionPanel } from './LiveExecutionPanel';

export const RightWorkspacePanel: React.FC = () => {
  const {
    activeTool,
    rightPanelMode,
    setRightPanelMode,
    setIsRightPanelOpen,
    isExecuting,
    activeTask,
    currentAsset
  } = useWorkspace();

  // Context-aware auto-switching per Rule #3 & #6:
  // When generation starts running -> switch to live execution
  useEffect(() => {
    if (isExecuting || activeTask?.status === 'running') {
      // Stay on execution view while running
      if (rightPanelMode !== 'prompt') {
        setRightPanelMode('prompt'); // 'prompt' tab in context acts as live execution
      }
    }
  }, [isExecuting, activeTask?.status, rightPanelMode, setRightPanelMode]);

  // When task completes -> switch to properties inspector so user can immediately view & export
  useEffect(() => {
    if (activeTask?.status === 'completed') {
      setRightPanelMode('properties');
    }
  }, [activeTask?.status, setRightPanelMode]);

  const renderActiveToolPanel = () => {
    switch (activeTool) {
      case 'model':
        return <GeneratePanel />;
      case 'remesh':
        return <RemeshPanel />;
      case 'texture':
        return <TexturePanel />;
      case 'segment':
      case 'edit':
      case 'upscale':
      case 'pbr':
        return <SecondaryPanel tool={activeTool} />;
      default:
        return <GeneratePanel />;
    }
  };

  const isRunning = isExecuting || activeTask?.status === 'running' || activeTask?.status === 'queued';

  return (
    <div className="flex flex-col h-full w-full bg-[#14161A] text-xs select-none overflow-hidden">
      {/* Top Segmented Header (Rule #3: Clean, Calm, Technical Navigation) */}
      <div className="h-10 px-2.5 flex items-center justify-between border-b border-white/[0.08] bg-[#16181D] flex-shrink-0">
        <div className="flex items-center gap-1 flex-1 min-w-0 mr-2 bg-[#101215] p-0.5 rounded-lg border border-white/[0.06]">
          {/* 1. Tool Controls Tab */}
          <button
            id="tab-btn-tool"
            type="button"
            onClick={() => setRightPanelMode('property')}
            className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
              rightPanelMode === 'property' || (!isRunning && rightPanelMode !== 'properties' && rightPanelMode !== 'assets')
                ? 'bg-[#22252D] text-white shadow-sm font-black'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Wrench className="w-3 h-3 text-[#F9CF00]" />
            <span className="truncate">Controls</span>
          </button>

          {/* 2. Live Execution Tab (highlighted when running) */}
          {isRunning ? (
            <button
              id="tab-btn-execution"
              type="button"
              onClick={() => setRightPanelMode('prompt')}
              className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                rightPanelMode === 'prompt'
                  ? 'bg-[#F9CF00] text-black shadow-sm font-black'
                  : 'bg-[#F9CF00]/15 text-[#F9CF00] animate-pulse border border-[#F9CF00]/30'
              }`}
            >
              <Activity className="w-3 h-3" />
              <span className="truncate">Executing</span>
            </button>
          ) : (
            /* 2b. Properties Tab (Active when model selected) */
            <button
              id="tab-btn-properties"
              type="button"
              onClick={() => setRightPanelMode('properties')}
              className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                rightPanelMode === 'properties'
                  ? 'bg-[#22252D] text-white shadow-sm font-black'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sliders className="w-3 h-3 text-emerald-400" />
              <span className="truncate">Properties</span>
            </button>
          )}

          {/* 3. Assets Tab */}
          <button
            id="tab-btn-assets"
            type="button"
            onClick={() => setRightPanelMode('assets')}
            className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
              rightPanelMode === 'assets'
                ? 'bg-[#22252D] text-white shadow-sm font-black'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FolderOpen className="w-3 h-3 text-sky-400" />
            <span className="truncate">Assets</span>
          </button>
        </div>

        {/* Collapse Panel Button */}
        <SimpleTooltip label="Collapse panel (maximize 3D viewer)" side="left">
          <button
            type="button"
            onClick={() => setIsRightPanelOpen(false)}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-[#202227] transition-colors cursor-pointer flex-shrink-0"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </SimpleTooltip>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 overflow-hidden bg-[#14161A]">
        {rightPanelMode === 'prompt' ? (
          <LiveExecutionPanel />
        ) : rightPanelMode === 'assets' ? (
          <RightAssetsPanel />
        ) : rightPanelMode === 'properties' ? (
          <RightPropertyPanel />
        ) : (
          renderActiveToolPanel()
        )}
      </div>
    </div>
  );
};
