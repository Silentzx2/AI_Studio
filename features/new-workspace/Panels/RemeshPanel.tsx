import React, { useState } from 'react';
import { 
  Sliders, 
  HelpCircle, 
  ChevronDown, 
  ChevronRight, 
  Check, 
  Sparkles,
  ArrowLeft,
  AlertCircle
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const RemeshPanel: React.FC = () => {
  const { 
    remeshSettings, 
    setRemeshSettings, 
    runRemeshGeneration, 
    isExecuting, 
    setActiveTool,
    currentAsset,
    systemStats
  } = useWorkspace();

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handlePresetClick = (preset: 'low' | 'medium' | 'high' | 'custom') => {
    let faces = remeshSettings.targetFaces;
    if (preset === 'low') faces = 12000;
    else if (preset === 'medium') faces = 28000;
    else if (preset === 'high') faces = 50000;
    
    setRemeshSettings(prev => ({
      ...prev,
      preset,
      targetFaces: faces
    }));
  };

  return (
    <div id="panel-remesh" className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-4 text-xs select-none bg-[#14161b]">
      {/* Tabs: Auto Remesh | Manual Remesh (Screenshot 1) */}
      <div className="grid grid-cols-2 p-1 rounded-xl bg-[#1c1f26] border border-[#272a34]">
        <button
          onClick={() => setRemeshSettings(prev => ({ ...prev, tab: 'auto' }))}
          className={`py-2 rounded-lg font-bold text-xs transition-all ${
            remeshSettings.tab === 'auto'
              ? 'bg-[#F9CF00] text-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Auto Remesh
        </button>
        <button
          onClick={() => setRemeshSettings(prev => ({ ...prev, tab: 'manual' }))}
          className={`py-2 rounded-lg font-bold text-xs transition-all ${
            remeshSettings.tab === 'manual'
              ? 'bg-[#F9CF00] text-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Manual Remesh
        </button>
      </div>

      {/* Target Face Count */}
      <div className="space-y-2.5">
        <span className="font-bold text-white uppercase tracking-wider text-[11px]">Target Face Count</span>

        {/* Preset Chips (Low, Medium, High, Custom) */}
        <div className="grid grid-cols-4 gap-1.5">
          {(['low', 'medium', 'high', 'custom'] as const).map((p) => (
            <button
              key={p}
              onClick={() => handlePresetClick(p)}
              className={`py-1.5 rounded-lg capitalize font-bold transition-all text-xs ${
                remeshSettings.preset === p
                  ? 'bg-[#F9CF00] text-black shadow-md'
                  : 'bg-[#1c1f26] text-zinc-400 hover:bg-[#282b34] hover:text-white border border-[#272a34]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Interactive Face Count Slider & Badge */}
        <div className="flex items-center gap-3 pt-1">
          <input
            type="range"
            min="5000"
            max="100000"
            step="1000"
            value={remeshSettings.targetFaces}
            onChange={(e) => setRemeshSettings(prev => ({
              ...prev,
              preset: 'custom',
              targetFaces: parseInt(e.target.value)
            }))}
            className="flex-1 accent-[#F9CF00]"
          />
          <span className="w-14 py-1 text-center font-mono font-bold text-xs bg-[#1c1f26] border border-[#272a34] rounded-lg text-[#F9CF00]">
            {Math.round(remeshSettings.targetFaces / 1000)}K
          </span>
        </div>
      </div>

      {/* Remesh Mode: Adaptive | Uniform (Screenshot 1) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-white font-bold text-[11px] uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-[#F9CF00] stroke-[2.2]" />
          <span>Remesh Mode</span>
        </div>
        <div className="grid grid-cols-2 p-1 rounded-xl bg-[#1c1f26] border border-[#272a34]">
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, mode: 'adaptive' }))}
            className={`py-2 rounded-lg font-bold text-xs transition-all ${
              remeshSettings.mode === 'adaptive'
                ? 'bg-[#F9CF00] text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Adaptive
          </button>
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, mode: 'uniform' }))}
            className={`py-2 rounded-lg font-bold text-xs transition-all ${
              remeshSettings.mode === 'uniform'
                ? 'bg-[#F9CF00] text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Uniform
          </button>
        </div>
      </div>

      {/* Preserve Checkboxes (Screenshot 1) */}
      <div className="space-y-2">
        <span className="font-bold text-white uppercase tracking-wider text-[11px]">Preserve</span>
        <div className="grid grid-cols-2 gap-2">
          {/* Shape */}
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, preserveShape: !prev.preserveShape }))}
            className="flex items-center gap-2 text-left p-2 rounded-lg bg-[#1c1f26] border border-[#272a34] hover:border-[#3d4252]"
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
              remeshSettings.preserveShape ? 'bg-[#F9CF00] border-[#F9CF00] text-black' : 'border-[#3d4252]'
            }`}>
              {remeshSettings.preserveShape && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <span className="font-bold text-xs text-white">Shape</span>
          </button>

          {/* Sharp Edges */}
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, preserveSharpEdges: !prev.preserveSharpEdges }))}
            className="flex items-center gap-2 text-left p-2 rounded-lg bg-[#1c1f26] border border-[#272a34] hover:border-[#3d4252]"
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
              remeshSettings.preserveSharpEdges ? 'bg-[#F9CF00] border-[#F9CF00] text-black' : 'border-[#3d4252]'
            }`}>
              {remeshSettings.preserveSharpEdges && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <span className="font-bold text-xs text-white">Sharp Edges</span>
          </button>

          {/* UVs */}
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, preserveUVs: !prev.preserveUVs }))}
            className="flex items-center gap-2 text-left p-2 rounded-lg bg-[#1c1f26] border border-[#272a34] hover:border-[#3d4252]"
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
              remeshSettings.preserveUVs ? 'bg-[#F9CF00] border-[#F9CF00] text-black' : 'border-[#3d4252]'
            }`}>
              {remeshSettings.preserveUVs && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <span className="font-bold text-xs text-white">UVs</span>
          </button>
        </div>
      </div>

      {/* Sliders: Detail Preservation, Boundary Protection, Voxel Size */}
      <div className="space-y-3 pt-1">
        {/* Detail Preservation */}
        <div className="space-y-1">
          <div className="flex justify-between text-white font-medium">
            <span>Detail Preservation</span>
            <span className="font-mono text-[#F9CF00] font-bold">{remeshSettings.detailPreservation.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={remeshSettings.detailPreservation}
            onChange={(e) => setRemeshSettings(prev => ({ ...prev, detailPreservation: parseFloat(e.target.value) }))}
            className="w-full accent-[#F9CF00]"
          />
        </div>

        {/* Boundary Protection */}
        <div className="space-y-1">
          <div className="flex justify-between text-white font-medium">
            <span>Boundary Protection</span>
            <span className="font-mono text-[#F9CF00] font-bold">{remeshSettings.boundaryProtection.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={remeshSettings.boundaryProtection}
            onChange={(e) => setRemeshSettings(prev => ({ ...prev, boundaryProtection: parseFloat(e.target.value) }))}
            className="w-full accent-[#F9CF00]"
          />
        </div>

        {/* Voxel Size */}
        <div className="space-y-1">
          <div className="flex justify-between text-white font-medium">
            <span>Voxel Size</span>
            <span className="font-mono text-[#F9CF00] font-bold">{remeshSettings.voxelSize.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.01"
            max="0.5"
            step="0.01"
            value={remeshSettings.voxelSize}
            onChange={(e) => setRemeshSettings(prev => ({ ...prev, voxelSize: parseFloat(e.target.value) }))}
            className="w-full accent-[#F9CF00]"
          />
        </div>

        {/* Collapsible Advanced */}
        <div className="border-t border-[#272a34] pt-2">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center justify-between w-full text-zinc-400 hover:text-white py-1 font-bold text-xs"
          >
            <span>Advanced Config</span>
            {advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {advancedOpen && (
            <div className="mt-2 p-2.5 rounded-xl bg-[#1c1f26] border border-[#272a34] text-[11px] text-zinc-300 space-y-1">
              <div>Algorithm: Instant-NGP Quad Decimator</div>
              <div>Feature Angle Threshold: 45°</div>
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Button (Screenshot 1) */}
      <div className="pt-2 space-y-1.5">
        <button
          id="btn-action-generate-remesh"
          onClick={runRemeshGeneration}
          disabled={isExecuting}
          className="w-full py-3.5 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Sliders className="w-4 h-4 stroke-[2.2]" />
          <span>{isExecuting ? 'Remeshing Topology...' : 'GENERATE REMESH'}</span>
        </button>

        <p className="text-center text-[10px] text-zinc-400">
          Estimated Faces: <span className="text-white font-mono font-medium">{remeshSettings.targetFaces.toLocaleString()}</span>
        </p>
      </div>
    </div>
  );
};
