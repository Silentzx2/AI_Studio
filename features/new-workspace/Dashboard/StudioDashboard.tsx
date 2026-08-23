import React from 'react';
import { 
  Box, 
  Sparkles, 
  Layers, 
  Sliders, 
  GitBranch, 
  Activity, 
  Plus, 
  Server, 
  ArrowRight,
  FolderOpen,
  Cpu,
  Clock,
  Scissors,
  Bone
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const StudioDashboard: React.FC = () => {
  const { 
    setMainNav, 
    setActiveTool, 
    assets, 
    setCurrentAsset, 
    systemStats, 
    setIsSettingsOpen 
  } = useWorkspace();

  const handleLaunchTool = (tool: import('../types').ToolType) => {
    setActiveTool(tool);
    setMainNav('workspace');
  };

  return (
    <div id="studio-dashboard-view" className="flex-1 w-full h-full overflow-y-auto bg-[#0d0e12] p-6 lg:p-8 space-y-6 select-none text-xs">
      {/* Studio Banner & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-[#171922] via-[#14161e] to-[#12141a] border border-[#272b38] shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#232734] text-[#f5c518] uppercase tracking-wider font-bold">
              FastAPI + 3D-Pack
            </span>
            <span className={`text-[10px] font-mono flex items-center gap-1 ${systemStats.status === 'online' ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${systemStats.status === 'online' ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
              {systemStats.status === 'online' ? 'FastAPI Connected' : 'FastAPI Offline'}
            </span>
          </div>
          <h1 className="text-xl lg:text-2xl font-black text-[#f3f4f6] tracking-tight">
            AI 3D Creation Workspace
          </h1>
          <p className="text-xs text-[#9ca3af] max-w-xl">
            Professional high-fidelity 3D modeling, quad topology remeshing, PBR texture baking, and bone auto-rigging engine.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleLaunchTool('model')}
            className="px-5 py-2.5 rounded-xl bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#f5c518]/20 transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4 fill-current" />
            <span>New 3D Generation</span>
          </button>

          <button
            onClick={() => handleLaunchTool('nodes')}
            className="px-4 py-2.5 rounded-xl bg-[#1e222c] hover:bg-[#282d3b] text-[#cbd5e1] font-semibold text-xs border border-[#303646] flex items-center gap-2 transition-colors"
          >
            <GitBranch className="w-4 h-4 text-[#f5c518]" />
            <span>FastAPI Nodes</span>
          </button>
        </div>
      </div>

      {/* 4 Core Workflows Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Model */}
        <div 
          onClick={() => handleLaunchTool('model')}
          className="p-5 rounded-2xl bg-[#14161c] border border-[#242834] hover:border-[#f5c518]/60 hover:bg-[#181b24] cursor-pointer transition-all group flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#1f232f] flex items-center justify-center text-[#f5c518] group-hover:scale-110 transition-transform">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#f3f4f6]">Image to 3D Mesh</h3>
              <p className="text-[#8e95a5] text-[11px] mt-1">Generate 3D meshes using the installed FastAPI + 3D-Pack workflows.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#f5c518] font-bold text-xs pt-4">
            <span>Launch Tool</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* PBR Texture */}
        <div 
          onClick={() => handleLaunchTool('texture')}
          className="p-5 rounded-2xl bg-[#14161c] border border-[#242834] hover:border-[#f5c518]/60 hover:bg-[#181b24] cursor-pointer transition-all group flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#1f232f] flex items-center justify-center text-[#f5c518] group-hover:scale-110 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#f3f4f6]">PBR Texture Studio</h3>
              <p className="text-[#8e95a5] text-[11px] mt-1">Albedo, normal, roughness, and displacement map synthesis up to 8K.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#f5c518] font-bold text-xs pt-4">
            <span>Launch Tool</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Remesh */}
        <div 
          onClick={() => handleLaunchTool('remesh')}
          className="p-5 rounded-2xl bg-[#14161c] border border-[#242834] hover:border-[#f5c518]/60 hover:bg-[#181b24] cursor-pointer transition-all group flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#1f232f] flex items-center justify-center text-[#f5c518] group-hover:scale-110 transition-transform">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#f3f4f6]">Adaptive Remesh</h3>
              <p className="text-[#8e95a5] text-[11px] mt-1">Quad retopology, decimation, and boundary protection presets.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#f5c518] font-bold text-xs pt-4">
            <span>Launch Tool</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Segmentation */}
        <div
          onClick={() => handleLaunchTool('segment')}
          className="p-5 rounded-2xl bg-[#14161c] border border-[#242834] hover:border-[#f5c518]/60 hover:bg-[#181b24] cursor-pointer transition-all group flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#1f232f] flex items-center justify-center text-[#f5c518] group-hover:scale-110 transition-transform">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#f3f4f6]">Mesh Segmentation</h3>
              <p className="text-[#8e95a5] text-[11px] mt-1">Isolate regions and parts for downstream 3D workflows.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#f5c518] font-bold text-xs pt-4">
            <span>Launch Tool</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Animate & Rig */}
        <div 
          onClick={() => handleLaunchTool('animate')}
          className="p-5 rounded-2xl bg-[#14161c] border border-[#242834] hover:border-[#f5c518]/60 hover:bg-[#181b24] cursor-pointer transition-all group flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#1f232f] flex items-center justify-center text-[#f5c518] group-hover:scale-110 transition-transform">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#f3f4f6]">Auto Rig & Animate</h3>
              <p className="text-[#8e95a5] text-[11px] mt-1">Humanoid skeleton fitting, weight painting, and motion diffusion diffusion.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#f5c518] font-bold text-xs pt-4">
            <span>Launch Tool</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Rigging */}
        <div
          onClick={() => handleLaunchTool('rigging')}
          className="p-5 rounded-2xl bg-[#14161c] border border-[#242834] hover:border-[#f5c518]/60 hover:bg-[#181b24] cursor-pointer transition-all group flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#1f232f] flex items-center justify-center text-[#f5c518] group-hover:scale-110 transition-transform">
              <Bone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#f3f4f6]">Rigging</h3>
              <p className="text-[#8e95a5] text-[11px] mt-1">Prepare selected meshes for skeletal animation workflows.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#f5c518] font-bold text-xs pt-4">
            <span>Launch Tool</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>

      {/* Recent Studio Assets Catalog */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[#f5c518]" />
            <h2 className="font-bold text-sm text-[#f3f4f6]">Recent 3D Studio Assets</h2>
          </div>
          <span className="text-[11px] text-[#8e95a5]">Click any asset to open in 3D Viewport</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              onClick={() => {
                setCurrentAsset(asset);
                setMainNav('workspace');
              }}
              className="p-3 rounded-2xl bg-[#14161c] border border-[#242834] hover:border-[#f5c518] hover:bg-[#181a22] transition-all cursor-pointer group flex flex-col"
            >
              <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#0a0b0e] border border-[#222633] mb-2.5">
                <img 
                  src={asset.thumbnail} 
                  alt={asset.name} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  crossOrigin="anonymous"
                />
                <span className="absolute bottom-1.5 right-1.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/80 text-[#f5c518] font-bold">
                  {asset.format}
                </span>
              </div>

              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-xs text-[#e5e7eb] truncate group-hover:text-[#f5c518] transition-colors">
                    {asset.name}
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] text-[#8e95a5] font-mono mt-0.5">
                    <span>{(asset.faces / 1000).toFixed(1)}K faces</span>
                    <span>•</span>
                    <span>{asset.materials?.length ?? 0} mats</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-wrap pt-2">
                  {asset.tags.map(t => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-[#1e222d] text-[#cbd5e1]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
