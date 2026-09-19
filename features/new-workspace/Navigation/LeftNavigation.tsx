import React from 'react';
import {
  LayoutDashboard,
  Box,
  Scissors,
  CircleDashed,
  Layers,
  Settings,
  Pencil,
  Film,
  FolderOpen,
  Activity,
  Cpu,
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useWorkspace } from '../store/WorkspaceContext';
import { ToolType } from '../types';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';
import { motion } from 'motion/react';

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

  const pathname = usePathname();
  const isActive = (tool: ToolType) => mainNav === 'workspace' && activeTool === tool;
  const isOverviewActive = mainNav === 'dashboard';
  const isAssetsActive = mainNav === 'assets';
  const isSystemActive = mainNav === 'system';
  const isComfyActive = pathname === '/comfyui';

  // Mobile drawer: wide list with full labels
  if (isMobileDrawer) {
    return (
      <nav
        id="left-tool-rail-mobile"
        aria-label="3D Studio Toolset"
        className="h-full bg-[hsl(var(--surface-0))] flex flex-col select-none overflow-y-auto"
      >
        <div className="flex-1 w-full py-2 px-2 space-y-1">
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Studio Views
          </div>
          <MobileNavItem
            id="tool-btn-overview"
            icon={<LayoutDashboard className="w-4 h-4" />}
            label="Studio Overview"
            active={isOverviewActive}
            onClick={() => handleMainNavClick('dashboard')}
          />
          <MobileNavItem
            id="tool-btn-assets"
            icon={<FolderOpen className="w-4 h-4" />}
            label="Assets & Outputs"
            active={isAssetsActive}
            onClick={() => handleMainNavClick('assets')}
          />
          <MobileNavItem
            id="tool-btn-system"
            icon={<Activity className="w-4 h-4" />}
            label="System & Telemetry"
            active={isSystemActive}
            onClick={() => handleMainNavClick('system')}
          />
          <MobileNavItem
            id="tool-btn-comfyui"
            icon={<Cpu className="w-4 h-4" />}
            label="ComfyUI Engine"
            active={isComfyActive}
            onClick={() => { router.push('/comfyui'); onToolSelect?.(); }}
          />
          <div className="h-px bg-white/[0.08] my-2" />
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            3D Generation Tools
          </div>
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
            id="tool-btn-animation"
            icon={<Film className="w-4 h-4" />}
            label="Animation & Rigging"
            active={isActive('animation')}
            onClick={() => handleToolClick('animation')}
          />
          <MobileNavItem
            id="tool-btn-segment"
            icon={<Scissors className="w-4 h-4" />}
            label="Mesh Segmentation"
            active={isActive('segment')}
            onClick={() => handleToolClick('segment')}
          />
        </div>
        <div className="px-2 py-2 border-t border-white/[0.08]">
          <MobileNavItem
            id="tool-btn-settings"
            icon={<Settings className="w-4 h-4" />}
            label="Admin & Settings"
            active={false}
            onClick={() => { router.push('/admin?tab=settings'); onToolSelect?.(); }}
          />
        </div>
      </nav>
    );
  }

  // Desktop: unified icon rail with tool groups
  return (
    <nav
      id="left-tool-rail"
      aria-label="3D Studio Toolset"
      className="w-[72px] h-full bg-[hsl(var(--surface-0))] border-r border-white/[0.08] flex flex-col items-center justify-between z-20 select-none flex-shrink-0"
    >
      {/* Tool Stack (AI 3D Studio Toolset) */}
      <div className="flex-1 w-full flex flex-col items-center gap-1.5 px-1.5 py-2 overflow-y-auto overflow-x-hidden scrollbar-none">
        {/* Studio Overview */}
        <SimpleTooltip side="right" label="Studio Overview (Dashboard & Hardware)">
          <button
            id="tool-btn-overview"
            onClick={() => navigateToMainNav('dashboard')}
            className={`group relative w-full h-[52px] py-1 px-1 flex flex-col items-center justify-center rounded-xl transition-all duration-150 cursor-pointer flex-shrink-0 active:scale-95 ${
              isOverviewActive
                ? 'bg-[hsl(var(--surface-2))] border border-primary/40 text-white shadow-[0_2px_12px_hsl(var(--primary)/0.12)]'
                : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[hsl(var(--surface-1))]'
            }`}
          >
            {isOverviewActive && (
              <motion.div
                layoutId="leftNavIndicator"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
              />
            )}
            <LayoutDashboard className={`w-4 h-4 mb-1 flex-shrink-0 transition-transform ${isOverviewActive ? 'text-primary scale-110' : 'group-hover:scale-105'}`} />
            <span className={`text-[9px] leading-tight text-center tracking-tight truncate w-full ${isOverviewActive ? 'text-white font-bold' : 'font-medium'}`}>Overview</span>
          </button>
        </SimpleTooltip>

        {/* Assets & Outputs */}
        <SimpleTooltip side="right" label="Outputs & Asset History">
          <button
            id="tool-btn-assets"
            onClick={() => navigateToMainNav('assets')}
            className={`group relative w-full h-[52px] py-1 px-1 flex flex-col items-center justify-center rounded-xl transition-all duration-150 cursor-pointer flex-shrink-0 active:scale-95 ${
              isAssetsActive
                ? 'bg-[hsl(var(--surface-2))] border border-primary/40 text-white shadow-[0_2px_12px_hsl(var(--primary)/0.12)]'
                : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[hsl(var(--surface-1))]'
            }`}
          >
            {isAssetsActive && (
              <motion.div
                layoutId="leftNavIndicator"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
              />
            )}
            <FolderOpen className={`w-4 h-4 mb-1 flex-shrink-0 transition-transform ${isAssetsActive ? 'text-primary scale-110' : 'group-hover:scale-105'}`} />
            <span className={`text-[9px] leading-tight text-center tracking-tight truncate w-full ${isAssetsActive ? 'text-white font-bold' : 'font-medium'}`}>Assets</span>
          </button>
        </SimpleTooltip>

        {/* System & Telemetry */}
        <SimpleTooltip side="right" label="System Telemetry & VRAM">
          <button
            id="tool-btn-system"
            onClick={() => navigateToMainNav('system')}
            className={`group relative w-full h-[52px] py-1 px-1 flex flex-col items-center justify-center rounded-xl transition-all duration-150 cursor-pointer flex-shrink-0 active:scale-95 ${
              isSystemActive
                ? 'bg-[hsl(var(--surface-2))] border border-primary/40 text-white shadow-[0_2px_12px_hsl(var(--primary)/0.12)]'
                : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[hsl(var(--surface-1))]'
            }`}
          >
            {isSystemActive && (
              <motion.div
                layoutId="leftNavIndicator"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
              />
            )}
            <Activity className={`w-4 h-4 mb-1 flex-shrink-0 transition-transform ${isSystemActive ? 'text-primary scale-110' : 'group-hover:scale-105'}`} />
            <span className={`text-[9px] leading-tight text-center tracking-tight truncate w-full ${isSystemActive ? 'text-white font-bold' : 'font-medium'}`}>System</span>
          </button>
        </SimpleTooltip>

        {/* ComfyUI Studio */}
        <SimpleTooltip side="right" label="ComfyUI Node Graph Studio">
          <button
            id="tool-btn-comfyui"
            onClick={() => router.push('/comfyui')}
            className={`group relative w-full h-[52px] py-1 px-1 flex flex-col items-center justify-center rounded-xl transition-all duration-150 cursor-pointer flex-shrink-0 active:scale-95 ${
              isComfyActive
                ? 'bg-[hsl(var(--surface-2))] border border-primary/40 text-white shadow-[0_2px_12px_hsl(var(--primary)/0.12)]'
                : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[hsl(var(--surface-1))]'
            }`}
          >
            {isComfyActive && (
              <motion.div
                layoutId="leftNavIndicator"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
              />
            )}
            <Cpu className={`w-4 h-4 mb-1 flex-shrink-0 transition-transform ${isComfyActive ? 'text-primary scale-110' : 'group-hover:scale-105'}`} />
            <span className={`text-[9px] leading-tight text-center tracking-tight truncate w-full ${isComfyActive ? 'text-white font-bold' : 'font-medium'}`}>ComfyUI</span>
          </button>
        </SimpleTooltip>

        <div className="w-8 h-px bg-white/[0.08] my-1 flex-shrink-0" />

        {/* 1. 3D Model Generation */}
        <SimpleTooltip side="right" label="3D Model Generation (Image & Text to 3D)">
          <button
            id="tool-btn-model"
            onClick={() => handleToolClick('model')}
            className={`group relative w-full h-[52px] py-1 px-1 flex flex-col items-center justify-center rounded-xl transition-all duration-150 cursor-pointer flex-shrink-0 active:scale-95 ${
              isActive('model')
                ? 'bg-[hsl(var(--surface-2))] border border-primary/40 text-white shadow-[0_2px_12px_hsl(var(--primary)/0.12)]'
                : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[hsl(var(--surface-1))]'
            }`}
          >
            {isActive('model') && (
              <motion.div
                layoutId="leftNavIndicator"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
              />
            )}
            <Box className={`w-4 h-4 mb-1 flex-shrink-0 transition-transform ${isActive('model') ? 'text-primary scale-110' : 'group-hover:scale-105'}`} />
            <span className={`text-[9px] leading-tight text-center tracking-tight truncate w-full ${isActive('model') ? 'text-white font-bold' : 'font-medium'}`}>Model</span>
          </button>
        </SimpleTooltip>

        {/* 2. Quad Remesh (Poly) */}
        <SimpleTooltip side="right" label="Retopology / Quad Remesh (Poly)">
          <button
            id="tool-btn-remesh"
            onClick={() => handleToolClick('remesh')}
            className={`group relative w-full h-[52px] py-1 px-1 flex flex-col items-center justify-center rounded-xl transition-all duration-150 cursor-pointer flex-shrink-0 active:scale-95 ${
              isActive('remesh')
                ? 'bg-[hsl(var(--surface-2))] border border-primary/40 text-white shadow-[0_2px_12px_hsl(var(--primary)/0.12)]'
                : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[hsl(var(--surface-1))]'
            }`}
          >
            {isActive('remesh') && (
              <motion.div
                layoutId="leftNavIndicator"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
              />
            )}
            <CircleDashed className={`w-4 h-4 mb-1 flex-shrink-0 transition-transform ${isActive('remesh') ? 'text-primary scale-110' : 'group-hover:scale-105'}`} />
            <span className={`text-[9px] leading-tight text-center tracking-tight truncate w-full ${isActive('remesh') ? 'text-white font-bold' : 'font-medium'}`}>Poly</span>
          </button>
        </SimpleTooltip>

        {/* 3. Texture / PBR Maps */}
        <SimpleTooltip side="right" label="PBR Texture Maps Generation">
          <button
            id="tool-btn-texture"
            onClick={() => handleToolClick('texture')}
            className={`group relative w-full h-[52px] py-1 px-1 flex flex-col items-center justify-center rounded-xl transition-all duration-150 cursor-pointer flex-shrink-0 active:scale-95 ${
              isActive('texture')
                ? 'bg-[hsl(var(--surface-2))] border border-primary/40 text-white shadow-[0_2px_12px_hsl(var(--primary)/0.12)]'
                : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[hsl(var(--surface-1))]'
            }`}
          >
            {isActive('texture') && (
              <motion.div
                layoutId="leftNavIndicator"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
              />
            )}
            <Layers className={`w-4 h-4 mb-1 flex-shrink-0 transition-transform ${isActive('texture') ? 'text-primary scale-110' : 'group-hover:scale-105'}`} />
            <span className={`text-[9px] leading-tight text-center tracking-tight truncate w-full ${isActive('texture') ? 'text-white font-bold' : 'font-medium'}`}>Texture</span>
          </button>
        </SimpleTooltip>

        {/* 4. Animation & Rigging Studio */}
        <SimpleTooltip side="right" label="Animation & Rigging Studio (Motion AI / ARDY)">
          <button
            id="tool-btn-animation"
            onClick={() => handleToolClick('animation')}
            className={`group relative w-full h-[52px] py-1 px-1 flex flex-col items-center justify-center rounded-xl transition-all duration-150 cursor-pointer flex-shrink-0 active:scale-95 ${
              isActive('animation')
                ? 'bg-[hsl(var(--surface-2))] border border-primary/40 text-white shadow-[0_2px_12px_hsl(var(--primary)/0.12)]'
                : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[hsl(var(--surface-1))]'
            }`}
          >
            {isActive('animation') && (
              <motion.div
                layoutId="leftNavIndicator"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
              />
            )}
            <Film className={`w-4 h-4 mb-1 flex-shrink-0 transition-transform ${isActive('animation') ? 'text-primary scale-110' : 'group-hover:scale-105'}`} />
            <span className={`text-[9px] leading-tight text-center tracking-tight truncate w-full ${isActive('animation') ? 'text-white font-bold' : 'font-medium'}`}>Animate</span>
          </button>
        </SimpleTooltip>

        {/* 5. Segment */}
        <SimpleTooltip side="right" label="Mesh Segmentation / Part Separation">
          <button
            id="tool-btn-segment"
            onClick={() => handleToolClick('segment')}
            className={`group relative w-full h-[52px] py-1 px-1 flex flex-col items-center justify-center rounded-xl transition-all duration-150 cursor-pointer flex-shrink-0 active:scale-95 ${
              isActive('segment')
                ? 'bg-[hsl(var(--surface-2))] border border-primary/40 text-white shadow-[0_2px_12px_hsl(var(--primary)/0.12)]'
                : 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[hsl(var(--surface-1))]'
            }`}
          >
            {isActive('segment') && (
              <motion.div
                layoutId="leftNavIndicator"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]"
              />
            )}
            <Scissors className={`w-4 h-4 mb-1 flex-shrink-0 transition-transform ${isActive('segment') ? 'text-primary scale-110' : 'group-hover:scale-105'}`} />
            <span className={`text-[9px] leading-tight text-center tracking-tight truncate w-full ${isActive('segment') ? 'text-white font-bold' : 'font-medium'}`}>Segment</span>
          </button>
        </SimpleTooltip>
      </div>

      {/* Bottom Settings */}
      <div className="flex flex-col items-center w-full px-1.5 py-2 border-t border-white/[0.08] flex-shrink-0">
        <SimpleTooltip side="right" label="Admin & Settings">
          <button
            id="tool-btn-settings"
            onClick={() => router.push('/admin?tab=settings')}
            className="group w-full h-[52px] py-1 px-1 flex flex-col items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-[hsl(var(--surface-1))] transition-all duration-150 active:scale-95 cursor-pointer flex-shrink-0"
          >
            <Settings className="w-4 h-4 mb-1 flex-shrink-0 transition-transform group-hover:rotate-45" />
            <span className="text-[9px] font-medium leading-tight text-center tracking-tight truncate w-full">Settings</span>
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
    className={`w-full relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all active:scale-98 cursor-pointer ${
      active
        ? 'bg-[hsl(var(--surface-2))] border border-primary/40 text-white font-bold shadow-sm'
        : 'text-zinc-300 hover:text-white hover:bg-[hsl(var(--surface-1))] border border-transparent'
    }`}
  >
    {active && (
      <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.8)]" />
    )}
    <span className={`flex-shrink-0 ${active ? 'text-primary' : 'text-zinc-400'}`}>{icon}</span>
    <span className="text-xs font-semibold truncate">{label}</span>
  </button>
);