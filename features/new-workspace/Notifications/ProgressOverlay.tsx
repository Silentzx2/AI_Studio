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
      <div className={`rounded-2xl border shadow-2xl overflow-hidden transition-all ${
        isCompleted
          ? 'bg-[hsl(var(--surface-1))] border-[hsl(var(--status-online))]/50 shadow-[hsl(var(--status-online))]/15'
          : isFailed || isInterrupted
          ? 'bg-[hsl(var(--surface-1))] border-[hsl(var(--destructive))]/50 shadow-[hsl(var(--destructive))]/15'
          : 'bg-[hsl(var(--surface-1))] border-[hsl(var(--primary))]/60 shadow-[hsl(var(--primary))]/20 ring-1 ring-[hsl(var(--primary))]/30'
      }`}>
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-[hsl(var(--surface-2))] border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <CheckCircle2 className="w-4 h-4 text-[hsl(var(--status-online))]" />
            ) : isFailed || isInterrupted ? (
              <XCircle className="w-4 h-4 text-[hsl(var(--destructive))]" />
            ) : (
              <div className="relative flex items-center justify-center">
                <RefreshCw className="w-4 h-4 text-[hsl(var(--primary))] animate-spin" />
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-[hsl(var(--foreground))]">
                {activeTask.title}
              </span>
              <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full uppercase font-semibold ${
                isCompleted 
                  ? 'bg-[hsl(var(--status-online))]/20 text-[hsl(var(--status-online))] border border-[hsl(var(--status-online))]/40' 
                  : isFailed || isInterrupted
                  ? 'bg-[hsl(var(--destructive))]/20 text-[hsl(var(--destructive))] border border-[hsl(var(--destructive))]/40'
                  : 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/40 animate-pulse'
              }`}>
                {activeTask.status}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-3))] transition-colors"
              title={isMinimized ? 'Expand progress overlay' : 'Minimize overlay'}
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
            <SimpleTooltip label="Close notification">
              <button
                onClick={dismissActiveTask}
                className="p-1 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--surface-3))] transition-colors"
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
              <div className="p-2.5 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] text-xs space-y-1">
                <div className="flex items-center justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
                  <span className="font-semibold uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[hsl(var(--primary))]" />
                    Text-to-3D Prompt
                  </span>
                  <span>Active generation workflow</span>
                </div>
                <p className="text-[hsl(var(--foreground))] italic line-clamp-2 text-[11px] leading-relaxed">
                  "{activeTask.promptText}"
                </p>
              </div>
            )}

            {activeTask.type === 'image-to-3d' && (
              <div className="p-2 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] flex items-center gap-2.5 text-xs">
                {activeTask.inputImage ? (
                  <img 
                    src={activeTask.inputImage} 
                    alt="Reference input" 
                    className="w-11 h-11 object-cover rounded-lg border border-[hsl(var(--border))]" 
                  />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-[hsl(var(--surface-3))] flex items-center justify-center text-[hsl(var(--muted-foreground))]">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase">
                    Image-to-3D Reference
                  </div>
                  <div className="text-xs font-semibold text-[hsl(var(--foreground))] truncate">
                    3D Generation Pipeline
                  </div>
                  <div className="text-[10px] text-[hsl(var(--status-online))]">
                    Model inference in progress
                  </div>
                </div>
              </div>
            )}

            {/* Live Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[hsl(var(--foreground))] truncate max-w-[240px] text-[11px]">
                  {activeTask.currentStep || 'Processing FastAPI Node Graph...'}
                </span>
                <span className="font-mono font-bold text-[hsl(var(--primary))] text-xs">
                  {activeTask.progress}%
                </span>
              </div>

              {/* Progress track */}
              <div className="h-2 w-full bg-[hsl(var(--surface-3))] rounded-full overflow-hidden p-0.5 border border-[hsl(var(--border))]">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${
                    isCompleted 
                      ? 'bg-[hsl(var(--status-online))]' 
                      : isFailed || isInterrupted
                      ? 'bg-[hsl(var(--destructive))]'
                      : 'bg-gradient-to-r from-[hsl(var(--status-busy))] to-[hsl(var(--primary))] shadow-sm shadow-[hsl(var(--primary))]'
                  }`}
                  style={{ width: `${Math.max(4, activeTask.progress)}%` }}
                />
              </div>
            </div>

            {/* FastAPI Queue & Node Execution Badges */}
            <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px] font-mono">
              <div className="p-1.5 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] flex flex-col">
                <span className="text-[hsl(var(--muted-foreground))]">Queue Pos</span>
                <span className="font-bold text-[hsl(var(--foreground))]">
                  {activeTask.queuePosition ?? (systemStats.queuePending > 0 ? `#${systemStats.queuePending}` : 'Active #1')}
                </span>
              </div>

              <div className="p-1.5 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] flex flex-col">
                <span className="text-[hsl(var(--muted-foreground))]">Duration</span>
                <span className="font-bold text-[hsl(var(--foreground))] flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 text-[hsl(var(--muted-foreground))]" />
                  {elapsedTime}s
                </span>
              </div>

              <div className="p-1.5 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] flex flex-col">
                <span className="text-[hsl(var(--muted-foreground))]">Active Node</span>
                <span className="font-bold text-[hsl(var(--primary))] truncate" title={activeTask.activeNode || 'generation workflow'}>
                  {activeTask.activeNode ? activeTask.activeNode.split('_')[0] : '3D-Pack'}
                </span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-1 flex items-center justify-between border-t border-[hsl(var(--border))]">
              {isRunning && (
                <button
                  onClick={cancelExecution}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[hsl(var(--destructive))]/10 hover:bg-[hsl(var(--destructive))]/20 border border-[hsl(var(--destructive))]/40 text-xs font-semibold text-[hsl(var(--destructive))] transition-colors"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>Cancel Job</span>
                </button>
              )}

               {isCompleted && (
                <div className="w-full flex items-center justify-between">
                  <span className="text-[11px] text-[hsl(var(--status-online))] font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    3D Model Ready in Viewport
                  </span>
                  <button
                    onClick={() => {
                      setActiveTool('texture');
                      dismissActiveTask();
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[hsl(var(--status-online))] hover:bg-[hsl(var(--status-online))]/90 text-[hsl(var(--surface-0))] text-xs font-bold transition-all shadow-md"
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
