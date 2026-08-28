import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Image as ImageIcon, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  X, 
  Maximize2, 
  Minimize2, 
  StopCircle, 
  Clock, 
  Activity,
  ArrowRight
} from 'lucide-react';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';
import { useWorkspace } from '../store/WorkspaceContext';

export const ProgressOverlay: React.FC = () => {
  const { 
    activeTask, 
    dismissActiveTask, 
    cancelExecution, 
    systemStats,
    setActiveTool
  } = useWorkspace();

  const [isMinimized, setIsMinimized] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer for tracking task duration
  useEffect(() => {
    if (!activeTask || activeTask.status === 'completed' || activeTask.status === 'failed' || activeTask.status === 'interrupted') {
      return;
    }

    setElapsedTime(Math.floor((Date.now() - activeTask.startedAt) / 1000));
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - activeTask.startedAt) / 1000));
    }, 500);

    return () => clearInterval(timer);
  }, [activeTask?.startedAt, activeTask?.status]);

  if (!activeTask) return null;

  const isCompleted = activeTask.status === 'completed';
  const isFailed = activeTask.status === 'failed';
  const isInterrupted = activeTask.status === 'interrupted';
  const isQueued = activeTask.status === 'queued';
  const isRunning = activeTask.status === 'running' || isQueued;

  return (
    <div 
      id="ws-queue-progress-overlay"
      className={`fixed bottom-5 right-5 z-50 transition-all duration-300 select-none ${
        isMinimized ? 'w-72' : 'w-96'
      }`}
    >
      <div className={`rounded-2xl border shadow-2xl backdrop-blur-xl overflow-hidden transition-all ${
        isCompleted
          ? 'bg-[#11161a]/95 border-[#22c55e]/50 shadow-[#22c55e]/15'
          : isFailed || isInterrupted
          ? 'bg-[#171214]/95 border-[#ef4444]/50 shadow-[#ef4444]/15'
          : 'bg-[#13151c]/95 border-[#f5c518]/60 shadow-[#f5c518]/20 ring-1 ring-[#f5c518]/30'
      }`}>
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#171a24] border-b border-[#252a38]">
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
            ) : isFailed || isInterrupted ? (
              <XCircle className="w-4 h-4 text-[#ef4444]" />
            ) : (
              <div className="relative flex items-center justify-center">
                <RefreshCw className="w-4 h-4 text-[#f5c518] animate-spin" />
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-[#f3f4f6]">
                {activeTask.title}
              </span>
              <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full uppercase font-semibold ${
                isCompleted 
                  ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/40' 
                  : isFailed || isInterrupted
                  ? 'bg-[#ef4444]/20 text-[#ef4444] border border-[#ef4444]/40'
                  : 'bg-[#f5c518]/20 text-[#f5c518] border border-[#f5c518]/40 animate-pulse'
              }`}>
                {activeTask.status}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded-md text-[#8e95a5] hover:text-[#f3f4f6] hover:bg-[#232734] transition-colors"
              title={isMinimized ? 'Expand progress overlay' : 'Minimize overlay'}
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
            <SimpleTooltip label="Close notification">
              <button
                onClick={dismissActiveTask}
                className="p-1 rounded-md text-[#8e95a5] hover:text-[#ef4444] hover:bg-[#232734] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </SimpleTooltip>
          </div>
        </div>

        {/* Body Content */}
        {!isMinimized && (
          <div className="p-3.5 space-y-3">
            {/* Task Prompt / Input preview */}
            {activeTask.type === 'text-to-3d' && activeTask.promptText && (
              <div className="p-2.5 rounded-xl bg-[#181a23] border border-[#262a37] text-xs space-y-1">
                <div className="flex items-center justify-between text-[10px] text-[#8e95a5]">
                  <span className="font-semibold uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#f5c518]" />
                    Text-to-3D Prompt
                  </span>
                  <span>Active generation workflow</span>
                </div>
                <p className="text-[#cbd5e1] italic line-clamp-2 text-[11px] leading-relaxed">
                  "{activeTask.promptText}"
                </p>
              </div>
            )}

            {activeTask.type === 'image-to-3d' && (
              <div className="p-2 rounded-xl bg-[#181a23] border border-[#262a37] flex items-center gap-2.5 text-xs">
                {activeTask.inputImage ? (
                  <img 
                    src={activeTask.inputImage} 
                    alt="Reference input" 
                    className="w-11 h-11 object-cover rounded-lg border border-[#373e52]" 
                  />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-[#232734] flex items-center justify-center text-[#8e95a5]">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold text-[#8e95a5] uppercase">
                    Image-to-3D Reference
                  </div>
                  <div className="text-xs font-semibold text-[#f3f4f6] truncate">
                    3D Generation Pipeline
                  </div>
                  <div className="text-[10px] text-[#22c55e]">
                    Model inference in progress
                  </div>
                </div>
              </div>
            )}

            {/* Live Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#e5e7eb] truncate max-w-[240px] text-[11px]">
                  {activeTask.currentStep || 'Processing FastAPI Node Graph...'}
                </span>
                <span className="font-mono font-bold text-[#f5c518] text-xs">
                  {activeTask.progress}%
                </span>
              </div>

              {/* Progress track */}
              <div className="h-2 w-full bg-[#1e222e] rounded-full overflow-hidden p-0.5 border border-[#2a2f40]">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    isCompleted 
                      ? 'bg-[#22c55e]' 
                      : isFailed || isInterrupted
                      ? 'bg-[#ef4444]'
                      : 'bg-gradient-to-r from-[#eab308] to-[#f5c518] shadow-sm shadow-[#f5c518]'
                  }`}
                  style={{ width: `${Math.max(4, activeTask.progress)}%` }}
                />
              </div>
            </div>

            {/* FastAPI Queue & Node Execution Badges */}
            <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px] font-mono">
              <div className="p-1.5 rounded-lg bg-[#181a23] border border-[#252937] flex flex-col">
                <span className="text-[#8e95a5]">Queue Pos</span>
                <span className="font-bold text-[#f3f4f6]">
                  {activeTask.queuePosition ?? (systemStats.queuePending > 0 ? `#${systemStats.queuePending}` : 'Active #1')}
                </span>
              </div>

              <div className="p-1.5 rounded-lg bg-[#181a23] border border-[#252937] flex flex-col">
                <span className="text-[#8e95a5]">Duration</span>
                <span className="font-bold text-[#f3f4f6] flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 text-[#8e95a5]" />
                  {elapsedTime}s
                </span>
              </div>

              <div className="p-1.5 rounded-lg bg-[#181a23] border border-[#252937] flex flex-col">
                <span className="text-[#8e95a5]">Active Node</span>
                <span className="font-bold text-[#f5c518] truncate" title={activeTask.activeNode || 'generation workflow'}>
                  {activeTask.activeNode ? activeTask.activeNode.split('_')[0] : '3D-Pack'}
                </span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-1 flex items-center justify-between border-t border-[#232734]">
              {isRunning && (
                <button
                  onClick={cancelExecution}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#261b1e] hover:bg-[#381f25] border border-[#ef4444]/40 text-xs font-semibold text-[#ef4444] transition-colors"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>Cancel Job</span>
                </button>
              )}

               {isCompleted && (
                <div className="w-full flex items-center justify-between">
                  <span className="text-[11px] text-[#22c55e] font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    3D Model Ready in Viewport
                  </span>
                  <button
                    onClick={() => {
                      setActiveTool('texture');
                      dismissActiveTask();
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] text-[#0d1015] text-xs font-bold transition-all shadow-md"
                  >
                    <span>Bake Textures</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
