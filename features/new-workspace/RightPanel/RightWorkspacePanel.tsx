import React, { useEffect } from 'react';
import {
  Sliders,
  FolderOpen,
  Activity,
  PanelRightClose
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';
import { AnimatedTabs } from '@/components/animate-ui';

// Import panels
import { RightPropertyPanel } from './RightPropertyPanel';
import { RightAssetsPanel } from './RightAssetsPanel';
import { LiveExecutionPanel } from './LiveExecutionPanel';

export const RightWorkspacePanel: React.FC = () => {
  const {
    rightPanelMode,
    setRightPanelMode,
    setIsRightPanelOpen,
    isExecuting,
    activeTask
  } = useWorkspace();

  const isRunning = isExecuting || activeTask?.status === 'running' || activeTask?.status === 'queued';

  // Context-aware auto-switching per Rule #3 & #6:
  // When generation starts running -> switch to live execution
  useEffect(() => {
    if (isRunning) {
      if (rightPanelMode !== 'prompt') {
        setRightPanelMode('prompt');
      }
    }
  }, [isRunning, rightPanelMode, setRightPanelMode]);

  // When task completes -> switch to properties inspector so user can immediately view & export
  useEffect(() => {
    if (activeTask?.status === 'completed') {
      setRightPanelMode('properties');
    }
  }, [activeTask?.status, setRightPanelMode]);

  const currentActiveTab =
    rightPanelMode === 'prompt' && isRunning
      ? 'prompt'
      : rightPanelMode === 'assets'
      ? 'assets'
      : 'properties';

  return (
    <div className="flex flex-col h-full w-full bg-[hsl(var(--surface-1))] text-xs select-none overflow-hidden">
      {/* Top Segmented Header (Clean Technical Inspector Navigation) */}
      <div className="h-10 px-2.5 flex items-center justify-between border-b border-white/[0.08] bg-[hsl(var(--surface-1))] flex-shrink-0">
        <div className="flex-1 min-w-0 mr-2">
          <AnimatedTabs
            size="sm"
            className="w-full p-0.5 bg-[hsl(var(--surface-0))] border-white/[0.06]"
            activeTab={currentActiveTab}
            onChange={(tab) => setRightPanelMode(tab as any)}
            tabs={[
              ...(isRunning ? [{ id: 'prompt', label: 'Executing', icon: Activity }] : []),
              { id: 'properties', label: 'Properties', icon: Sliders },
              { id: 'assets', label: 'Assets', icon: FolderOpen },
            ]}
            activeIndicatorClassName="bg-[hsl(var(--surface-2))] border-white/[0.1]"
            activeTabClassName="text-white font-bold"
          />
        </div>

        {/* Collapse Panel Button */}
        <SimpleTooltip label="Collapse panel (maximize 3D viewer)" side="left">
          <button
            type="button"
            onClick={() => setIsRightPanelOpen(false)}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-[hsl(var(--surface-2))] transition-colors cursor-pointer flex-shrink-0"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </SimpleTooltip>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 overflow-hidden bg-[hsl(var(--surface-1))]">
        {rightPanelMode === 'prompt' ? (
          <LiveExecutionPanel />
        ) : rightPanelMode === 'assets' ? (
          <RightAssetsPanel />
        ) : (
          <RightPropertyPanel />
        )}
      </div>
    </div>
  );
};
