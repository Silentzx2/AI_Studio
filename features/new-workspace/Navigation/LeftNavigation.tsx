import React from 'react';
import {
  Box,
  Hexagon,
  Layers,
  Settings,
  Sparkles,
  LayoutDashboard,
  Globe
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useWorkspace } from '../store/WorkspaceContext';
import { ToolType } from '../types';

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
      className="w-20 h-full bg-[hsl(var(--surface-0))] border-r border-[hsl(var(--border)/0.5)] flex flex-col items-center py-2 justify-between z-20 select-none flex-shrink-0"
    >
      {/* Top Primary Toolset */}
      <div className="flex flex-col items-stretch gap-1 w-full px-1.5 overflow-y-auto overflow-x-hidden">
        {/* 1. Dashboard / Overview */}
        <button
          id="tool-btn-dashboard"
          onClick={() => navigateToMainNav('dashboard')}
          className={`group relative w-full py-2 flex flex-col items-center justify-center rounded-lg transition-all box-border ${
            mainNav === 'dashboard'
              ? 'bg-[#F9CF00]/10 text-[#F9CF00] border border-[#F9CF00]/40'
              : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-1))]'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 mb-0.5" />
          <span className="text-[8px] font-bold leading-tight text-center">Overview</span>
        </button>

        {/* 2. 3D Model Generation */}
        <button
          id="tool-btn-model"
          onClick={() => handleToolClick('model')}
          className={`group relative w-full py-2 flex flex-col items-center justify-center rounded-lg transition-all box-border ${
            mainNav === 'workspace' && activeTool === 'model'
              ? 'bg-[#F9CF00]/10 text-[#F9CF00] border border-[#F9CF00]/40'
              : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))]'
          }`}
        >
          <div className="relative">
            <Box className="w-4 h-4 mb-0.5" />
            <Sparkles className="w-2 h-2 text-[#F9CF00] absolute -top-1 -right-1.5" />
          </div>
          <span className="text-[8px] font-bold leading-tight text-center">3D Gen</span>

          {/* SOTA Badge */}
          <span className="mt-0.5 px-1 py-0.2 rounded bg-[#F9CF00]/20 text-[6px] font-mono font-bold text-[#F9CF00] tracking-tight">
            AI 3D
          </span>
        </button>

        {/* 3. WorldGen */}
        <button
          id="tool-btn-worldgen"
          onClick={() => handleToolClick('worldgen')}
          className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition-all box-border ${
            mainNav === 'workspace' && activeTool === 'worldgen'
              ? 'bg-[#F9CF00]/10 text-[#F9CF00] border border-[#F9CF00]/40'
              : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))]'
          }`}
        >
          <Globe className="w-4 h-4 mb-0.5" />
          <span className="text-[8px] font-medium leading-none">World</span>
        </button>

        {/* 4. Remesh */}
        <button
          id="tool-btn-remesh"
          onClick={() => handleToolClick('remesh')}
          className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition-all box-border ${
            mainNav === 'workspace' && activeTool === 'remesh'
              ? 'bg-[#F9CF00]/10 text-[#F9CF00] border border-[#F9CF00]/40'
              : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))]'
          }`}
        >
          <Hexagon className="w-4 h-4 mb-0.5" />
          <span className="text-[8px] font-medium leading-none">Remesh</span>
        </button>

        {/* 5. Texture / PBR Maps */}
        <button
          id="tool-btn-texture"
          onClick={() => handleToolClick('texture')}
          className={`w-full py-2 flex flex-col items-center justify-center rounded-lg transition-all box-border ${
            mainNav === 'workspace' && (activeTool === 'texture' || activeTool === 'pbr')
              ? 'bg-[#F9CF00]/10 text-[#F9CF00] border border-[#F9CF00]/40'
              : 'text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))]'
          }`}
        >
          <Layers className="w-4 h-4 mb-0.5" />
          <span className="text-[8px] font-medium leading-none">Texture</span>
        </button>

        {/* Bottom Pipeline & Settings */}
      </div>
      <div className="flex flex-col items-center gap-1.5 w-full px-1.5 pt-2 border-t border-[var(--ws-border,hsl(var(--border)/0.5))]">
        {/* Settings - navigates to /settings page */}
        <button
          id="tool-btn-settings"
          onClick={() => router.push('/settings')}
          className="w-full p-2 flex flex-col items-center justify-center rounded-lg text-[var(--ws-text-muted,hsl(var(--muted-foreground)))] hover:text-[var(--ws-text,hsl(var(--foreground)))] hover:bg-[var(--ws-hover-bg,hsl(var(--surface-1)))] transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
};