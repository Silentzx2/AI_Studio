import React from 'react';
import {
  Box,
  Hexagon,
  Layers,
  Settings,
  Sparkles,
  LayoutDashboard,
  Globe,
  Scissors,
  CircleDashed
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

  const isActive = (tool: ToolType) => mainNav === 'workspace' && activeTool === tool;

  return (
    <nav
      id="left-tool-rail"
      aria-label="3D Studio Toolset"
      className="w-16 h-full bg-[#121418] border-r border-[#22242a] flex flex-col items-center py-2.5 justify-between z-20 select-none flex-shrink-0 shadow-2xl"
    >
      {/* Top Primary Toolset */}
      <div className="flex flex-col items-stretch gap-2 w-full px-1.5 overflow-hidden">
        {/* 1. Dashboard / Overview */}
        <button
          id="tool-btn-dashboard"
          onClick={() => navigateToMainNav('dashboard')}
          className={`group relative w-full py-2.5 flex flex-col items-center justify-center rounded-xl transition-all box-border ${
            mainNav === 'dashboard'
              ? 'bg-[#222630] text-[#F9CF00] border border-[#353a4a] shadow-sm font-bold'
              : 'text-zinc-400 hover:text-white hover:bg-[#181b22]'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5 stroke-[2.2]" />
          <span className="text-[8px] font-bold leading-tight text-center uppercase tracking-tighter">Overview</span>
        </button>

        {/* 2. 3D Model Generation */}
        <button
          id="tool-btn-model"
          onClick={() => handleToolClick('model')}
          className={`group relative w-full py-3 flex flex-col items-center justify-center rounded-xl transition-all box-border ${
            isActive('model')
              ? 'bg-[#F9CF00] text-black font-extrabold shadow-[0_0_18px_rgba(249,207,0,0.4)]'
              : 'text-zinc-400 hover:text-white hover:bg-[#181b22]'
          }`}
        >
          <div className="relative">
            <Box className="w-5 h-5 mb-0.5 stroke-[2.2]" />
            <Sparkles className={`w-2.5 h-2.5 absolute -top-1 -right-1.5 ${isActive('model') ? 'text-black fill-black' : 'text-[#F9CF00] fill-[#F9CF00]'}`} />
          </div>
          <span className="text-[8px] font-bold leading-tight text-center uppercase tracking-tighter">Generate</span>
        </button>

        {/* 3. WorldGen */}
        <button
          id="tool-btn-worldgen"
          onClick={() => handleToolClick('worldgen')}
          className={`w-full py-2.5 flex flex-col items-center justify-center rounded-xl transition-all box-border ${
            isActive('worldgen')
              ? 'bg-[#222630] text-[#F9CF00] border border-[#353a4a] shadow-sm font-bold'
              : 'text-zinc-400 hover:text-white hover:bg-[#181b22]'
          }`}
        >
          <Globe className="w-5 h-5 mb-0.5 stroke-[2.2]" />
          <span className="text-[8px] font-bold leading-tight text-center uppercase tracking-tighter">World</span>
        </button>

        {/* 4. Segment */}
        <button
          id="tool-btn-segment"
          onClick={() => handleToolClick('segment')}
          className={`w-full py-2.5 flex flex-col items-center justify-center rounded-xl transition-all box-border ${
            isActive('segment')
              ? 'bg-[#222630] text-[#F9CF00] border border-[#353a4a] shadow-sm font-bold'
              : 'text-zinc-400 hover:text-white hover:bg-[#181b22]'
          }`}
        >
          <Scissors className="w-5 h-5 mb-0.5 stroke-[2.2]" />
          <span className="text-[8px] font-bold leading-tight text-center uppercase tracking-tighter">Segment</span>
        </button>

        {/* 6. Remesh */}
        <button
          id="tool-btn-remesh"
          onClick={() => handleToolClick('remesh')}
          className={`w-full py-2.5 flex flex-col items-center justify-center rounded-xl transition-all box-border ${
            isActive('remesh')
              ? 'bg-[#222630] text-[#F9CF00] border border-[#353a4a] shadow-sm font-bold'
              : 'text-zinc-400 hover:text-white hover:bg-[#181b22]'
          }`}
        >
          <CircleDashed className="w-5 h-5 mb-0.5 stroke-[2.2]" />
          <span className="text-[8px] font-bold leading-tight text-center uppercase tracking-tighter">Poly</span>
        </button>

        {/* 7. Texture / PBR Maps */}
        <button
          id="tool-btn-texture"
          onClick={() => handleToolClick('texture')}
          className={`w-full py-2.5 flex flex-col items-center justify-center rounded-xl transition-all box-border ${
            isActive('texture')
              ? 'bg-[#222630] text-[#F9CF00] border border-[#353a4a] shadow-sm font-bold'
              : 'text-zinc-400 hover:text-white hover:bg-[#181b22]'
          }`}
        >
          <Layers className="w-5 h-5 mb-0.5 stroke-[2.2]" />
          <span className="text-[8px] font-bold leading-tight text-center uppercase tracking-tighter">Texture</span>
        </button>

      </div>
      <div className="flex flex-col items-center gap-1.5 w-full px-1.5 pt-2 border-t border-[#22242a]">
        {/* Settings - navigates to /settings page */}
        <button
          id="tool-btn-settings"
          onClick={() => router.push('/settings')}
          className="w-full p-2.5 flex flex-col items-center justify-center rounded-xl text-zinc-400 hover:text-[#F9CF00] hover:bg-[#181b22] transition-colors"
        >
          <Settings className="w-5 h-5 stroke-[2.2]" />
        </button>
      </div>
    </nav>
  );
};