import React from 'react';
import {
  Sparkles,
  Hexagon,
  Pencil,
  Maximize,
  Palette,
  Wand2,
  Layers,
  ArrowRight
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

  if (tool === 'retopo') {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-3.5 space-y-4 text-xs select-none">
        <div className="flex items-center gap-2 pb-1">
          <div className="w-6 h-6 rounded-md bg-[#f5c518]/20 flex items-center justify-center text-[#f5c518]">
            <Hexagon className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#f3f4f6]">Quad Retopology</h2>
            <p className="text-[10px] text-[#9ca3af]">Anatomical flow & Game-Ready Quads</p>
          </div>
        </div>

        <p className="text-[#9ca3af]">
          Convert triangulated or high-poly dense voxel sculpts into clean, quad-dominant sub-d cage topology.
        </p>

        <div className="space-y-1.5">
          <span className="font-medium text-[#cbd5e1]">Target Polycount</span>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { label: '2.5K Low', faces: 2500 },
              { label: '10K Mid', faces: 10000 },
              { label: '25K High', faces: 25000 },
            ]).map((q) => (
              <button
                key={q.label}
                onClick={() => setRemeshSettings(prev => ({ ...prev, targetFaces: q.faces }))}
                className={`p-2 rounded-lg border font-medium transition-colors ${
                  remeshSettings.targetFaces === q.faces
                    ? 'bg-[#f5c518]/15 border-[#f5c518]/60 text-[#f5c518]'
                    : 'bg-[#181a20] border-[#282c37] text-[#cbd5e1] hover:text-[#f5c518] hover:border-[#f5c518]/40'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#14161c] border border-[#232731] space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#9ca3af]">Current Topology:</span>
            <span className="font-mono text-[#f5c518]">{currentAsset ? (currentAsset.statsAvailable ? `${currentAsset.topology} (${currentAsset.faces.toLocaleString()} faces)` : 'Geometry stats unavailable') : 'No asset selected'}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#9ca3af]">Edge Loop Flow:</span>
            <span className="font-mono text-[#22c55e]">Anatomical</span>
          </div>
        </div>

        {systemStats.status !== 'online' && (
          <div className="p-2.5 rounded-xl bg-[#1a1214] border border-[#ef4444]/30 text-[10px] text-[#fca5a5]">
            Backend offline — retopology requires a running FastAPI server.
          </div>
        )}

        <button
          onClick={() => void runRemeshGeneration()}
          disabled={isExecuting || systemStats.status !== 'online'}
          className="w-full py-3 rounded-xl bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#f5c518]/25 transition-all disabled:opacity-50"
        >
          <Hexagon className="w-4 h-4" />
          <span>Execute Quad Retopo</span>
        </button>
      </div>
    );
  }

  if (tool === 'edit') {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-3.5 space-y-4 text-xs select-none">
        <div className="flex items-center gap-2 pb-1">
          <div className="w-6 h-6 rounded-md bg-[#f5c518]/20 flex items-center justify-center text-[#f5c518]">
            <Pencil className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-sm font-bold text-[#f3f4f6]">3D Sculpt & Edit</h2>
        </div>
        <p className="text-[#9ca3af]">Interactive vertex push, smooth, inflate, pinch and symmetry sculpting tools.</p>
        <div className="grid grid-cols-2 gap-2">
          {['Grab / Move', 'Smooth', 'Inflate', 'Pinch', 'Flatten', 'Clay Strips'].map((brush) => (
            <button key={brush} className="p-2.5 rounded-xl bg-[#14161c] border border-[#252834] text-[#cbd5e1] hover:text-[#f5c518] font-medium text-left transition-colors">
              {brush}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (tool === 'upscale') {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-3.5 space-y-4 text-xs select-none">
        <div className="flex items-center gap-2 pb-1">
          <div className="w-6 h-6 rounded-md bg-[#f5c518]/20 flex items-center justify-center text-[#f5c518]">
            <Maximize className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-sm font-bold text-[#f3f4f6]">3D AI Upscale</h2>
        </div>
        <p className="text-[#9ca3af]">Increase texture resolution from 1K to 4K/8K and subdivide high-frequency surface details.</p>
        <div className="space-y-1.5">
          <span className="font-medium text-[#cbd5e1]">Upscale Factor</span>
          <div className="grid grid-cols-3 gap-1.5">
            {['2X Super', '4X Ultra', '8K Production'].map((f) => (
              <button key={f} className="p-2 rounded-lg bg-[#181a20] border border-[#282c37] text-[#cbd5e1] font-medium hover:text-[#f5c518] hover:border-[#f5c518]/40 transition-colors">
                {f}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => void runRemeshGeneration()}
          disabled={isExecuting || systemStats.status !== 'online'}
          className="w-full py-3 rounded-xl bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#f5c518]/25 transition-all disabled:opacity-50"
        >
          <Maximize className="w-4 h-4" />
          <span>Execute 3D Upscale</span>
        </button>
      </div>
    );
  }

  if (tool === 'pbr') {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-3.5 space-y-4 text-xs select-none">
        <div className="flex items-center gap-2 pb-1">
          <div className="w-6 h-6 rounded-md bg-[#f5c518]/20 flex items-center justify-center text-[#f5c518]">
            <Palette className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-sm font-bold text-[#f3f4f6]">PBR Material Baker</h2>
        </div>
        <p className="text-[#9ca3af]">Bake physically based rendering channels (Albedo, Normal, Roughness, Metallic, Height, AO) using 3D Generation Pipeline nodes.</p>
        <button
          onClick={() => void runTextureGeneration()}
          disabled={isExecuting || systemStats.status !== 'online'}
          className="w-full py-3 rounded-xl bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#f5c518]/25 transition-all disabled:opacity-50"
        >
          <Palette className="w-4 h-4" />
          <span>Bake PBR Texture Set</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full items-center justify-center px-4 py-3.5 text-xs select-none">
      <div className="w-10 h-10 rounded-xl bg-[#181a20] border border-[#282c37] flex items-center justify-center text-[#8e95a5] mb-3">
        <Layers className="w-5 h-5" />
      </div>
      <p className="text-[#9ca3af] text-center">This tool is not available yet.</p>
    </div>
  );
};
