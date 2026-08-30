import React from 'react';
import {
  Hexagon,
  Pencil,
  Maximize,
  Palette,
  Layers
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { ToolType } from '../types';

export const SecondaryPanel: React.FC<{ tool: ToolType }> = ({ tool }) => {
  const {
    isExecuting,
    currentAsset,
    setActiveTool,
    runRemeshGeneration,
    runTextureGeneration,
    systemStats,
    remeshSettings,
    setRemeshSettings,
  } = useWorkspace();

  if (tool === 'segment') {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-4 text-xs select-none bg-[#14161b]">
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#F9CF00]">Mesh Segmentation</span>
          <p className="text-[11px] text-zinc-400 font-medium">Decompose mesh into semantic functional sub-meshes for animation & rigging.</p>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-1">
          {['Auto Semantic Split', 'Joints & Limbs', 'Armor & Apparel', 'Loose Islands'].map((mode, i) => (
            <button
              key={mode}
              className={`p-3 rounded-xl border text-left font-bold transition-all ${
                i === 0
                  ? 'bg-[#F9CF00] border-[#F9CF00] text-black shadow-md'
                  : 'bg-[#1c1f26] border-[#272a34] text-zinc-300 hover:text-white hover:border-[#3d4252]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="p-3.5 rounded-xl bg-[#1c1f26] border border-[#272a34] space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">Target Mesh:</span>
            <span className="font-mono text-[#F9CF00] font-bold truncate max-w-[140px]">{currentAsset ? currentAsset.name : 'Active Model'}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">Estimated Parts:</span>
            <span className="font-mono text-emerald-400 font-bold">5 Sub-meshes</span>
          </div>
        </div>

        <button
          onClick={() => void runRemeshGeneration()}
          disabled={isExecuting}
          className="w-full py-3.5 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
        >
          <Layers className="w-4 h-4 stroke-[2.2]" />
          <span>EXECUTE SEGMENTATION</span>
        </button>
      </div>
    );
  }

  if (tool === 'remesh') {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-4 text-xs select-none bg-[#14161b]">
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#F9CF00]">Target Polycount</span>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { label: '2.5K Low', faces: 2500 },
              { label: '10K Mid', faces: 10000 },
              { label: '25K High', faces: 25000 },
            ]).map((q) => (
              <button
                key={q.label}
                onClick={() => setRemeshSettings(prev => ({ ...prev, targetFaces: q.faces }))}
                className={`p-2.5 rounded-xl border font-bold transition-all ${
                  remeshSettings.targetFaces === q.faces
                    ? 'bg-[#F9CF00] border-[#F9CF00] text-black shadow-md'
                    : 'bg-[#1c1f26] border-[#272a34] text-zinc-300 hover:text-white hover:border-[#3d4252]'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#1c1f26] border border-[#272a34] space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">Current Topology:</span>
            <span className="font-mono text-[#F9CF00] font-bold">{currentAsset ? (currentAsset.statsAvailable ? `${currentAsset.topology} (${currentAsset.faces.toLocaleString()} faces)` : 'Geometry stats unavailable') : 'No asset selected'}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">Edge Loop Flow:</span>
            <span className="font-mono text-emerald-400 font-bold">Anatomical</span>
          </div>
        </div>

        <button
          onClick={() => void runRemeshGeneration()}
          disabled={isExecuting}
          className="w-full py-3.5 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
        >
          <Hexagon className="w-4 h-4 stroke-[2.2]" />
          <span>EXECUTE QUAD RETOPO</span>
        </button>
      </div>
    );
  }

  if (tool === 'edit') {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-4 text-xs select-none bg-[#14161b]">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#F9CF00]">Sculpt Brushes</span>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {['Grab / Move', 'Smooth', 'Inflate', 'Pinch', 'Flatten', 'Clay Strips'].map((brush) => (
            <button key={brush} className="p-3 rounded-xl bg-[#1c1f26] border border-[#272a34] text-white hover:text-[#F9CF00] hover:border-[#F9CF00] font-bold text-left transition-all">
              {brush}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (tool === 'upscale') {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-4 text-xs select-none bg-[#14161b]">
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#F9CF00]">Upscale Factor</span>
          <div className="grid grid-cols-3 gap-1.5">
            {['2X Super', '4X Ultra', '8K Production'].map((f) => (
              <button key={f} className="p-2.5 rounded-xl bg-[#1c1f26] border border-[#272a34] text-white font-bold hover:text-[#F9CF00] hover:border-[#F9CF00] transition-colors">
                {f}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => void runRemeshGeneration()}
          disabled={isExecuting}
          className="w-full py-3.5 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
        >
          <Maximize className="w-4 h-4 stroke-[2.2]" />
          <span>EXECUTE 3D UPSCALE</span>
        </button>
      </div>
    );
  }

  if (tool === 'pbr') {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-4 text-xs select-none bg-[#14161b]">
        <div className="p-4 rounded-xl bg-[#1c1f26] border border-[#272a34]">
          <p className="text-zinc-300 leading-relaxed font-medium">Bake physically based rendering channels (Albedo, Normal, Roughness, Metallic, Height, AO) using 3D Generation Pipeline nodes.</p>
        </div>
        <button
          onClick={() => void runTextureGeneration()}
          disabled={isExecuting}
          className="w-full py-3.5 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
        >
          <Palette className="w-4 h-4 stroke-[2.2]" />
          <span>BAKE PBR TEXTURE SET</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full items-center justify-center px-4 py-4 text-xs select-none bg-[#14161b]">
      <div className="w-12 h-12 rounded-xl bg-[#1c1f26] border border-[#272a34] flex items-center justify-center text-zinc-400 mb-3">
        <Layers className="w-6 h-6 stroke-[2.2]" />
      </div>
      <p className="text-zinc-400 text-center font-medium">This tool is not available yet.</p>
    </div>
  );
};
