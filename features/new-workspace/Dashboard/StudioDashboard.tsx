import React from 'react';
import {
  Box,
  Sparkles,
  Layers,
  Sliders,
  ArrowRight,
  FolderOpen
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { GpuVramLineChart } from '@/components/monitoring/GpuVramLineChart';

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
    <div id="studio-dashboard-view" className="flex-1 w-full h-full overflow-y-auto bg-[#14161b] select-none text-xs">
      <div className="max-w-6xl mx-auto w-full p-6 lg:p-8 space-y-6">
        {/* Studio Banner & Quick Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-[#1e2026] border border-[#2f333e] shadow-xl">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#2b2f3a] text-[#F9CF00] uppercase tracking-wider font-bold border border-[#3d4252]">
                FastAPI + 3D-Pack
              </span>
              <span className={`text-[10px] font-mono flex items-center gap-1.5 ${systemStats.status === 'online' ? 'text-emerald-400' : 'text-rose-400'}`}>
                <span className={`w-2 h-2 rounded-full ${systemStats.status === 'online' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-rose-400'}`} />
                {systemStats.status === 'online' ? 'FastAPI Connected' : 'FastAPI Offline'}
              </span>
            </div>
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight">
              AI 3D Creation Workspace
            </h1>
            <p className="text-xs text-zinc-300 max-w-xl">
              Professional high-fidelity 3D modeling, quad topology remeshing, and PBR texture baking.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleLaunchTool('model')}
              className="px-5 py-2.5 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] text-black font-bold text-xs flex items-center gap-2 shadow-lg shadow-[#F9CF00]/25 transition-all active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 fill-black text-black stroke-[2.2]" />
              <span>New 3D Generation</span>
            </button>
          </div>
        </div>

        {/* 3 Core Workflows Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Model */}
          <div 
            onClick={() => handleLaunchTool('model')}
            className="p-5 rounded-2xl bg-[#1e2026] border border-[#2f333e] hover:border-[#F9CF00]/60 hover:bg-[#252830] cursor-pointer transition-all group flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#282b34] border border-[#3d4252] flex items-center justify-center text-[#F9CF00] group-hover:scale-110 transition-transform">
                <Box className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">3D Mesh Generation</h3>
                <p className="text-zinc-300 text-[11px] mt-1">Generate 3D meshes using the installed FastAPI + 3D-Pack workflows.</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[#F9CF00] font-bold text-xs pt-4">
              <span>Launch Tool</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform stroke-[2.2]" />
            </div>
          </div>

          {/* PBR Texture */}
          <div 
            onClick={() => handleLaunchTool('texture')}
            className="p-5 rounded-2xl bg-[#1e2026] border border-[#2f333e] hover:border-[#F9CF00]/60 hover:bg-[#252830] cursor-pointer transition-all group flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#282b34] border border-[#3d4252] flex items-center justify-center text-[#F9CF00] group-hover:scale-110 transition-transform">
                <Layers className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">PBR Texture Studio</h3>
                <p className="text-zinc-300 text-[11px] mt-1">Albedo, normal, roughness, and displacement map synthesis up to 8K.</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[#F9CF00] font-bold text-xs pt-4">
              <span>Launch Tool</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform stroke-[2.2]" />
            </div>
          </div>

          {/* Remesh */}
          <div 
            onClick={() => handleLaunchTool('remesh')}
            className="p-5 rounded-2xl bg-[#1e2026] border border-[#2f333e] hover:border-[#F9CF00]/60 hover:bg-[#252830] cursor-pointer transition-all group flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#282b34] border border-[#3d4252] flex items-center justify-center text-[#F9CF00] group-hover:scale-110 transition-transform">
                <Sliders className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Adaptive Remesh</h3>
                <p className="text-zinc-300 text-[11px] mt-1">Quad retopology, decimation, and boundary protection presets.</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[#F9CF00] font-bold text-xs pt-4">
              <span>Launch Tool</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform stroke-[2.2]" />
            </div>
          </div>
        </div>

        {/* Real-time VRAM and GPU Utilization Monitoring Section */}
        <div className="p-5 rounded-2xl bg-[#1e2026] border border-[#2f333e] shadow-lg space-y-3">
          <GpuVramLineChart height={240} autoPoll pollIntervalMs={3000} />
        </div>

        {/* Recent Studio Assets Catalog */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-[#F9CF00] stroke-[2.2]" />
              <h2 className="font-bold text-sm text-white">Recent 3D Studio Assets</h2>
            </div>
            <span className="text-[11px] text-zinc-400">Click any asset to open in 3D Viewport</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {assets.map((asset) => (
              <div
                key={asset.id}
                onClick={() => {
                  setCurrentAsset(asset);
                  setMainNav('workspace');
                }}
                className="p-3 rounded-2xl bg-[#1e2026] border border-[#2f333e] hover:border-[#F9CF00] hover:bg-[#252830] transition-all cursor-pointer group flex flex-col shadow-sm"
              >
                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#14161b] border border-[#2f333e] mb-2.5">
                  {asset.thumbnail ? (
                    <img 
                      src={asset.thumbnail} 
                      alt={asset.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Box className="w-8 h-8 text-zinc-500 stroke-[2.2]" />
                    </div>
                  )}
                  <span className="absolute bottom-1.5 right-1.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#282b34] text-[#F9CF00] border border-[#3d4252] font-bold">
                    {asset.format}
                  </span>
                </div>

                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-xs text-white truncate group-hover:text-[#F9CF00] transition-colors">
                      {asset.name}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono mt-0.5">
                      <span>{(asset.faces / 1000).toFixed(1)}K faces</span>
                      <span>•</span>
                      <span>{asset.materials?.length ?? 0} mats</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-wrap pt-2">
                    {asset.tags.map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-[#282b34] text-zinc-300 border border-[#3d4252]">
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
    </div>
  );
};
