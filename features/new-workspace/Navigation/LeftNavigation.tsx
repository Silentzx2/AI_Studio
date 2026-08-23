import React from 'react';
import { 
  Box, 
  Image as ImageIcon, 
  Hexagon,
  Scissors,
  Bone,
  Layers, 
  Activity, 
  GitBranch, 
  Settings,
  Sparkles
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { ToolType } from '../types';

export const LeftNavigation: React.FC = () => {
  const { 
    activeTool, 
    setActiveTool, 
    setIsSettingsOpen,
    setIsLeftPanelOpen
  } = useWorkspace();

  const handleToolClick = (tool: ToolType) => {
    setActiveTool(tool);
    setIsLeftPanelOpen(true);
  };

  return (
    <nav 
      id="left-tool-rail"
      aria-label="3D Studio Toolset"
      className="w-18 h-full bg-[#0f1015] border-r border-[#21242c] flex flex-col items-center py-2.5 justify-between z-20 select-none flex-shrink-0"
    >
      {/* Top Primary Toolset */}
      <div className="flex flex-col items-center gap-2 w-full px-1.5 overflow-y-auto overflow-x-hidden">
        {/* 1. 3D Model Generation (Unified Text-to-3D & Image-to-3D) */}
        <button
          id="tool-btn-model"
          onClick={() => handleToolClick('model')}
          title="3D Generator (Text-to-3D & Image-to-3D AI Models)"
          className={`group relative w-full py-2.5 flex flex-col items-center justify-center rounded-xl transition-all ${
            activeTool === 'model'
              ? 'bg-[#1e2230] text-[#f5c518] border border-[#f5c518]/50 shadow-lg shadow-[#f5c518]/15 ring-1 ring-[#f5c518]/30'
              : 'text-[#848a97] hover:text-[#f3f4f6] hover:bg-[#181a20]'
          }`}
        >
          <div className="relative">
            <Box className="w-5 h-5 mb-0.5" />
            <Sparkles className="w-2.5 h-2.5 text-[#f5c518] absolute -top-1 -right-2" />
          </div>
          <span className="text-[9.5px] font-bold leading-tight text-center">3D Gen</span>

          {/* SOTA Badge */}
          <span className="mt-0.5 px-1 py-0.2 rounded bg-[#f5c518]/20 text-[7px] font-mono font-bold text-[#f5c518] tracking-tight">
            AI 3D
          </span>
        </button>

        {/* 2. Image Pre-processor with GPT Image 3 Badge */}
        <button
          id="tool-btn-image"
          onClick={() => handleToolClick('image')}
          className={`group relative w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
            activeTool === 'image'
              ? 'bg-[#1e2230] text-[#f5c518] border border-[#f5c518]/30 shadow-lg shadow-[#f5c518]/10'
              : 'text-[#848a97] hover:text-[#f3f4f6] hover:bg-[#181a20]'
          }`}
        >
          <ImageIcon className="w-4 h-4 mb-0.5" />
          <span className="text-[9px] font-medium leading-none">Pre-process</span>
          <span className="mt-0.5 px-1 py-0.2 rounded-full bg-[#6366f1] text-[6.5px] font-bold text-white tracking-tighter leading-tight shadow">
            GPT-Img
          </span>
        </button>

        {/* 3. Segmentation */}
        <button
          id="tool-btn-segment"
          onClick={() => handleToolClick('segment')}
          className={`w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
            activeTool === 'segment'
              ? 'bg-[#1e2230] text-[#f5c518] border border-[#f5c518]/30 shadow-lg shadow-[#f5c518]/10'
              : 'text-[#848a97] hover:text-[#f3f4f6] hover:bg-[#181a20]'
          }`}
        >
          <Scissors className="w-4 h-4 mb-0.5" />
          <span className="text-[9px] font-medium leading-none">Segment</span>
        </button>

        {/* 4. Retopo */}
        <button
          id="tool-btn-retopo"
          onClick={() => handleToolClick('retopo')}
          className={`w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
            activeTool === 'retopo' || activeTool === 'remesh'
              ? 'bg-[#1e2230] text-[#f5c518] border border-[#f5c518]/30 shadow-lg shadow-[#f5c518]/10'
              : 'text-[#848a97] hover:text-[#f3f4f6] hover:bg-[#181a20]'
          }`}
        >
          <Hexagon className="w-4 h-4 mb-0.5" />
          <span className="text-[9px] font-medium leading-none">Retopo</span>
        </button>

        {/* 5. Remesh */}
        <button
          id="tool-btn-remesh"
          onClick={() => handleToolClick('remesh')}
          className={`w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
            activeTool === 'remesh'
              ? 'bg-[#1e2230] text-[#f5c518] border border-[#f5c518]/30 shadow-lg shadow-[#f5c518]/10'
              : 'text-[#848a97] hover:text-[#f3f4f6] hover:bg-[#181a20]'
          }`}
        >
          <Hexagon className="w-4 h-4 mb-0.5" />
          <span className="text-[9px] font-medium leading-none">Remesh</span>
        </button>

        {/* 6. Texture / PBR Maps */}
        <button
          id="tool-btn-texture"
          onClick={() => handleToolClick('texture')}
          className={`w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
            activeTool === 'texture' || activeTool === 'pbr'
              ? 'bg-[#1e2230] text-[#f5c518] border border-[#f5c518]/30 shadow-lg shadow-[#f5c518]/10'
              : 'text-[#848a97] hover:text-[#f3f4f6] hover:bg-[#181a20]'
          }`}
        >
          <Layers className="w-4 h-4 mb-0.5" />
          <span className="text-[9px] font-medium leading-none">Texture</span>
        </button>

        {/* 7. Animate */}
        <button
          id="tool-btn-animate"
          onClick={() => handleToolClick('animate')}
          className={`w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
            activeTool === 'animate'
              ? 'bg-[#1e2230] text-[#f5c518] border border-[#f5c518]/30 shadow-lg shadow-[#f5c518]/10'
              : 'text-[#848a97] hover:text-[#f3f4f6] hover:bg-[#181a20]'
          }`}
        >
          <Activity className="w-4 h-4 mb-0.5" />
          <span className="text-[9px] font-medium leading-none">Animate</span>
        </button>

        {/* 8. Rigging */}
        <button
          id="tool-btn-rigging"
          onClick={() => handleToolClick('rigging')}
          className={`w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
            activeTool === 'rigging'
              ? 'bg-[#1e2230] text-[#f5c518] border border-[#f5c518]/30 shadow-lg shadow-[#f5c518]/10'
              : 'text-[#848a97] hover:text-[#f3f4f6] hover:bg-[#181a20]'
          }`}
        >
          <Bone className="w-4 h-4 mb-0.5" />
          <span className="text-[9px] font-medium leading-none">Rigging</span>
        </button>
      </div>

      {/* Bottom Pipeline & Settings */}
      <div className="flex flex-col items-center gap-1.5 w-full px-1.5 pt-2 border-t border-[#1e2129]">
        {/* FastAPI Visual Node Graph */}
        <button
          id="tool-btn-nodes"
          onClick={() => handleToolClick('nodes')}
          title="Open FastAPI Visual Node Pipeline"
          className={`w-full py-2 flex flex-col items-center justify-center rounded-xl transition-all ${
            activeTool === 'nodes'
              ? 'bg-[#1e2230] text-[#f5c518] border border-[#f5c518]/30'
              : 'text-[#848a97] hover:text-[#f3f4f6] hover:bg-[#181a20]'
          }`}
        >
          <GitBranch className="w-4 h-4 mb-0.5" />
          <span className="text-[8.5px] font-medium leading-none">Nodes</span>
        </button>

        {/* FastAPI Server Backend Settings */}
        <button
          id="tool-btn-settings"
          onClick={() => setIsSettingsOpen(true)}
          title="FastAPI & 3D Generation Pipeline Engine Settings"
          className="w-full p-2 flex flex-col items-center justify-center rounded-xl text-[#848a97] hover:text-[#f3f4f6] hover:bg-[#181a20] transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
};
