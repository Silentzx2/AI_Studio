import React from 'react';
import { 
  Sparkles, 
  Hexagon, 
  Pencil, 
  Maximize, 
  Palette,
  Image as ImageIcon,
  Wand2,
  Layers,
  ArrowRight
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { ToolType } from '../types';

export const SecondaryPanel: React.FC<{ tool: ToolType }> = ({ tool }) => {
  const { isExecuting, currentAsset, setActiveTool } = useWorkspace();

  if (tool === 'image') {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-3.5 space-y-4 text-xs select-none">
        <div className="flex items-center gap-2 pb-1">
          <div className="w-6 h-6 rounded-md bg-[#6366f1]/20 flex items-center justify-center text-[#818cf8]">
            <ImageIcon className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#f3f4f6]">GPT Image 3 Pre-processor</h2>
            <p className="text-[10px] text-[#9ca3af]">AI Multi-view Concept & Silhouette Extraction</p>
          </div>
        </div>

        <p className="text-[#9ca3af] leading-relaxed">
          Generate reference projections before sending the asset to an installed FastAPI 3D reconstruction workflow.
        </p>

        <div className="p-3 rounded-xl bg-[#14161c] border border-[#232731] space-y-2">
          <span className="font-semibold text-[#cbd5e1]">Multi-View Projection</span>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-lg bg-[#1a1d25] border border-[#282c37] text-center font-mono text-[#cbd5e1]">
              Front: 0° Elevation
            </div>
            <div className="p-2 rounded-lg bg-[#1a1d25] border border-[#282c37] text-center font-mono text-[#cbd5e1]">
              Right: 90° Azimuth
            </div>
            <div className="p-2 rounded-lg bg-[#1a1d25] border border-[#282c37] text-center font-mono text-[#cbd5e1]">
              Back: 180° Azimuth
            </div>
            <div className="p-2 rounded-lg bg-[#1a1d25] border border-[#282c37] text-center font-mono text-[#cbd5e1]">
              Left: 270° Azimuth
            </div>
          </div>
        </div>

        <button
          onClick={() => setActiveTool('model')}
          className="w-full py-3 rounded-xl bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#f5c518]/25 transition-all"
        >
          <span>Proceed to 3D Generation</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

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
            {['2.5K Low', '10K Mid', '25K High'].map((q) => (
              <button key={q} className="p-2 rounded-lg bg-[#181a20] border border-[#282c37] text-[#cbd5e1] font-medium hover:text-[#f5c518] hover:border-[#f5c518]/40 transition-colors">
                {q}
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

        <button
          disabled={isExecuting}
          className="w-full py-3 rounded-xl bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#f5c518]/25 transition-all"
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
          disabled={isExecuting}
          className="w-full py-3 rounded-xl bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#f5c518]/25 transition-all"
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
          disabled={isExecuting}
          className="w-full py-3 rounded-xl bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#f5c518]/25 transition-all"
        >
          <Palette className="w-4 h-4" />
          <span>Bake PBR Texture Set</span>
        </button>
      </div>
    );
  }

  return null;
};
