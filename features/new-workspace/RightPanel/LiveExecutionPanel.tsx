import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  StopCircle,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  Cpu,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  Box,
  Terminal,
  Layers
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

interface PipelineStep {
  id: string;
  name: string;
  state: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
  skipReason?: string;
  detail?: string;
}

export const LiveExecutionPanel: React.FC = () => {
  const {
    activeTask,
    isExecuting,
    cancelExecution,
    systemStats,
    generationSettings,
    setGenerationSettings,
    generate3DModel,
    setActiveTool,
    currentAsset,
    setRightPanelMode
  } = useWorkspace();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Timer tracking
  useEffect(() => {
    if (!activeTask?.startedAt || !isExecuting) return;
    setElapsedSeconds(Math.floor((Date.now() - activeTask.startedAt) / 1000));
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - activeTask.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeTask?.startedAt, isExecuting]);

  const logs = activeTask?.logs || [];

  // Auto-scroll logs to bottom as they arrive
  useEffect(() => {
    if (logs.length > 0) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length]);

  if (!activeTask && !isExecuting) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center text-zinc-400 bg-[#14161A] select-none">
        <div className="w-10 h-10 rounded-xl bg-[#1B1E24] border border-white/[0.08] flex items-center justify-center text-zinc-500 mb-2">
          <Clock className="w-5 h-5 stroke-[1.5]" />
        </div>
        <div className="text-xs font-semibold text-white">No Active Generation</div>
        <p className="text-[11px] text-zinc-400 mt-1 max-w-[200px]">
          Start a 3D generation or post-processing job to inspect the live execution pipeline.
        </p>
      </div>
    );
  }

  const isCompleted = activeTask?.status === 'completed';
  const isFailed = activeTask?.status === 'failed' || activeTask?.status === 'interrupted';
  const isRunning = isExecuting || activeTask?.status === 'running' || activeTask?.status === 'queued';

  // Active parameters
  const modelName = activeTask?.provider || generationSettings.aiModel || 'Generative Engine';
  const textureEnabled = generationSettings.generateTexture !== false;
  const optimizeEnabled = generationSettings.autoOptimize !== false;
  const progress = activeTask?.progress ?? 0;
  const stageName = (activeTask?.stage || '').toLowerCase();
  const stepText = (activeTask?.currentStep || '').toLowerCase();

  // Dynamic stage state calculator matching the 6-stage post-processing pipeline
  const getStepState = (stageKey: string): 'pending' | 'active' | 'completed' | 'failed' | 'skipped' => {
    if (isCompleted || progress >= 100) return 'completed';
    if (!isRunning && !activeTask) return 'pending';

    // If task failed during this stage
    if (isFailed) {
      if (stageKey === 'synthesis' && (progress < 78 || stageName === 'generating')) return 'failed';
      if (stageKey === 'stage1_repair' && (stageName === 'repairing' || (progress >= 78 && progress < 82))) return 'failed';
      if (stageKey === 'stage2_decimate' && (stageName === 'decimating' || (progress >= 82 && progress < 84))) return 'failed';
      if (stageKey === 'stage3_uv' && (stageName === 'uv_unwrapping' || (progress >= 84 && progress < 86))) return 'failed';
      if (stageKey === 'stage4_pbr' && (stageName === 'baking_pbr' || (progress >= 86 && progress < 89))) return 'failed';
      if (stageKey === 'stage5_compress' && (stageName === 'compressing' || (progress >= 89 && progress < 91))) return 'failed';
      if (stageKey === 'stage6_package' && (stageName === 'packaging' || progress >= 91)) return 'failed';
    }

    switch (stageKey) {
      case 'synthesis':
        if (progress >= 78 || stageName === 'repairing' || stageName === 'decimating' || stageName === 'uv_unwrapping' || stageName === 'baking_pbr' || stageName === 'compressing' || stageName === 'packaging') return 'completed';
        return 'active';

      case 'stage1_repair':
        if (progress < 78 && stageName !== 'repairing') return 'pending';
        if (progress >= 82 || stageName === 'decimating' || stageName === 'uv_unwrapping' || stageName === 'baking_pbr' || stageName === 'compressing' || stageName === 'packaging') return 'completed';
        return 'active';

      case 'stage2_decimate':
        if (progress < 82 && stageName !== 'decimating') return 'pending';
        if (progress >= 84 || stageName === 'uv_unwrapping' || stageName === 'baking_pbr' || stageName === 'compressing' || stageName === 'packaging') return 'completed';
        return 'active';

      case 'stage3_uv':
        if (progress < 84 && stageName !== 'uv_unwrapping') return 'pending';
        if (progress >= 86 || stageName === 'baking_pbr' || stageName === 'compressing' || stageName === 'packaging') return 'completed';
        return 'active';

      case 'stage4_pbr':
        if (!textureEnabled) return 'skipped';
        if (progress < 86 && stageName !== 'baking_pbr') return 'pending';
        if (progress >= 89 || stageName === 'compressing' || stageName === 'packaging') return 'completed';
        return 'active';

      case 'stage5_compress':
        if (!optimizeEnabled) return 'skipped';
        if (progress < 89 && stageName !== 'compressing') return 'pending';
        if (progress >= 91 || stageName === 'packaging') return 'completed';
        return 'active';

      case 'stage6_package':
        if (progress < 91 && stageName !== 'packaging') return 'pending';
        if (progress >= 100 || isCompleted) return 'completed';
        return 'active';

      default:
        return 'pending';
    }
  };

  const stages: PipelineStep[] = [
    {
      id: 'synthesis',
      name: 'AI Geometry Synthesis',
      state: getStepState('synthesis'),
      detail: activeTask?.type === 'image-to-3d'
        ? `${modelName} — Image preflight & neural isosurface extraction`
        : `${modelName} — Text embedding & diffusion mesh synthesis`
    },
    {
      id: 'stage1_repair',
      name: 'Stage 1: Watertight Mesh Repair',
      state: getStepState('stage1_repair'),
      skipReason: !optimizeEnabled ? 'Mesh repair disabled' : undefined,
      detail: 'PyMeshLab manifold repair & non-manifold edges cleanup (Blender voxel fallback)'
    },
    {
      id: 'stage2_decimate',
      name: 'Stage 2: Mesh Decimation',
      state: getStepState('stage2_decimate'),
      skipReason: !optimizeEnabled ? 'Decimation disabled' : undefined,
      detail: 'PyMeshLab Quadric Edge Collapse to target polycount budget'
    },
    {
      id: 'stage3_uv',
      name: 'Stage 3: UV Parameterization',
      state: getStepState('stage3_uv'),
      skipReason: !optimizeEnabled ? 'Auto-optimize disabled' : undefined,
      detail: 'xatlas isomorphic atlas unwrapping & boundary preservation'
    },
    {
      id: 'stage4_pbr',
      name: 'Stage 4: PBR Texture Baking',
      state: getStepState('stage4_pbr'),
      skipReason: !textureEnabled ? 'Texture synthesis disabled' : undefined,
      detail: 'Blender Cycles bake (Normal, AO, Roughness, Metallic) at 16 samples'
    },
    {
      id: 'stage5_compress',
      name: 'Stage 5: GLB Draco & WebP Optimization',
      state: getStepState('stage5_compress'),
      skipReason: !optimizeEnabled ? 'Compression disabled' : undefined,
      detail: 'gltf-transform Draco geometry compression & WebP texture transcoding'
    },
    {
      id: 'stage6_package',
      name: 'Stage 6: Asset Packaging & Manifest',
      state: getStepState('stage6_package'),
      detail: 'LOD generation, collision hull, QA validation & async export bundle'
    }
  ];

  return (
    <div className="flex flex-col h-full bg-[#14161A] text-xs select-none overflow-hidden">
      {/* Header Bar */}
      <div className="px-3 py-2.5 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0 bg-[#16181D]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[#F9CF00]" />
          <span className="font-bold text-xs text-white">Pipeline Execution</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
            <Clock className="w-3 h-3 text-zinc-500" />
            <span>{Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}</span>
          </span>
          <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
            isCompleted
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              : isFailed
              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
              : 'bg-[#F9CF00]/15 text-[#F9CF00] border border-[#F9CF00]/30 animate-pulse'
          }`}>
            {activeTask?.status || (isExecuting ? 'Running' : 'Idle')}
          </span>
        </div>
      </div>

      {/* Main Execution Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin scrollbar-thumb-zinc-700/60 scrollbar-track-transparent">
        {/* Real Current Step Banner */}
        <div className="p-2.5 rounded-xl bg-[#1B1E24] border border-white/[0.08] space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Current Task</div>
            <div className="text-[10px] font-mono font-bold text-[#F9CF00]">{progress}%</div>
          </div>
          <div className="text-xs font-bold text-white leading-snug">
            {activeTask?.title || '3D Asset Generation'}
          </div>
          <div className="text-[10px] text-zinc-300 font-mono mt-0.5 break-words">
            {activeTask?.currentStep || (isRunning ? 'Executing inference graph...' : isCompleted ? 'Generation complete' : 'Ready')}
          </div>
          {/* Progress bar */}
          <div className="w-full bg-white/[0.06] rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isCompleted
                  ? 'bg-emerald-400'
                  : isFailed
                  ? 'bg-rose-500'
                  : 'bg-[#F9CF00]'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>

        {/* Hardware Status Note */}
        <div className="p-2 rounded-lg bg-[#181B20] border border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-zinc-500" />
            <span>{systemStats.gpu || 'GPU Accelerated'}</span>
          </span>
          <span>
            {systemStats.vramUsedGb != null ? `${systemStats.vramUsedGb.toFixed(1)} / ${systemStats.vramTotalGb?.toFixed(1) || '8'} GB VRAM` : 'Active'}
          </span>
        </div>

        {/* Pipeline Stages Dependency List */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Pipeline Stages ({stages.filter(s => s.state === 'completed').length} / {stages.length})
            </span>
            <span className="text-[9px] font-mono text-zinc-500">6-Stage Post-Processing</span>
          </div>

          <div className="space-y-1 rounded-xl bg-[#181B20] border border-white/[0.08] p-2">
            {stages.map((stage, idx) => {
              const isStageActive = stage.state === 'active';
              const isStageDone = stage.state === 'completed';
              const isStageFailed = stage.state === 'failed';
              const isStageSkipped = stage.state === 'skipped';

              return (
                <div
                  key={stage.id}
                  className={`p-2 rounded-lg border transition-all ${
                    isStageActive
                      ? 'bg-[#22252D] border-[#F9CF00]/40 shadow-sm'
                      : isStageDone
                      ? 'bg-transparent border-transparent text-zinc-300'
                      : isStageFailed
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      : isStageSkipped
                      ? 'bg-transparent border-transparent opacity-50 text-zinc-500'
                      : 'bg-transparent border-transparent text-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* State glyph */}
                      <span className="flex-shrink-0 font-mono text-xs">
                        {isStageDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                        {isStageActive && (
                          <span className="relative flex h-2.5 w-2.5 mx-0.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F9CF00] opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#F9CF00]" />
                          </span>
                        )}
                        {isStageFailed && <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                        {isStageSkipped && <span className="text-zinc-600 font-bold px-0.5">—</span>}
                        {stage.state === 'pending' && <span className="text-zinc-600">○</span>}
                      </span>

                      <span className={`text-[11px] font-semibold truncate ${
                        isStageActive ? 'text-[#F9CF00] font-bold' : isStageDone ? 'text-zinc-200' : isStageFailed ? 'text-rose-300' : 'text-zinc-400'
                      }`}>
                        {stage.name}
                      </span>
                    </div>

                    <span className="text-[9px] font-mono text-zinc-500 uppercase flex-shrink-0">
                      {stage.state}
                    </span>
                  </div>

                  {/* Stage detail or skip explanation */}
                  {isStageSkipped && stage.skipReason && (
                    <div className="text-[9px] text-zinc-500 pl-5 pt-0.5 italic">
                      Skipped: {stage.skipReason}
                    </div>
                  )}
                  {isStageActive && stage.detail && (
                    <div className="text-[9px] text-zinc-300 pl-5 pt-0.5 font-mono">
                      {stage.detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Execution Logs Console */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-[#F9CF00]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Live Execution Logs
              </span>
            </div>
            <span className="text-[9px] font-mono text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
              {logs.length} entries
            </span>
          </div>

          <div className="rounded-xl bg-black/60 border border-white/[0.08] p-2.5 max-h-44 overflow-y-auto font-mono text-[10px] space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent select-text">
            {logs.length === 0 ? (
              <div className="text-zinc-500 italic py-3 text-center text-[10px]">
                Awaiting telemetry logs from worker...
              </div>
            ) : (
              logs.map((log, idx) => {
                const timeStr = log.timestamp
                  ? new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : '';
                const isSuccess = log.level === 'success';
                const isWarn = log.level === 'warning' || log.level === 'warn';
                const isError = log.level === 'error';
                return (
                  <div key={idx} className="flex items-start gap-1.5 leading-tight">
                    {timeStr && (
                      <span className="text-zinc-600 flex-shrink-0 text-[9px] select-none">
                        {timeStr}
                      </span>
                    )}
                    <span
                      className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded flex-shrink-0 select-none leading-none ${
                        isSuccess
                          ? 'text-emerald-400 bg-emerald-500/15'
                          : isError
                          ? 'text-rose-400 bg-rose-500/15'
                          : isWarn
                          ? 'text-amber-400 bg-amber-500/15'
                          : 'text-sky-400 bg-sky-500/15'
                      }`}
                    >
                      {log.level || 'info'}
                    </span>
                    <span
                      className={`break-words ${
                        isSuccess
                          ? 'text-emerald-300'
                          : isError
                          ? 'text-rose-300'
                          : isWarn
                          ? 'text-amber-300'
                          : 'text-zinc-300'
                      }`}
                    >
                      {log.message}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Actionable Error Card */}
        {isFailed && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2 text-rose-300">
            <div className="flex items-center gap-1.5 font-bold text-xs text-rose-200">
              <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>Generation Failed</span>
            </div>
            
            <p className="text-[11px] text-rose-300/90 leading-relaxed">
              {activeTask?.diagnostic?.issueDescription || activeTask?.errorMessage || 'The generation job encountered an unrecoverable runtime error.'}
            </p>

            {/* Hardware-specific Actionable Fix */}
            <div className="pt-1 flex flex-col gap-1.5">
              {!generationSettings.lowVram && (
                <button
                  type="button"
                  onClick={() => {
                    setGenerationSettings(prev => ({ ...prev, lowVram: true }));
                    void generate3DModel();
                  }}
                  className="w-full py-1.5 px-2 rounded-lg bg-[#F9CF00] text-black font-bold text-[10px] hover:bg-[#ffe033] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Enable Low VRAM Mode (&lt;8GB) &amp; Retry</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => void generate3DModel()}
                className="w-full py-1.5 px-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry Generation</span>
              </button>
            </div>

            {/* Expandable Technical Diagnostic */}
            <button
              type="button"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="text-[9px] text-zinc-400 hover:text-white flex items-center gap-1 pt-1 cursor-pointer"
            >
              <span>Technical Diagnostics</span>
              {showDiagnostics ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>

            {showDiagnostics && (
              <pre className="mt-1 p-2 rounded-lg bg-black/40 border border-white/[0.08] text-[9px] font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap max-h-36">
                {activeTask?.errorMessage || activeTask?.diagnostic?.issueDescription || 'No diagnostic trace available'}
              </pre>
            )}
          </div>
        )}

        {/* Completion Success Card */}
        {isCompleted && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 text-emerald-300">
            <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>3D Asset Ready in Viewport</span>
            </div>
            <p className="text-[11px] text-emerald-300/90 leading-relaxed">
              Mesh generation, 6-stage post-processing, and optimization completed successfully.
            </p>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setRightPanelMode('properties')}
                className="py-1.5 px-2 rounded-lg bg-emerald-500 text-black font-bold text-[10px] hover:bg-emerald-400 transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <Box className="w-3 h-3" />
                <span>Inspect Properties</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTool('texture');
                  setRightPanelMode('properties');
                }}
                className="py-1.5 px-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-[10px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>Bake Textures</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Primary Action Bar during Running */}
      {isRunning && (
        <div className="p-2.5 border-t border-white/[0.08] bg-[#16181D]">
          <button
            type="button"
            onClick={cancelExecution}
            className="w-full h-9 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
          >
            <StopCircle className="w-4 h-4 text-rose-400" />
            <span>Cancel Generation</span>
          </button>
        </div>
      )}
    </div>
  );
};
