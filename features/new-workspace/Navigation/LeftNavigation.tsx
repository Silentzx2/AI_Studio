import React from 'react';
import {
  Box,
  Hexagon,
  Scissors,
  Layers,
  Activity,
  Settings,
  Sparkles,
  LayoutDashboard,
  Globe
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useWorkspace } from '../store/WorkspaceContext';
import { ToolType } from '../types';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

export const LeftNavigation: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const {
    activeTool,
    mainNav,
    navigateToTool,
    navigateToMainNav,
  } = useWorkspace();

  const handleToolClick = (tool: ToolType) => {
    navigateToTool(tool);
  };

  return (
    <nav
      id="left-tool-rail"
      aria-label="3D Studio Toolset"
      className="w-[4.2rem] h-full bg-[var(--ws-nav-bg,hsl(var(--surface-0)))] border-r border-[var(--ws-border,hsl(var(--border)))] flex flex-col items-center py-2 justify-between z-20 select-none flex-shrink-0"
    >
      {/* Top Primary Toolset */}
      <div className="flex flex-col items-center gap-1 w-full px-1 overflow-y-auto overflow-x-hidden">
        {/* 1. Dashboard / Overview */}
        <SimpleTooltip label="Dashboard & Model Overview">
          <button
            id="tool-btn-dashboard"
            onClick={() => navigateToMainNav('dashboard')}
            className={`group relative w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
              mainNav === 'dashboard'
                ? 'bg-[var(--ws-active-bg,hsl(var(--surface-2)))] text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/50 shadow-lg shadow-[hsl(var(--primary))]/15 ring-1 ring-[hsl(var(--primary))]/30'
                : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))]'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 mb-0.5" />
            <span className="text-[9.5px] font-bold leading-tight text-center">Overview</span>
          </button>
        </SimpleTooltip>

        {/* 2. 3D Model Generation (Unified Text-to-3D & Image-to-3D) */}
        <SimpleTooltip label="3D Generator (Text-to-3D & Image-to-3D AI Models)">
          <button
            id="tool-btn-model"
            onClick={() => handleToolClick('model')}
            className={`group relative w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
              mainNav === 'workspace' && activeTool === 'model'
                ? 'bg-[var(--ws-active-bg,hsl(var(--surface-2)))] text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/50 shadow-lg shadow-[hsl(var(--primary))]/15 ring-1 ring-[hsl(var(--primary))]/30'
                : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))]'
            }`}
          >
            <div className="relative">
              <Box className="w-5 h-5 mb-0.5" />
              <Sparkles className="w-2.5 h-2.5 text-[hsl(var(--primary))] absolute -top-1 -right-2" />
            </div>
            <span className="text-[9.5px] font-bold leading-tight text-center">3D Gen</span>

            {/* SOTA Badge */}
            <span className="mt-0.5 px-1 py-0.2 rounded bg-[hsl(var(--primary))]/20 text-[7px] font-mono font-bold text-[hsl(var(--primary))] tracking-tight">
              AI 3D
            </span>
          </button>
        </SimpleTooltip>

        {/* 3. WorldGen */}
        <SimpleTooltip label="WorldGen — Environment & World Generation">
          <button
            id="tool-btn-worldgen"
            onClick={() => router.push('/workspace/worldgen')}
            className={`w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
              pathname?.startsWith('/workspace/worldgen')
                ? 'bg-[var(--ws-active-bg,hsl(var(--surface-2)))] text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/30 shadow-lg shadow-[hsl(var(--primary))]/10'
                : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))]'
            }`}
          >
            <Globe className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] font-medium leading-none">World</span>
          </button>
        </SimpleTooltip>

        {/* 4. Segmentation */}
        <SimpleTooltip label="Segment 3D Mesh">
          <button
            id="tool-btn-segment"
            onClick={() => handleToolClick('segment')}
            className={`w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
              mainNav === 'workspace' && activeTool === 'segment'
                ? 'bg-[var(--ws-active-bg,hsl(var(--surface-2)))] text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/30 shadow-lg shadow-[hsl(var(--primary))]/10'
                : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))]'
            }`}
          >
            <Scissors className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] font-medium leading-none">Segment</span>
          </button>
        </SimpleTooltip>

        {/* 5. Retopo */}
        <SimpleTooltip label="Retopology">
          <button
            id="tool-btn-retopo"
            onClick={() => handleToolClick('retopo')}
            className={`w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
              mainNav === 'workspace' && (activeTool === 'retopo' || activeTool === 'remesh')
                ? 'bg-[var(--ws-active-bg,hsl(var(--surface-2)))] text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/30 shadow-lg shadow-[hsl(var(--primary))]/10'
                : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))]'
            }`}
          >
            <Hexagon className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] font-medium leading-none">Retopo</span>
          </button>
        </SimpleTooltip>

        {/* 6. Remesh */}
        <SimpleTooltip label="Remesh">
          <button
            id="tool-btn-remesh"
            onClick={() => handleToolClick('remesh')}
            className={`w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
              mainNav === 'workspace' && activeTool === 'remesh'
                ? 'bg-[var(--ws-active-bg,hsl(var(--surface-2)))] text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/30 shadow-lg shadow-[hsl(var(--primary))]/10'
                : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))]'
            }`}
          >
            <Hexagon className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] font-medium leading-none">Remesh</span>
          </button>
        </SimpleTooltip>

        {/* 7. Texture / PBR Maps */}
        <SimpleTooltip label="Texture & PBR Materials">
          <button
            id="tool-btn-texture"
            onClick={() => handleToolClick('texture')}
            className={`w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
              mainNav === 'workspace' && (activeTool === 'texture' || activeTool === 'pbr')
                ? 'bg-[var(--ws-active-bg,hsl(var(--surface-2)))] text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/30 shadow-lg shadow-[hsl(var(--primary))]/10'
                : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))]'
            }`}
          >
            <Layers className="w-4 h-4 mb-0.5" />
            <span className="text-[9px] font-medium leading-none">Texture</span>
          </button>
        </SimpleTooltip>

        {/* Bottom Pipeline & Settings */}
      </div>
      <div className="flex flex-col items-center gap-1.5 w-full px-1.5 pt-2 border-t border-[var(--ws-border,hsl(var(--border)))]">
        {/* Settings - navigates to /settings page */}
        <SimpleTooltip label="Settings & Configuration">
          <button
            id="tool-btn-settings"
            onClick={() => router.push('/settings')}
            className="w-full p-2 flex flex-col items-center justify-center rounded-xl text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))] transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </SimpleTooltip>
      </div>
    </nav>
  );
};
