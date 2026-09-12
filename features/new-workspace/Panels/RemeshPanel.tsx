import React, { useState, useEffect } from 'react';
import {
  Sliders,
  ChevronDown,
  Check,
  Sparkles,
  Box,
  Loader2,
  Layers,
  Shield,
  Zap,
  Activity,
  CheckCircle2,
  Terminal,
  ArrowUpRight
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
    activeTask,
    setRightPanelMode,
  } = useWorkspace();

  // Tab State: 'budget' (primary zero-scroll view) | 'topology' (advanced constraints & preservation)
  const [panelTab, setPanelTab] = useState<'budget' | 'topology'>('budget');
  const [meshDropdownOpen, setMeshDropdownOpen] = useState(false);

  const remeshProgress = activeTask?.progress ?? 0;
  const remeshStage = (activeTask?.stage || '').toLowerCase();
  const isRemeshActive = isExecuting && activeTask?.type === 'remesh';

  const getRemeshStepState = (stepIndex: number): 'pending' | 'active' | 'completed' => {
    if (!isRemeshActive) return 'pending';
    if (activeTask?.status === 'completed' || remeshProgress >= 100) return 'completed';
    // 1: Ingestion/Preflight, 2: Clay Decimation, 3: Clay UV, 4: Clay LOD/Collision
    if (stepIndex === 1) {
      if (remeshProgress < 15) return 'pending';
      if (remeshProgress >= 65 || ['clay_postprocess', 'lod_generation', 'collision', 'completed'].includes(remeshStage)) return 'completed';
      return 'active';
    }
    if (stepIndex === 2) {
      if (remeshProgress < 65 && remeshStage !== 'clay_postprocess') return 'pending';
      if (remeshProgress >= 85 || ['lod_generation', 'collision', 'completed'].includes(remeshStage)) return 'completed';
      return 'active';
    }
    if (stepIndex === 3) {
      if (remeshProgress < 85 && remeshStage !== 'clay_postprocess') return 'pending';
      if (remeshProgress >= 92 || ['lod_generation', 'collision', 'completed'].includes(remeshStage)) return 'completed';
      return 'active';
    }
    if (stepIndex === 4) {
      if (remeshProgress < 92 && !['lod_generation', 'collision'].includes(remeshStage)) return 'pending';
      if (remeshProgress >= 100 || remeshStage === 'completed') return 'completed';
      return 'active';
    }
    return 'pending';
  };

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
      {/* Panel Header with Segmented Navigation Bar */}
      <div className="px-2.5 pt-2.5 pb-2 border-b border-white/[0.08] flex-shrink-0 space-y-2 bg-[#17181B]">
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs text-white flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-[#F9CF00]" />
            <span>Quad Remesh &amp; Retopo</span>
          </span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            {remeshSettings.mode.toUpperCase()}
          </span>
        </div>

        {/* 2-Tab Segmented Header */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-[#141518] border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setPanelTab('budget')}
            className={`py-1.5 px-2 rounded-lg font-bold text-[10px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              panelTab === 'budget'
                ? 'bg-[#F9CF00] text-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Zap className="w-3 h-3" />
            <span>Poly Budget</span>
          </button>
          <button
            type="button"
            onClick={() => setPanelTab('topology')}
            className={`py-1.5 px-2 rounded-lg font-bold text-[10px] flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              panelTab === 'topology'
                ? 'bg-[#F9CF00] text-black shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Topology &amp; Shape</span>
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2.5 pb-12 space-y-2.5 scrollbar-thin scrollbar-thumb-zinc-700/60 scrollbar-track-transparent pr-1.5">
        
        {/* ========================================================================= */}
        {/* TAB 1: BUDGET (Primary zero-scroll view)                                  */}
        {/* ========================================================================= */}
        {panelTab === 'budget' && (
          <div className="space-y-2.5">
            {/* Target 3D Mesh Selector Card */}
            <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-zinc-300 flex items-center gap-1.5">
                  <Box className="w-3.5 h-3.5 text-[#F9CF00]" />
                  <span>Target 3D Mesh</span>
                </span>
                {currentAsset ? (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                    Active
                  </span>
                ) : (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    None
                  </span>
                )}
              </div>

              {currentAsset ? (
                <div className="relative">
                  <button
                    id="btn-remesh-mesh-select"
                    type="button"
                    onClick={() => setMeshDropdownOpen(!meshDropdownOpen)}
                    className="w-full flex items-center justify-between p-1.5 rounded-lg bg-[#191A1D] border border-white/[0.08] hover:border-white/[0.16] hover:bg-[#202125] transition-all text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-1">
                      <div className="w-6 h-6 rounded bg-[#25262A] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                        <Box className="w-3.5 h-3.5 text-[#F9CF00]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-white truncate leading-tight">
                          {currentAsset.name || 'Current 3D Model'}
                        </div>
                        <div className="text-[8px] text-zinc-400 flex items-center gap-1 truncate">
                          <span>{currentAsset.triangles ? `${currentAsset.triangles.toLocaleString()} tris` : '3D Geometry'}</span>
                          <span>•</span>
                          <span className="uppercase">{currentAsset.format || currentAsset.source?.filename?.split('.').pop() || 'GLB'}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${meshDropdownOpen ? 'rotate-180 text-[#F9CF00]' : ''}`} />
                  </button>

                  {meshDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-[#191A1D] border border-white/[0.12] rounded-xl p-1.5 shadow-2xl z-50 space-y-1 max-h-44 overflow-y-auto">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 px-1.5 py-0.5">
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
                            className={`w-full flex items-center justify-between p-1.5 rounded-lg text-left text-[10px] transition-colors ${
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
                <div className="p-2 rounded-lg bg-white/[0.02] border border-dashed border-white/[0.1] text-center space-y-1">
                  <div className="text-[10px] text-zinc-400">Generate or upload a model first</div>
                  <button
                    type="button"
                    onClick={() => router.push('/workspace/generate')}
                    className="px-2.5 py-1 rounded-md bg-[#F9CF00] text-black font-bold text-[9px] hover:bg-[#ffe033] transition-colors cursor-pointer"
                  >
                    Go to Generate 3D Model
                  </button>
                </div>
              )}
            </div>

            {/* Workflow Mode: Auto Remesh | Manual Remesh */}
            <div className="grid grid-cols-2 p-0.5 rounded-lg bg-[#141518] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setRemeshSettings(prev => ({ ...prev, tab: 'auto' }))}
                className={`py-1.5 rounded-md font-bold text-[10px] transition-all cursor-pointer ${
                  remeshSettings.tab === 'auto'
                    ? 'bg-[#F9CF00] text-black shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Auto Remesh
              </button>
              <button
                type="button"
                onClick={() => setRemeshSettings(prev => ({ ...prev, tab: 'manual' }))}
                className={`py-1.5 rounded-md font-bold text-[10px] transition-all cursor-pointer ${
                  remeshSettings.tab === 'manual'
                    ? 'bg-[#F9CF00] text-black shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Manual Remesh
              </button>
            </div>

            {/* Target Face Count Section */}
            <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white uppercase tracking-wider text-[10px]">Target Poly Budget</span>
                <span className="font-mono font-bold text-xs text-[#F9CF00]">
                  {Math.round(remeshSettings.targetFaces / 1000)}K faces
                </span>
              </div>

              {/* Preset Chips (Low, Medium, High, Custom) */}
              <div className="grid grid-cols-4 gap-1">
                {(['low', 'medium', 'high', 'custom'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePresetClick(p)}
                    className={`py-1 rounded-lg capitalize font-bold transition-all text-[10px] cursor-pointer ${
                      remeshSettings.preset === p
                        ? 'bg-[#F9CF00] text-black shadow-sm font-black'
                        : 'bg-[#191A1D] text-zinc-400 hover:text-white border border-white/[0.06]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Interactive Face Count Slider */}
              <div className="pt-0.5">
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
                  className="w-full accent-[#F9CF00] cursor-pointer h-1.5 rounded-full bg-[#202125]"
                />
                <div className="flex justify-between text-[8px] text-zinc-500 font-mono mt-0.5">
                  <span>5K (Low-End)</span>
                  <span>28K (Balanced)</span>
                  <span>100K (Cine)</span>
                </div>
              </div>
            </div>

            {/* Remesh Mode: Adaptive | Uniform */}
            <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-white font-bold text-[10px] uppercase tracking-wider">
                <Sparkles className="w-3 h-3 text-[#F9CF00]" />
                <span>Topology Mode</span>
              </div>
              <div className="grid grid-cols-2 p-0.5 rounded-lg bg-[#191A1D] border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setRemeshSettings(prev => ({ ...prev, mode: 'adaptive' }))}
                  className={`py-1.5 rounded-md font-bold text-[10px] transition-all cursor-pointer ${
                    remeshSettings.mode === 'adaptive'
                      ? 'bg-[#F9CF00] text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Adaptive
                </button>
                <button
                  type="button"
                  onClick={() => setRemeshSettings(prev => ({ ...prev, mode: 'uniform' }))}
                  className={`py-1.5 rounded-md font-bold text-[10px] transition-all cursor-pointer ${
                    remeshSettings.mode === 'uniform'
                      ? 'bg-[#F9CF00] text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Uniform
                </button>
              </div>
            </div>

            {/* Quick jump link to Topology tab */}
            <div className="flex items-center justify-between pt-1 border-t border-white/[0.06] text-[9px] text-zinc-400 font-medium">
              <span>Constraints &amp; Features:</span>
              <button
                type="button"
                onClick={() => setPanelTab('topology')}
                className="hover:text-[#F9CF00] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>Shape, UVs &amp; Edge Protection</span>
                <span>&rarr;</span>
              </button>
            </div>

            {/* Live OpenX Clay Pipeline Tracker when remeshing is active */}
            {isRemeshActive && (
              <div className="p-2.5 rounded-xl bg-[#1B1E24] border border-[#F9CF00]/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-white flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#F9CF00] animate-pulse" />
                    <span>Pipeline Running</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[#F9CF00]">
                    {remeshProgress}%
                  </span>
                </div>

                <div className="text-[9px] text-zinc-300 font-mono break-words leading-tight bg-black/40 p-1.5 rounded-lg border border-white/[0.06]">
                  {activeTask?.currentStep || 'Executing retopology pipeline...'}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-white/[0.06] rounded-full h-1 overflow-hidden">
                  <div
                    className="h-full bg-[#F9CF00] transition-all duration-300 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, remeshProgress))}%` }}
                  />
                </div>

                {/* OpenX Clay Pipeline Mini-List */}
                <div className="space-y-1 pt-0.5">
                  {[
                    { id: 1, name: '1. Ingestion & Preflight' },
                    { id: 2, name: '2. OpenX Clay Decimation' },
                    { id: 3, name: '3. OpenX Clay UV Unwrapping' },
                    { id: 4, name: '4. Clay LODs & Collision Proxy' },
                  ].map((s) => {
                    const st = getRemeshStepState(s.id);
                    return (
                      <div key={s.id} className="flex items-center justify-between text-[9px] px-1">
                        <div className="flex items-center gap-1.5">
                          {st === 'completed' && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />}
                          {st === 'active' && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F9CF00] opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F9CF00]" />
                            </span>
                          )}
                          {st === 'pending' && <span className="text-zinc-600">○</span>}
                          <span className={st === 'active' ? 'text-[#F9CF00] font-bold' : st === 'completed' ? 'text-zinc-300' : 'text-zinc-500'}>
                            {s.name}
                          </span>
                        </div>
                        <span className="text-[8px] font-mono uppercase text-zinc-500">{st}</span>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setRightPanelMode('prompt')}
                  className="w-full py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white font-bold text-[9px] flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <Terminal className="w-3 h-3 text-[#F9CF00]" />
                  <span>Inspect Live Execution Logs</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Primary Action Button */}
            <div className="pt-2 border-t border-white/[0.08] space-y-1">
              <button
                id="btn-action-generate-remesh"
                type="button"
                onClick={runRemeshGeneration}
                disabled={isExecuting || (!currentAsset?.source?.viewUrl && !currentAsset?.source?.localUrl)}
                className="w-full h-10 rounded-xl bg-gradient-to-b from-[#FFE24C] to-[#F9CF00] hover:from-[#FFE660] hover:to-[#FFD700] text-black font-black tracking-wider text-xs flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(249,207,0,0.25)] hover:shadow-[0_6px_20px_rgba(249,207,0,0.35)] transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>Remeshing Topology...</span>
                  </>
                ) : !currentAsset ? (
                  <span>SELECT A MODEL FIRST</span>
                ) : (
                  <>
                    <Sliders className="w-4 h-4 stroke-[2.5]" />
                    <span>OPTIMIZE &amp; REMESH</span>
                  </>
                )}
              </button>

              <p className="text-center text-[9px] text-zinc-400">
                Target: <span className="text-white font-mono font-medium">{remeshSettings.targetFaces.toLocaleString()} tris</span>
                {currentAsset?.triangles ? (
                  <span className="text-zinc-500"> (current: {currentAsset.triangles.toLocaleString()})</span>
                ) : null}
              </p>
              <p className="text-center text-[8px] text-zinc-500 font-mono">
                OpenX Clay Pipeline: Decimation • UV Atlas • LOD Chain • Physics Collider
              </p>
              {!currentAsset && (
                <p className="text-[9px] text-amber-400/90 text-center">
                  Target mesh required. Select or generate a model above to remesh.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: TOPOLOGY (Shape constraints, edge preservation, precision sliders) */}
        {/* ========================================================================= */}
        {panelTab === 'topology' && (
          <div className="space-y-2.5">
            {/* Preserve Feature Checkboxes */}
            <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2 space-y-1.5">
              <span className="font-bold text-white uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-[#F9CF00]" />
                <span>Feature Constraints</span>
              </span>

              <div className="grid grid-cols-3 gap-1">
                {/* Shape */}
                <button
                  type="button"
                  onClick={() => setRemeshSettings(prev => ({ ...prev, preserveShape: !prev.preserveShape }))}
                  className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    remeshSettings.preserveShape
                      ? 'bg-[#191A1D] border-[#F9CF00] text-white'
                      : 'bg-[#191A1D] border-white/[0.06] text-zinc-400 hover:text-white'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
                    remeshSettings.preserveShape ? 'bg-[#F9CF00] border-[#F9CF00] text-black' : 'border-[#3d4252]'
                  }`}>
                    {remeshSettings.preserveShape && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <span className="font-bold text-[10px]">Shape</span>
                </button>

                {/* Sharp Edges */}
                <button
                  type="button"
                  onClick={() => setRemeshSettings(prev => ({ ...prev, preserveSharpEdges: !prev.preserveSharpEdges }))}
                  className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    remeshSettings.preserveSharpEdges
                      ? 'bg-[#191A1D] border-[#F9CF00] text-white'
                      : 'bg-[#191A1D] border-white/[0.06] text-zinc-400 hover:text-white'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
                    remeshSettings.preserveSharpEdges ? 'bg-[#F9CF00] border-[#F9CF00] text-black' : 'border-[#3d4252]'
                  }`}>
                    {remeshSettings.preserveSharpEdges && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <span className="font-bold text-[10px] truncate">Edges</span>
                </button>

                {/* UVs */}
                <button
                  type="button"
                  onClick={() => setRemeshSettings(prev => ({ ...prev, preserveUVs: !prev.preserveUVs }))}
                  className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                    remeshSettings.preserveUVs
                      ? 'bg-[#191A1D] border-[#F9CF00] text-white'
                      : 'bg-[#191A1D] border-white/[0.06] text-zinc-400 hover:text-white'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
                    remeshSettings.preserveUVs ? 'bg-[#F9CF00] border-[#F9CF00] text-black' : 'border-[#3d4252]'
                  }`}>
                    {remeshSettings.preserveUVs && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <span className="font-bold text-[10px]">UVs</span>
                </button>
              </div>
            </div>

            {/* Sliders: Detail Preservation, Boundary Protection, Voxel Size */}
            <div className="rounded-xl border border-white/[0.08] bg-[#141518] p-2 space-y-2">
              <span className="font-bold text-white uppercase tracking-wider text-[10px]">Precision Tuning</span>

              {/* Detail Preservation */}
              <div className="space-y-1">
                <div className="flex justify-between text-zinc-300 text-[10px]">
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
                  className="w-full accent-[#F9CF00] cursor-pointer h-1.5 rounded-full bg-[#202125]"
                />
              </div>

              {/* Boundary Protection */}
              <div className="space-y-1">
                <div className="flex justify-between text-zinc-300 text-[10px]">
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
                  className="w-full accent-[#F9CF00] cursor-pointer h-1.5 rounded-full bg-[#202125]"
                />
              </div>

              {/* Voxel Size */}
              <div className="space-y-1">
                <div className="flex justify-between text-zinc-300 text-[10px]">
                  <span>Voxel Remesh Size</span>
                  <span className="font-mono text-[#F9CF00] font-bold">{remeshSettings.voxelSize.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="0.5"
                  step="0.01"
                  value={remeshSettings.voxelSize}
                  onChange={(e) => setRemeshSettings(prev => ({ ...prev, voxelSize: parseFloat(e.target.value) }))}
                  className="w-full accent-[#F9CF00] cursor-pointer h-1.5 rounded-full bg-[#202125]"
                />
              </div>
            </div>

            {/* Engine Info Box */}
            <div className="p-2 rounded-xl bg-[#141518] border border-white/[0.08] text-[9px] text-zinc-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>Algorithm</span>
                <span className="text-zinc-200 font-mono">Instant-NGP Quad Decimator</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Feature Angle Threshold</span>
                <span className="text-zinc-200 font-mono">45°</span>
              </div>
            </div>

            {/* Back Button */}
            <button
              type="button"
              onClick={() => setPanelTab('budget')}
              className="w-full py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold text-[10px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>&larr; Back to Poly Budget</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
