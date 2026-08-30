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
    <div id="panel-remesh" className="flex flex-col h-full overflow-hidden px-3 py-3 space-y-3 text-xs select-none">
      {/* Title Header (Screenshot 1) */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setActiveTool('model')} 
            className="p-1 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-3))]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-xs font-bold text-[hsl(var(--foreground))]">Remesh</h2>
          <HelpCircle className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
        </div>
      </div>

      {/* Tabs: Auto Remesh | Manual Remesh (Screenshot 1) */}
      <div className="grid grid-cols-2 p-1 rounded-xl bg-[hsl(var(--surface-0))] border border-[hsl(var(--border))]">
        <button
          onClick={() => setRemeshSettings(prev => ({ ...prev, tab: 'auto' }))}
          className={`py-2 rounded-lg font-medium transition-all ${
            remeshSettings.tab === 'auto'
              ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))] shadow-sm font-semibold'
              : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
          }`}
        >
          Auto Remesh
        </button>
        <button
          onClick={() => setRemeshSettings(prev => ({ ...prev, tab: 'manual' }))}
          className={`py-2 rounded-lg font-medium transition-all ${
            remeshSettings.tab === 'manual'
              ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))] shadow-sm font-semibold'
              : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
          }`}
        >
          Manual Remesh
        </button>
      </div>

      {/* Target Face Count */}
      <div className="space-y-2.5">
        <span className="font-medium text-[hsl(var(--foreground))]">Target Face Count</span>

        {/* Preset Chips (Low, Medium, High, Custom) */}
        <div className="grid grid-cols-4 gap-1.5">
          {(['low', 'medium', 'high', 'custom'] as const).map((p) => (
            <button
              key={p}
              onClick={() => handlePresetClick(p)}
              className={`py-1.5 rounded-lg capitalize font-medium transition-all ${
                remeshSettings.preset === p
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-0))] font-bold shadow-md'
                  : 'bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--border))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))]'
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
          <span className="w-14 py-1 text-center font-mono font-bold text-xs bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-lg text-[hsl(var(--primary))]">
            {Math.round(remeshSettings.targetFaces / 1000)}K
          </span>
        </div>
      </div>

      {/* Remesh Mode: Adaptive | Uniform (Screenshot 1) */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[hsl(var(--foreground))] font-medium">
          <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--primary))]" />
          <span>Remesh Mode</span>
        </div>
        <div className="grid grid-cols-2 p-1 rounded-xl bg-[hsl(var(--surface-0))] border border-[hsl(var(--border))]">
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, mode: 'adaptive' }))}
            className={`py-2 rounded-lg font-medium transition-all ${
              remeshSettings.mode === 'adaptive'
                ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))] shadow-sm font-semibold'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            Adaptive
          </button>
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, mode: 'uniform' }))}
            className={`py-2 rounded-lg font-medium transition-all ${
              remeshSettings.mode === 'uniform'
                ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))] shadow-sm font-semibold'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            Uniform
          </button>
        </div>
      </div>

      {/* Preserve Checkboxes (Screenshot 1) */}
      <div className="space-y-2">
        <span className="font-medium text-[hsl(var(--foreground))]">Preserve</span>
        <div className="grid grid-cols-2 gap-2">
          {/* Shape */}
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, preserveShape: !prev.preserveShape }))}
            className="flex items-center gap-2 text-left"
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
              remeshSettings.preserveShape ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))] text-[hsl(var(--surface-0))]' : 'border-[hsl(var(--border))]'
            }`}>
              {remeshSettings.preserveShape && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <span className="font-medium text-xs text-[hsl(var(--foreground))]">Shape</span>
          </button>

          {/* Sharp Edges */}
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, preserveSharpEdges: !prev.preserveSharpEdges }))}
            className="flex items-center gap-2 text-left"
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
              remeshSettings.preserveSharpEdges ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))] text-[hsl(var(--surface-0))]' : 'border-[hsl(var(--border))]'
            }`}>
              {remeshSettings.preserveSharpEdges && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <span className="font-medium text-xs text-[hsl(var(--foreground))]">Sharp Edges</span>
          </button>

          {/* UVs */}
          <button
            onClick={() => setRemeshSettings(prev => ({ ...prev, preserveUVs: !prev.preserveUVs }))}
            className="flex items-center gap-2 text-left"
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
              remeshSettings.preserveUVs ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))] text-[hsl(var(--surface-0))]' : 'border-[hsl(var(--border))]'
            }`}>
              {remeshSettings.preserveUVs && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
            <span className="font-medium text-xs text-[hsl(var(--foreground))]">UVs</span>
          </button>
        </div>
      </div>

      {/* Sliders: Detail Preservation, Boundary Protection, Voxel Size */}
      <div className="space-y-3 pt-1">
        {/* Detail Preservation */}
        <div className="space-y-1">
          <div className="flex justify-between text-[hsl(var(--foreground))]">
            <span>Detail Preservation</span>
            <span className="font-mono text-[hsl(var(--primary))]">{remeshSettings.detailPreservation.toFixed(2)}</span>
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
          <div className="flex justify-between text-[hsl(var(--foreground))]">
            <span>Boundary Protection</span>
            <span className="font-mono text-[hsl(var(--primary))]">{remeshSettings.boundaryProtection.toFixed(2)}</span>
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
          <div className="flex justify-between text-[hsl(var(--foreground))]">
            <span>Voxel Size</span>
            <span className="font-mono text-[hsl(var(--primary))]">{remeshSettings.voxelSize.toFixed(2)}</span>
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
        <div className="border-t border-[hsl(var(--surface-3))] pt-2">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center justify-between w-full text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] py-1"
          >
            <span className="font-medium">Advanced</span>
            {advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {advancedOpen && (
            <div className="mt-2 p-2.5 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] text-[11px] text-[hsl(var(--muted-foreground))] space-y-1">
              <div>Algorithm: Instant-NGP Quad Decimator</div>
              <div>Feature Angle Threshold: 45°</div>
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Button (Screenshot 1) */}
      <div className="pt-2 space-y-1.5">
        {systemStats.status !== 'online' && (
          <div className="p-2.5 rounded-xl bg-[hsl(var(--destructive))/10] border border-[hsl(var(--destructive))]/30 text-[10px] text-[hsl(var(--destructive))] flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Backend offline — remeshing requires a running FastAPI server.</span>
          </div>
        )}
        <button
          id="btn-action-generate-remesh"
          onClick={runRemeshGeneration}
          disabled={isExecuting || systemStats.status !== 'online'}
          className="w-full py-3 rounded-xl bg-[hsl(var(--primary))] hover:brightness-110 text-[hsl(var(--surface-0))] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[hsl(var(--primary))]/25 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Sliders className="w-4 h-4" />
          <span>{isExecuting ? 'Remeshing Topology...' : 'Generate Remesh'}</span>
        </button>

        <p className="text-center text-[10px] text-[hsl(var(--muted-foreground))]">
          Estimated Faces: <span className="text-[hsl(var(--foreground))] font-mono font-medium">{remeshSettings.targetFaces.toLocaleString()}</span>
        </p>
      </div>
    </div>
  );
};
