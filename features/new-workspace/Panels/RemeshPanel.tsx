import React, { useState, useEffect } from 'react';
import {
  Sliders,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Check,
  Sparkles,
  ArrowLeft,
  AlertCircle,
  Box,
  Loader2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '../store/WorkspaceContext';

export const RemeshPanel: React.FC = () => {
  const router = useRouter();
  const {
    remeshSettings,
    setRemeshSettings,
    runRemeshGeneration,
    isExecuting,
    currentAsset,
    assets,
    selectAsset,
  } = useWorkspace();

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [meshDropdownOpen, setMeshDropdownOpen] = useState(false);

  // Auto-select first asset if none currently selected
  useEffect(() => {
    if (!currentAsset && assets.length > 0) {
      selectAsset(assets[0].id);
    }
  }, [currentAsset, assets, selectAsset]);

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
    <div id="panel-remesh" className="flex flex-col h-full overflow-hidden bg-[#191A1D] text-xs select-none">
      {/* Panel Header */}
      <div className="px-3 py-2.5 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0">
        <span className="font-bold text-[11px] text-white flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#F9CF00]" />
          <span>Quad Remesh</span>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 py-2.5 pb-12 space-y-3 scrollbar-thin scrollbar-thumb-zinc-700/60 scrollbar-track-transparent pr-1.5">
        {/* Target 3D Mesh Selector Card */}
        <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-white">
              <Box className="w-3.5 h-3.5 text-[#F9CF00]" />
              <span>Target 3D Mesh</span>
            </div>
            {currentAsset ? (
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                Mesh Selected
              </span>
            ) : (
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                No Mesh Selected
              </span>
            )}
          </div>

          {currentAsset ? (
            <div className="space-y-1.5">
              <button
                id="btn-remesh-mesh-select"
                type="button"
                onClick={() => setMeshDropdownOpen(!meshDropdownOpen)}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-[#191A1D] border border-white/[0.08] hover:border-white/[0.16] hover:bg-[#202125] transition-all text-left cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0 pr-1">
                  <div className="w-7 h-7 rounded-md bg-[#25262A] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <Box className="w-4 h-4 text-[#F9CF00]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-white truncate">
                      {currentAsset.name || 'Current 3D Model'}
                    </div>
                    <div className="text-[8px] text-zinc-400 flex items-center gap-1.5 truncate">
                      <span>{currentAsset.triangles ? `${currentAsset.triangles.toLocaleString()} tris` : '3D Geometry'}</span>
                      <span>•</span>
                      <span className="uppercase">{currentAsset.format || currentAsset.source?.filename?.split('.').pop() || 'GLB'}</span>
                    </div>
                  </div>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${meshDropdownOpen ? 'rotate-180 text-[#F9CF00]' : ''}`} />
              </button>

              {meshDropdownOpen && (
                <div className="p-1.5 rounded-lg bg-[#191A1D] border border-white/[0.12] space-y-1 max-h-40 overflow-y-auto">
                  <div className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 px-1 py-0.5">
                    Workspace Meshes ({assets.length})
                  </div>
                  {assets.map((asset) => {
                    const isSel = asset.id === currentAsset.id;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => {
                          selectAsset(asset.id);
                          setMeshDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between p-1.5 rounded-md text-left text-[9px] transition-colors ${
                          isSel ? 'bg-[#F9CF00] text-black font-bold' : 'text-zinc-300 hover:bg-[#25262A] hover:text-white'
                        }`}
                      >
                        <span className="truncate">{asset.name}</span>
                        {isSel && <Check className="w-3 h-3 text-black flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-dashed border-white/[0.1] text-center space-y-2">
              <div className="text-[10px] text-zinc-300 font-medium">
                No 3D models in workspace
              </div>
              <div className="text-[8px] text-zinc-500">
                Generate a mesh first in the Generate tab or upload a model to remesh.
              </div>
              <button
                type="button"
                onClick={() => router.push('/workspace/generate')}
                className="px-2.5 py-1 rounded-md bg-[#F9CF00] hover:bg-[#ffe033] text-black font-bold text-[9px] transition-colors cursor-pointer"
              >
                Go to Generate 3D Model
              </button>
            </div>
          )}
        </div>

      {/* Tabs: Auto Remesh | Manual Remesh */}
      <div className="grid grid-cols-2 p-1 rounded-lg bg-[#1c1f26] border border-[#272a34]">
        <button
          onClick={() => setRemeshSettings(prev => ({ ...prev, tab: 'auto' }))}
          className={`py-1.5 rounded-md font-bold text-[10px] transition-all ${
            remeshSettings.tab === 'auto'
              ? 'bg-[#F9CF00] text-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Auto Remesh
        </button>
        <button
          onClick={() => setRemeshSettings(prev => ({ ...prev, tab: 'manual' }))}
          className={`py-1.5 rounded-md font-bold text-[10px] transition-all ${
            remeshSettings.tab === 'manual'
              ? 'bg-[#F9CF00] text-black shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Manual Remesh
        </button>
      </div>

      {/* Target Face Count */}
      <div className="space-y-2">
        <span className="font-bold text-white uppercase tracking-wider text-[10px]">Target Face Count</span>

        {/* Preset Chips (Low, Medium, High, Custom) */}
        <div className="grid grid-cols-4 gap-1">
          {(['low', 'medium', 'high', 'custom'] as const).map((p) => (
            <button
              key={p}
              onClick={() => handlePresetClick(p)}
              className={`py-1 rounded-md capitalize font-bold transition-all text-[10px] ${
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
        <div className="flex items-center gap-2 pt-0.5">
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
          <span className="w-12 py-0.5 text-center font-mono font-bold text-[10px] bg-[#1c1f26] border border-[#272a34] rounded-md text-[#F9CF00]">
            {Math.round(remeshSettings.targetFaces / 1000)}K
          </span>
        </div>
      </div>

      {/* Remesh Mode: Adaptive | Uniform */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-white font-bold text-[10px] uppercase tracking-wider">
          <Sparkles className="w-3 h-3 text-[#F9CF00] stroke-[2.2]" />
          <span>Remesh Mode</span>
        </div>
        <div className="grid grid-cols-2 p-1 rounded-lg bg-[#1c1f26] border border-[#272a34]">
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, mode: 'adaptive' }))}
            className={`py-1.5 rounded-md font-bold text-[10px] transition-all ${
              remeshSettings.mode === 'adaptive'
                ? 'bg-[#F9CF00] text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Adaptive
          </button>
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, mode: 'uniform' }))}
            className={`py-1.5 rounded-md font-bold text-[10px] transition-all ${
              remeshSettings.mode === 'uniform'
                ? 'bg-[#F9CF00] text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Uniform
          </button>
        </div>
      </div>

      {/* Preserve Checkboxes */}
      <div className="space-y-1.5">
        <span className="font-bold text-white uppercase tracking-wider text-[10px]">Preserve</span>
        <div className="grid grid-cols-2 gap-1">
          {/* Shape */}
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, preserveShape: !prev.preserveShape }))}
            className="flex items-center gap-1.5 text-left p-1.5 rounded-md bg-[#1c1f26] border border-[#272a34] hover:border-[#3d4252]"
          >
            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
              remeshSettings.preserveShape ? 'bg-[#F9CF00] border-[#F9CF00] text-black' : 'border-[#3d4252]'
            }`}>
              {remeshSettings.preserveShape && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </div>
            <span className="font-bold text-[10px] text-white">Shape</span>
          </button>

          {/* Sharp Edges */}
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, preserveSharpEdges: !prev.preserveSharpEdges }))}
            className="flex items-center gap-1.5 text-left p-1.5 rounded-md bg-[#1c1f26] border border-[#272a34] hover:border-[#3d4252]"
          >
            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
              remeshSettings.preserveSharpEdges ? 'bg-[#F9CF00] border-[#F9CF00] text-black' : 'border-[#3d4252]'
            }`}>
              {remeshSettings.preserveSharpEdges && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </div>
            <span className="font-bold text-[10px] text-white">Sharp Edges</span>
          </button>

          {/* UVs */}
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, preserveUVs: !prev.preserveUVs }))}
            className="flex items-center gap-1.5 text-left p-1.5 rounded-md bg-[#1c1f26] border border-[#272a34] hover:border-[#3d4252]"
          >
            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
              remeshSettings.preserveUVs ? 'bg-[#F9CF00] border-[#F9CF00] text-black' : 'border-[#3d4252]'
            }`}>
              {remeshSettings.preserveUVs && <Check className="w-2.5 h-2.5 stroke-[3]" />}
            </div>
            <span className="font-bold text-[10px] text-white">UVs</span>
          </button>
        </div>
      </div>

      {/* Sliders: Detail Preservation, Boundary Protection, Voxel Size */}
      <div className="space-y-2 pt-0.5">
        {/* Detail Preservation */}
        <div className="space-y-0.5">
          <div className="flex justify-between text-white font-medium text-[10px]">
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
        <div className="space-y-0.5">
          <div className="flex justify-between text-white font-medium text-[10px]">
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
        <div className="space-y-0.5">
          <div className="flex justify-between text-white font-medium text-[10px]">
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
        <div className="border-t border-[#272a34] pt-1.5">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center justify-between w-full text-zinc-400 hover:text-white py-0.5 font-bold text-[10px]"
          >
            <span>Advanced Config</span>
            {advancedOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {advancedOpen && (
            <div className="mt-1.5 p-2 rounded-lg bg-[#1c1f26] border border-[#272a34] text-[10px] text-zinc-300 space-y-0.5">
              <div>Algorithm: Instant-NGP Quad Decimator</div>
              <div>Feature Angle Threshold: 45°</div>
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="pt-2 border-t border-white/[0.08] space-y-1">
        <button
          id="btn-action-generate-remesh"
          onClick={runRemeshGeneration}
          disabled={isExecuting || (!currentAsset?.source?.viewUrl && !currentAsset?.source?.localUrl)}
          className="w-full h-10 rounded-xl bg-[#F9CF00] hover:bg-[#ffe033] text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Remeshing Topology...</span>
            </>
          ) : !currentAsset ? (
            <span>SELECT A MODEL FIRST</span>
          ) : (
            <>
              <Sliders className="w-4 h-4 stroke-[2.2]" />
              <span>OPTIMIZE &amp; REMESH</span>
            </>
          )}
        </button>

        <p className="text-center text-[9px] text-zinc-400">
          Target Budget: <span className="text-white font-mono font-medium">{remeshSettings.targetFaces.toLocaleString()} tris</span>
          {currentAsset?.triangles ? (
            <span className="text-zinc-500"> (current: {currentAsset.triangles.toLocaleString()})</span>
          ) : null}
        </p>
        {!currentAsset && (
          <p className="text-[8px] text-amber-400/80 text-center">
            Target mesh required. Select or generate a model above to remesh it.
          </p>
        )}
      </div>
      </div>
    </div>
  );
};
