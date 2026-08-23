import React, { useState } from 'react';
import { 
  Sliders, 
  HelpCircle, 
  ChevronDown, 
  ChevronRight, 
  Check, 
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const RemeshPanel: React.FC = () => {
  const { 
    remeshSettings, 
    setRemeshSettings, 
    runRemeshGeneration, 
    isExecuting, 
    setActiveTool 
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
    <div id="panel-remesh" className="flex flex-col h-full overflow-y-auto px-4 py-3.5 space-y-4 text-xs select-none">
      {/* Title Header (Screenshot 1) */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setActiveTool('model')} 
            className="p-1 rounded-lg text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#1f222a]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-bold text-[#f3f4f6]">Remesh</h2>
          <HelpCircle className="w-3.5 h-3.5 text-[#6b7280]" />
        </div>
      </div>

      {/* Tabs: Auto Remesh | Manual Remesh (Screenshot 1) */}
      <div className="grid grid-cols-2 p-1 rounded-xl bg-[#111216] border border-[#232731]">
        <button
          onClick={() => setRemeshSettings(prev => ({ ...prev, tab: 'auto' }))}
          className={`py-2 rounded-lg font-medium transition-all ${
            remeshSettings.tab === 'auto'
              ? 'bg-[#232732] text-[#f5c518] shadow-sm font-semibold'
              : 'text-[#9ca3af] hover:text-[#e5e7eb]'
          }`}
        >
          Auto Remesh
        </button>
        <button
          onClick={() => setRemeshSettings(prev => ({ ...prev, tab: 'manual' }))}
          className={`py-2 rounded-lg font-medium transition-all ${
            remeshSettings.tab === 'manual'
              ? 'bg-[#232732] text-[#f5c518] shadow-sm font-semibold'
              : 'text-[#9ca3af] hover:text-[#e5e7eb]'
          }`}
        >
          Manual Remesh
        </button>
      </div>

      {/* Target Face Count */}
      <div className="space-y-2.5">
        <span className="font-medium text-[#cbd5e1]">Target Face Count</span>

        {/* Preset Chips (Low, Medium, High, Custom) */}
        <div className="grid grid-cols-4 gap-1.5">
          {(['low', 'medium', 'high', 'custom'] as const).map((p) => (
            <button
              key={p}
              onClick={() => handlePresetClick(p)}
              className={`py-1.5 rounded-lg capitalize font-medium transition-all ${
                remeshSettings.preset === p
                  ? 'bg-[#f5c518] text-[#111216] font-bold shadow-md'
                  : 'bg-[#181a20] text-[#9ca3af] hover:bg-[#232731] hover:text-[#e5e7eb] border border-[#282c37]'
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
            className="flex-1"
          />
          <span className="w-14 py-1 text-center font-mono font-bold text-xs bg-[#181a21] border border-[#2c303c] rounded-lg text-[#f5c518]">
            {Math.round(remeshSettings.targetFaces / 1000)}K
          </span>
        </div>
      </div>

      {/* Remesh Mode: Adaptive | Uniform (Screenshot 1) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[#cbd5e1] font-medium">
          <Sparkles className="w-3.5 h-3.5 text-[#f5c518]" />
          <span>Remesh Mode</span>
        </div>
        <div className="grid grid-cols-2 p-1 rounded-xl bg-[#111216] border border-[#232731]">
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, mode: 'adaptive' }))}
            className={`py-2 rounded-lg font-medium transition-all ${
              remeshSettings.mode === 'adaptive'
                ? 'bg-[#232732] text-[#f5c518] shadow-sm font-semibold'
                : 'text-[#9ca3af] hover:text-[#e5e7eb]'
            }`}
          >
            Adaptive
          </button>
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, mode: 'uniform' }))}
            className={`py-2 rounded-lg font-medium transition-all ${
              remeshSettings.mode === 'uniform'
                ? 'bg-[#232732] text-[#f5c518] shadow-sm font-semibold'
                : 'text-[#9ca3af] hover:text-[#e5e7eb]'
            }`}
          >
            Uniform
          </button>
        </div>
      </div>

      {/* Preserve Checkboxes (Screenshot 1) */}
      <div className="space-y-2">
        <span className="font-medium text-[#cbd5e1]">Preserve</span>
        <div className="grid grid-cols-2 gap-2">
          {/* Shape */}
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, preserveShape: !prev.preserveShape }))}
            className="flex items-center gap-2 text-left"
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
              remeshSettings.preserveShape ? 'bg-[#f5c518] border-[#f5c518] text-[#111216]' : 'border-[#404656]'
            }`}>
              {remeshSettings.preserveShape && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <span className="font-medium text-xs text-[#e5e7eb]">Shape</span>
          </button>

          {/* Sharp Edges */}
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, preserveSharpEdges: !prev.preserveSharpEdges }))}
            className="flex items-center gap-2 text-left"
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
              remeshSettings.preserveSharpEdges ? 'bg-[#f5c518] border-[#f5c518] text-[#111216]' : 'border-[#404656]'
            }`}>
              {remeshSettings.preserveSharpEdges && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <span className="font-medium text-xs text-[#e5e7eb]">Sharp Edges</span>
          </button>

          {/* UVs */}
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, preserveUVs: !prev.preserveUVs }))}
            className="flex items-center gap-2 text-left"
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
              remeshSettings.preserveUVs ? 'bg-[#f5c518] border-[#f5c518] text-[#111216]' : 'border-[#404656]'
            }`}>
              {remeshSettings.preserveUVs && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <span className="font-medium text-xs text-[#e5e7eb]">UVs</span>
          </button>
        </div>
      </div>

      {/* Sliders: Detail Preservation, Boundary Protection, Voxel Size */}
      <div className="space-y-3 pt-1">
        {/* Detail Preservation */}
        <div className="space-y-1">
          <div className="flex justify-between text-[#cbd5e1]">
            <span>Detail Preservation</span>
            <span className="font-mono text-[#f5c518]">{remeshSettings.detailPreservation.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={remeshSettings.detailPreservation}
            onChange={(e) => setRemeshSettings(prev => ({ ...prev, detailPreservation: parseFloat(e.target.value) }))}
            className="w-full"
          />
        </div>

        {/* Boundary Protection */}
        <div className="space-y-1">
          <div className="flex justify-between text-[#cbd5e1]">
            <span>Boundary Protection</span>
            <span className="font-mono text-[#f5c518]">{remeshSettings.boundaryProtection.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={remeshSettings.boundaryProtection}
            onChange={(e) => setRemeshSettings(prev => ({ ...prev, boundaryProtection: parseFloat(e.target.value) }))}
            className="w-full"
          />
        </div>

        {/* Voxel Size */}
        <div className="space-y-1">
          <div className="flex justify-between text-[#cbd5e1]">
            <span>Voxel Size</span>
            <span className="font-mono text-[#f5c518]">{remeshSettings.voxelSize.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.01"
            max="0.5"
            step="0.01"
            value={remeshSettings.voxelSize}
            onChange={(e) => setRemeshSettings(prev => ({ ...prev, voxelSize: parseFloat(e.target.value) }))}
            className="w-full"
          />
        </div>

        {/* Collapsible Advanced */}
        <div className="border-t border-[#232732] pt-2">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center justify-between w-full text-[#9ca3af] hover:text-[#e5e7eb] py-1"
          >
            <span className="font-medium">Advanced</span>
            {advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {advancedOpen && (
            <div className="mt-2 p-2.5 rounded-xl bg-[#121419] border border-[#232630] text-[11px] text-[#9ca3af] space-y-1">
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
          className="w-full py-3 rounded-xl bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#f5c518]/25 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Sliders className="w-4 h-4" />
          <span>{isExecuting ? 'Remeshing Topology...' : 'Generate Remesh'}</span>
        </button>

        <p className="text-center text-[10px] text-[#8e95a5]">
          Estimated Faces: <span className="text-[#e5e7eb] font-mono font-medium">{remeshSettings.targetFaces.toLocaleString()}</span>
        </p>
      </div>
    </div>
  );
};
