import React from 'react';
import { FolderOpen, Box, Sparkles, Download, Layers } from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const OutputsPage: React.FC = () => {
  const { assets, setMainNav, setCurrentAsset, setActiveTool } = useWorkspace();

  return (
    <div id="outputs-page-view" className="flex-1 w-full h-full overflow-y-auto bg-[#0D0E10] select-none text-xs">
      <div className="max-w-6xl mx-auto w-full p-6 lg:p-8 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight">
              Outputs & Asset History
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Real-time generated 3D meshes, quad-remeshed topology, and PBR texture outputs.
            </p>
          </div>
          <button
            onClick={() => {
              setActiveTool('model');
              setMainNav('workspace');
            }}
            className="px-4 py-2 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] text-black font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-[#F9CF00]/20 active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 fill-black stroke-black" />
            <span>New Generation</span>
          </button>
        </div>

        {assets.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#191A1D] p-12 text-center shadow-xl space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#22242A] border border-white/[0.08] flex items-center justify-center mx-auto text-zinc-400">
              <FolderOpen className="h-6 w-6" />
            </div>
            <div className="text-sm font-bold text-white">No outputs available yet</div>
            <div className="text-xs text-zinc-400 max-w-sm mx-auto">
              Run a 3D generation, retopology remesh, or PBR texture bake to populate your library.
            </div>
            <button 
              onClick={() => {
                setActiveTool('model');
                setMainNav('workspace');
              }} 
              className="mt-2 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] px-5 py-2.5 text-xs font-bold text-black transition-all cursor-pointer"
            >
              Open 3D Workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {assets.map(asset => (
              <button 
                key={asset.id} 
                onClick={() => { 
                  setCurrentAsset(asset); 
                  setMainNav('workspace'); 
                }} 
                className="group overflow-hidden rounded-xl border border-white/[0.08] bg-[#191A1D] text-left hover:border-[#F9CF00]/60 hover:bg-[#202227] transition-all flex flex-col cursor-pointer shadow-lg"
              >
                <div className="aspect-square bg-[#141518] relative flex items-center justify-center overflow-hidden">
                  {asset.thumbnail ? (
                    <img 
                      src={asset.thumbnail} 
                      alt={asset.name} 
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" 
                      crossOrigin="anonymous" 
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-500">
                      <Box className="h-8 w-8 text-[#F9CF00]" />
                    </div>
                  )}
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9px] font-mono font-bold text-[#F9CF00] border border-white/[0.1]">
                    {asset.format}
                  </span>
                </div>
                <div className="p-3 space-y-1">
                  <div className="truncate text-xs font-bold text-white group-hover:text-[#F9CF00] transition-colors">
                    {asset.name}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                    <span>{asset.topology || 'Triangle'}</span>
                    <span>{asset.dateCreated || 'Recent'}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
