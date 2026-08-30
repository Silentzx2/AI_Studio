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

  if (tool === 'remesh') {
    return (
      <div className="flex flex-col h-full overflow-hidden px-3 py-3 space-y-3 text-xs select-none">
        <div className="flex items-center gap-2 pb-1">
          <div className="w-6 h-6 rounded-md bg-[hsl(var(--primary))]/20 flex items-center justify-center text-[hsl(var(--primary))]">
            <Hexagon className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-[hsl(var(--foreground))]">Adaptive Remesh</h2>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">Quad topology, decimation & boundary protection</p>
          </div>
        </div>

        <p className="text-[hsl(var(--muted-foreground))]">
          Decimate, remesh, and optimize meshes with adaptive edge collapse and boundary preservation.
        </p>

        <div className="space-y-1.5">
          <span className="font-medium text-[hsl(var(--foreground))]">Target Polycount</span>
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
                    ? 'bg-[hsl(var(--primary))]/15 border-[hsl(var(--primary))]/60 text-[hsl(var(--primary))]'
                    : 'bg-[hsl(var(--surface-1))] border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))]/40'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[hsl(var(--muted-foreground))]">Current Topology:</span>
            <span className="font-mono text-[hsl(var(--primary))]">{currentAsset ? (currentAsset.statsAvailable ? `${currentAsset.topology} (${currentAsset.faces.toLocaleString()} faces)` : 'Geometry stats unavailable') : 'No asset selected'}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[hsl(var(--muted-foreground))]">Edge Loop Flow:</span>
            <span className="font-mono text-[hsl(var(--neon-green))]">Anatomical</span>
          </div>
        </div>

        {systemStats.status !== 'online' && (
          <div className="p-2.5 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--destructive))]/30 text-[10px] text-[hsl(var(--destructive))]">
            Backend offline — retopology requires a running FastAPI server.
          </div>
        )}

        <button
          onClick={() => void runRemeshGeneration()}
          disabled={isExecuting || systemStats.status !== 'online'}
          className="w-full py-3 rounded-xl bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] text-[hsl(var(--surface-1))] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[hsl(var(--primary))]/25 transition-all disabled:opacity-50"
        >
          <Hexagon className="w-4 h-4" />
          <span>Execute Quad Retopo</span>
        </button>
      </div>
    );
  }

  if (tool === 'edit') {
    return (
      <div className="flex flex-col h-full overflow-hidden px-3 py-3 space-y-3 text-xs select-none">
        <div className="flex items-center gap-2 pb-1">
          <div className="w-6 h-6 rounded-md bg-[hsl(var(--primary))]/20 flex items-center justify-center text-[hsl(var(--primary))]">
            <Pencil className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-xs font-bold text-[hsl(var(--foreground))]">3D Sculpt & Edit</h2>
        </div>
        <p className="text-[hsl(var(--muted-foreground))]">Interactive vertex push, smooth, inflate, pinch and symmetry sculpting tools.</p>
        <div className="grid grid-cols-2 gap-2">
          {['Grab / Move', 'Smooth', 'Inflate', 'Pinch', 'Flatten', 'Clay Strips'].map((brush) => (
            <button key={brush} className="p-2.5 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-1))] text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] font-medium text-left transition-colors">
              {brush}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (tool === 'upscale') {
    return (
      <div className="flex flex-col h-full overflow-hidden px-3 py-3 space-y-3 text-xs select-none">
        <div className="flex items-center gap-2 pb-1">
          <div className="w-6 h-6 rounded-md bg-[hsl(var(--primary))]/20 flex items-center justify-center text-[hsl(var(--primary))]">
            <Maximize className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-xs font-bold text-[hsl(var(--foreground))]">3D AI Upscale</h2>
        </div>
        <p className="text-[hsl(var(--muted-foreground))]">Increase texture resolution from 1K to 4K/8K and subdivide high-frequency surface details.</p>
        <div className="space-y-1.5">
          <span className="font-medium text-[hsl(var(--foreground))]">Upscale Factor</span>
          <div className="grid grid-cols-3 gap-1.5">
            {['2X Super', '4X Ultra', '8K Production'].map((f) => (
              <button key={f} className="p-2 rounded-lg bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] font-medium hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))]/40 transition-colors">
                {f}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => void runRemeshGeneration()}
          disabled={isExecuting || systemStats.status !== 'online'}
          className="w-full py-3 rounded-xl bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] text-[hsl(var(--surface-1))] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[hsl(var(--primary))]/25 transition-all disabled:opacity-50"
        >
          <Maximize className="w-4 h-4" />
          <span>Execute 3D Upscale</span>
        </button>
      </div>
    );
  }

  if (tool === 'pbr') {
    return (
      <div className="flex flex-col h-full overflow-hidden px-3 py-3 space-y-3 text-xs select-none">
        <div className="flex items-center gap-2 pb-1">
          <div className="w-6 h-6 rounded-md bg-[hsl(var(--primary))]/20 flex items-center justify-center text-[hsl(var(--primary))]">
            <Palette className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-xs font-bold text-[hsl(var(--foreground))]">PBR Material Baker</h2>
        </div>
        <p className="text-[hsl(var(--muted-foreground))]">Bake physically based rendering channels (Albedo, Normal, Roughness, Metallic, Height, AO) using 3D Generation Pipeline nodes.</p>
        <button
          onClick={() => void runTextureGeneration()}
          disabled={isExecuting || systemStats.status !== 'online'}
          className="w-full py-3 rounded-xl bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] text-[hsl(var(--surface-1))] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[hsl(var(--primary))]/25 transition-all disabled:opacity-50"
        >
          <Palette className="w-4 h-4" />
          <span>Bake PBR Texture Set</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full items-center justify-center px-3 py-3 text-xs select-none">
      <div className="w-10 h-10 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] mb-3">
        <Layers className="w-5 h-5" />
      </div>
      <p className="text-[hsl(var(--muted-foreground))] text-center">This tool is not available yet.</p>
    </div>
  );
};
