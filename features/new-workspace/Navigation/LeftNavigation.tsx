import React from 'react';
import {
  LayoutDashboard,
  Box,
  Scissors,
  CircleDashed,
  Layers,
  Settings,
  Pencil,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../store/WorkspaceContext';
import { ToolType } from '../types';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

interface LeftNavigationProps {
  /** When true, renders as a wide drawer with full labels instead of icon rail */
  isMobileDrawer?: boolean;
  /** Callback after a tool is selected in mobile drawer (closes drawer) */
  onToolSelect?: () => void;
}

export const LeftNavigation: React.FC<LeftNavigationProps> = ({ isMobileDrawer = false, onToolSelect }) => {
  const router = useRouter();
  const {
    activeTool,
    mainNav,
    navigateToTool,
    navigateToMainNav,
  } = useWorkspace();

  const handleToolClick = (tool: ToolType) => {
    navigateToTool(tool);
    onToolSelect?.();
  };

  const handleMainNavClick = (nav: 'dashboard' | 'assets' | 'system') => {
    navigateToMainNav(nav);
    onToolSelect?.();
  };

  const isActive = (tool: ToolType) => mainNav === 'workspace' && activeTool === tool;
  const isOverviewActive = mainNav === 'dashboard';

  // Mobile drawer: wide list with full labels
  if (isMobileDrawer) {
    return (
      <nav
        id="left-tool-rail-mobile"
        aria-label="3D Studio Toolset"
        className="h-full bg-[#0D0E10] flex flex-col select-none overflow-y-auto"
      >
        <div className="flex-1 w-full py-2 px-2 space-y-1">
          <MobileNavItem
            id="tool-btn-overview"
            icon={<LayoutDashboard className="w-4 h-4" />}
            label="Studio Overview"
            active={isOverviewActive}
            onClick={() => handleMainNavClick('dashboard')}
          />
          <div className="h-px bg-white/[0.08] my-1" />
          <MobileNavItem
            id="tool-btn-model"
            icon={<Box className="w-4 h-4" />}
            label="3D Model Generation"
            active={isActive('model')}
            onClick={() => handleToolClick('model')}
          />
          <MobileNavItem
            id="tool-btn-remesh"
            icon={<CircleDashed className="w-4 h-4" />}
            label="Quad Remesh (Poly)"
            active={isActive('remesh')}
            onClick={() => handleToolClick('remesh')}
          />
          <MobileNavItem
            id="tool-btn-texture"
            icon={<Layers className="w-4 h-4" />}
            label="PBR Texture Maps"
            active={isActive('texture')}
            onClick={() => handleToolClick('texture')}
          />
          <MobileNavItem
            id="tool-btn-segment"
            icon={<Scissors className="w-4 h-4" />}
            label="Mesh Segmentation"
            active={isActive('segment')}
            onClick={() => handleToolClick('segment')}
          />
          <MobileNavItem
            id="tool-btn-edit"
            icon={<Pencil className="w-4 h-4" />}
            label="Sculpt / Edit"
            active={isActive('edit')}
            onClick={() => handleToolClick('edit')}
          />
        </div>
        <div className="px-2 py-2 border-t border-white/[0.08]">
          <MobileNavItem
            id="tool-btn-settings"
            icon={<Settings className="w-4 h-4" />}
            label="Settings"
            active={false}
            onClick={() => { router.push('/settings'); onToolSelect?.(); }}
          />
        </div>
      </nav>
    );
  }

  // Desktop: original icon rail (unchanged)
  return (
    <nav
      id="left-tool-rail"
      aria-label="3D Studio Toolset"
      className="w-[58px] h-full bg-[#0D0E10] border-r border-white/[0.08] flex flex-col items-center justify-between z-20 select-none flex-shrink-0"
    >
      {/* Tool Stack (AI 3D Studio Toolset) */}
      <div className="flex-1 w-full flex flex-col items-center gap-1 px-1 py-1.5 overflow-y-auto overflow-x-hidden scrollbar-none">
        {/* 0. Studio Overview */}
        <SimpleTooltip side="right" label="Studio Overview (Dashboard & Hardware)">
          <button
            id="tool-btn-overview"
            onClick={() => navigateToMainNav('dashboard')}
            className={`group relative w-full h-[45px] py-1 px-0.5 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer flex-shrink-0 ${
              isOverviewActive
                ? 'bg-[#F9CF00] text-black font-extrabold shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-[#191A1D]'
            }`}
          >
            <LayoutDashboard className="w-[17px] h-[17px] mb-0.5 flex-shrink-0" />
            <span className="text-[8.5px] font-extrabold leading-none text-center tracking-tight truncate w-full px-0.5">Overview</span>
          </button>
        </SimpleTooltip>

        <div className="w-6 h-px bg-white/[0.08] my-0.5 flex-shrink-0" />

        {/* 1. 3D Model Generation */}
        <SimpleTooltip side="right" label="3D Model Generation (Image & Text to 3D)">
          <button
            id="tool-btn-model"
            onClick={() => handleToolClick('model')}
            className={`group relative w-full h-[45px] py-1 px-0.5 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer flex-shrink-0 ${
              isActive('model')
                ? 'bg-[#F9CF00] text-black font-extrabold shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-[#191A1D]'
            }`}
          >
            <Box className="w-[17px] h-[17px] mb-0.5 flex-shrink-0" />
            <span className="text-[8.5px] font-extrabold leading-none text-center tracking-tight truncate w-full px-0.5">Model</span>
          </button>
        </SimpleTooltip>

        {/* 2. Quad Remesh (Poly) */}
        <SimpleTooltip side="right" label="Retopology / Quad Remesh (Poly)">
          <button
            id="tool-btn-remesh"
            onClick={() => handleToolClick('remesh')}
            className={`w-full h-[45px] py-1 px-0.5 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer flex-shrink-0 ${
              isActive('remesh')
                ? 'bg-[#F9CF00] text-black font-extrabold shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-[#191A1D]'
            }`}
          >
            <CircleDashed className="w-[17px] h-[17px] mb-0.5 flex-shrink-0" />
            <span className="text-[8.5px] font-extrabold leading-none text-center tracking-tight truncate w-full px-0.5">Poly</span>
          </button>
        </SimpleTooltip>

        {/* 3. Texture / PBR Maps */}
        <SimpleTooltip side="right" label="PBR Texture Maps Generation">
          <button
            id="tool-btn-texture"
            onClick={() => handleToolClick('texture')}
            className={`w-full h-[45px] py-1 px-0.5 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer flex-shrink-0 ${
              isActive('texture')
                ? 'bg-[#F9CF00] text-black font-extrabold shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-[#191A1D]'
            }`}
          >
            <Layers className="w-[17px] h-[17px] mb-0.5 flex-shrink-0" />
            <span className="text-[8.5px] font-extrabold leading-none text-center tracking-tight truncate w-full px-0.5">Texture</span>
          </button>
        </SimpleTooltip>

        {/* 4. Segment */}
        <SimpleTooltip side="right" label="Mesh Segmentation / Part Separation">
          <button
            id="tool-btn-segment"
            onClick={() => handleToolClick('segment')}
            className={`w-full h-[45px] py-1 px-0.5 flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer flex-shrink-0 ${
              isActive('segment')
                ? 'bg-[#F9CF00] text-black font-extrabold shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-[#191A1D]'
            }`}
          >
            <Scissors className="w-[17px] h-[17px] mb-0.5 flex-shrink-0" />
            <span className="text-[8.5px] font-extrabold leading-none text-center tracking-tight truncate w-full px-0.5">Segment</span>
          </button>
        </SimpleTooltip>
      </div>

      {/* Bottom Settings */}
      <div className="flex flex-col items-center w-full px-1 py-1.5 border-t border-white/[0.08] flex-shrink-0">
        <SimpleTooltip side="right" label="Workspace Settings">
          <button
            id="tool-btn-settings"
            onClick={() => router.push('/settings')}
            className="w-full h-[45px] py-1 px-0.5 flex flex-col items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-[#191A1D] transition-colors cursor-pointer flex-shrink-0"
          >
            <Settings className="w-[17px] h-[17px] mb-0.5 flex-shrink-0" />
            <span className="text-[8.5px] font-extrabold leading-none text-center tracking-tight truncate w-full px-0.5">Settings</span>
          </button>
        </SimpleTooltip>
      </div>
    </nav>
  );
};

/** Internal component for mobile drawer nav items */
const MobileNavItem: React.FC<{
  id: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ id, icon, label, active, onClick }) => (
  <button
    id={id}
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
      active
        ? 'bg-[#F9CF00] text-black font-extrabold'
        : 'text-zinc-300 hover:text-white hover:bg-[#191A1D]'
    }`}
  >
    <span className="flex-shrink-0">{icon}</span>
    <span className="text-sm font-semibold truncate">{label}</span>
  </button>
);