"use client";


import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, AlertCircle, Info, Loader2,
  Box, Layers, Palette, GitBranch, HardDrive, Download, FileDown, Lock, CheckCircle2, Sparkles
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useUIStore, type InspectorTab } from '@/stores/useUIStore';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { EXPORT_FORMATS } from '@/constants';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { LogEntry } from '@/types';

/* ── Log helpers ────────────────────────────────────────── */
const LOG_ICONS = { info: Info, warn: AlertCircle, error: XCircle, success: CheckCircle };
const LOG_COLORS = { info: 'text-[hsl(var(--neon-cyan))]', warn: 'text-[hsl(var(--neon-amber))]', error: 'text-red-400', success: 'text-[hsl(var(--neon-green))]' };
const LOG_GLOW = { info: 'shadow-[0_0_6px_hsl(var(--neon-cyan)/0.3)]', warn: 'shadow-[0_0_6px_hsl(var(--neon-amber)/0.3)]', error: 'shadow-[0_0_6px_hsl(var(--neon-red)/0.4)]', success: 'shadow-[0_0_6px_hsl(var(--neon-green)/0.3)]' };

function LogLine({ entry }: { entry: LogEntry }) {
  const Icon = LOG_ICONS[entry.level];
  return (
    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2 py-1 group">
      <div className={cn('flex items-center justify-center w-4 h-4 mt-0.5 shrink-0 rounded-sm', LOG_GLOW[entry.level])}>
        <Icon className={cn('w-3 h-3', LOG_COLORS[entry.level])} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-[11px] leading-relaxed break-words',
          entry.level === 'error' ? 'text-red-300' : entry.level === 'warn' ? 'text-[hsl(var(--neon-amber))]/90' : 'text-muted-foreground/80'
        )}>{entry.message}</p>
        <p className="text-[10px] text-muted-foreground/30 mt-0.5 font-mono tabular-nums">{entry.timestamp.toLocaleTimeString()}</p>
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { color: string; bg: string; label: string; glow?: string; ring?: string }> = {
    idle: { color: 'text-muted-foreground/60', bg: 'bg-muted/20', label: 'Idle' },
    queued: { color: 'text-[hsl(var(--neon-amber))]', bg: 'bg-[hsl(var(--neon-amber)/0.08)]', label: 'Queued', glow: 'shadow-[0_0_12px_hsl(var(--neon-amber)/0.2)]' },
    generating: { color: 'text-[hsl(var(--neon-purple))]', bg: 'bg-[hsl(var(--neon-purple)/0.08)]', label: 'Generating', glow: 'shadow-[0_0_12px_hsl(var(--neon-purple)/0.3)]', ring: 'ring-1 ring-[hsl(var(--neon-purple)/0.2)]' },
    texturing: { color: 'text-orange-400', bg: 'bg-orange-500/0.08', label: 'Texturing', glow: 'shadow-[0_0_12px_hsl(var(--neon-amber)/0.2)]' },
    rigging: { color: 'text-purple-400', bg: 'bg-purple-500/0.08', label: 'Rigging', glow: 'shadow-[0_0_12px_hsl(var(--neon-pink)/0.2)]' },
    completed: { color: 'text-[hsl(var(--neon-green))]', bg: 'bg-[hsl(var(--neon-green)/0.08)]', label: 'Completed', glow: 'shadow-[0_0_12px_hsl(var(--neon-green)/0.2)]' },
    failed: { color: 'text-red-400', bg: 'bg-red-500/0.08', label: 'Failed', glow: 'shadow-[0_0_12px_hsl(var(--neon-red)/0.2)]' },
    cancelled: { color: 'text-muted-foreground/60', bg: 'bg-muted/15', label: 'Cancelled' },
    uploading: { color: 'text-[hsl(var(--neon-blue))]', bg: 'bg-[hsl(var(--neon-blue)/0.08)]', label: 'Uploading', glow: 'shadow-[0_0_12px_hsl(var(--neon-blue)/0.2)]' },
  };
  const cfg = configs[status] ?? configs.idle;
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-wide transition-all duration-300',
      cfg.bg, cfg.color, cfg.glow, cfg.ring
    )}>
      {['generating', 'texturing', 'rigging', 'queued', 'uploading'].includes(status) && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'completed' && <CheckCircle className="w-3 h-3" />}
      {status === 'failed' && <XCircle className="w-3 h-3" />}
      {cfg.label}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

/* ── Inspector Tab Content Components ───────────────────── */

function SceneTab() {
  const { currentJob } = useGenerationStore();
  const result = currentJob?.result;
  return (
    <div className="space-y-3">
      <p className="panel-section-label">Scene Hierarchy</p>
      <div className="space-y-1">
        {currentJob && currentJob.status === 'completed' ? (
          <div className="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[hsl(var(--surface-2)/0.25)] border border-[hsl(var(--border)/0.25)] hover:border-[hsl(var(--neon-purple)/0.25)] hover:bg-[hsl(var(--neon-purple)/0.04)] transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--neon-purple)/0.05)]">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[hsl(var(--neon-purple)/0.1)] shadow-[0_0_8px_hsl(var(--neon-purple)/0.15)]">
              <Box className="w-3.5 h-3.5 text-[hsl(var(--neon-purple))]" />
            </div>
            <span className="text-xs font-medium text-foreground/90">Generated Model</span>
            {result && (
              <span className="ml-auto text-[10px] font-mono text-muted-foreground/60 tabular-nums">{result.polygonCount.toLocaleString()} tris</span>
            )}
          </div>
        ) : (
          <div className="empty-state py-6">
            <div className="empty-state-icon shadow-[0_0_12px_hsl(var(--neon-purple)/0.08)]" style={{ animation: 'float-gentle 4s ease-in-out infinite' }}>
              <Box className="w-5 h-5" />
            </div>
            <p className="text-[11px] text-muted-foreground/40">No objects in scene</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PropertiesTab() {
  const { currentJob } = useGenerationStore();
  const result = currentJob?.result;

  return (
    <div className="space-y-5">
      {/* Transform */}
      <div>
        <p className="panel-section-label mb-2.5">Transform</p>
        <div className="space-y-2.5">
          {['Position', 'Rotation', 'Scale'].map((label) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground/60 w-16 shrink-0 font-medium">{label}</span>
              <div className="flex gap-1.5 flex-1">
                {['X', 'Y', 'Z'].map((axis) => (
                  <div key={axis} className="flex-1 flex items-center gap-1">
                    <span className={cn(
                      'text-[10px] font-black w-3.5 text-center',
                      axis === 'X' ? 'text-red-400 shadow-[0_0_4px_hsl(var(--neon-pink)/0.4)]' :
                      axis === 'Y' ? 'text-emerald-400 shadow-[0_0_4px_hsl(var(--neon-green)/0.4)]' :
                      'text-blue-400 shadow-[0_0_4px_hsl(var(--neon-blue)/0.4)]'
                    )}>{axis}</span>
                    <input
                      type="text"
                      defaultValue={axis === 'Y' && label === 'Position' ? '0' : axis === 'Scale' ? '1' : '0'}
                      className="input-premium w-full h-6 text-[10px] font-mono rounded-lg px-1.5 text-foreground text-center outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Model Info */}
      {result && (
        <div>
          <p className="panel-section-label mb-2.5">Model Info</p>
          <div className="space-y-1">
            {[
              { icon: Box, label: 'Polygons', value: result.polygonCount.toLocaleString() },
              { icon: Layers, label: 'Vertices', value: result.vertexCount.toLocaleString() },
              { icon: Palette, label: 'Texture', value: result.textureResolution ?? 'None' },
              { icon: GitBranch, label: 'Rig', value: result.hasRig ? 'Yes' : 'No' },
              { icon: HardDrive, label: 'Size', value: formatBytes(result.fileSize) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[hsl(var(--surface-2)/0.3)] transition-colors duration-200 group">
                <div className="flex items-center gap-2">
                  <Icon className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                  <span className="text-[11px] text-muted-foreground/70">{label}</span>
                </div>
                <span className="text-[11px] font-mono text-foreground/80 tabular-nums">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MaterialTab() {
  const { currentJob } = useGenerationStore();
  const result = currentJob?.result;

  const MATERIAL_ICONS: Record<string, string> = {
    'Albedo': '🎨',
    'Normal': '⛰️',
    'Roughness': '✨',
    'Metallic': '🔩',
  };

  return (
    <div className="space-y-3">
      <p className="panel-section-label">Material</p>
      {result?.textureResolution && result.textureResolution !== 'None' ? (
        <div className="space-y-1.5">
          {['Albedo', 'Normal', 'Roughness', 'Metallic'].map((map) => (
            <div key={map} className="card-premium flex items-center justify-between px-3 py-2.5 rounded-xl cursor-default">
              <div className="flex items-center gap-2.5">
                <span className="text-xs">{MATERIAL_ICONS[map]}</span>
                <span className="text-xs font-medium text-foreground/90">{map} Map</span>
              </div>
              <span className="text-[10px] font-semibold text-[hsl(var(--neon-green))] bg-[hsl(var(--neon-green)/0.08)] px-2 py-0.5 rounded-full shadow-[0_0_8px_hsl(var(--neon-green)/0.15)]">Active</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state py-6">
          <div className="empty-state-icon shadow-[0_0_12px_hsl(var(--neon-pink)/0.08)]" style={{ animation: 'float-gentle 4s ease-in-out infinite' }}>
            <Palette className="w-5 h-5" />
          </div>
          <p className="text-[11px] text-muted-foreground/40">No materials applied</p>
          <p className="text-[10px] text-muted-foreground/25">Generate with texture enabled</p>
        </div>
      )}
    </div>
  );
}

function LightingTab() {
  const { viewer, toggleGrid } = useUIStore();
  return (
    <div className="space-y-3">
      <p className="panel-section-label">Lighting</p>
      <div className="space-y-1.5">
        {[
          { label: 'Environment Light', active: true, icon: '☀️' },
          { label: 'Ambient Occlusion', active: true, icon: '🌊' },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-[hsl(var(--surface-2)/0.2)] border border-[hsl(var(--border)/0.2)] shadow-[0_0_12px_hsl(var(--neon-amber)/0.05)]">
            <div className="flex items-center gap-2.5">
              <span className="text-xs">{item.icon}</span>
              <span className="text-xs font-medium text-foreground/90">{item.label}</span>
            </div>
            <span className="text-[10px] font-semibold text-[hsl(var(--neon-green))] bg-[hsl(var(--neon-green)/0.08)] px-2 py-0.5 rounded-full shadow-[0_0_8px_hsl(var(--neon-green)/0.15)]">Active</span>
          </div>
        ))}
        <div className={cn(
          'flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all duration-300',
          viewer.showGrid
            ? 'bg-[hsl(var(--surface-2)/0.2)] border-[hsl(var(--neon-green)/0.15)] shadow-[0_0_12px_hsl(var(--neon-green)/0.08)]'
            : 'bg-[hsl(var(--surface-2)/0.1)] border-[hsl(var(--border)/0.2)]'
        )}>
          <div className="flex items-center gap-2.5">
            <span className="text-xs">📐</span>
            <span className="text-xs font-medium text-foreground/90">Grid</span>
          </div>
          <button
            onClick={toggleGrid}
            className={cn(
              'text-[10px] font-semibold px-2.5 py-0.5 rounded-full transition-all duration-300',
              viewer.showGrid
                ? 'text-[hsl(var(--neon-green))] bg-[hsl(var(--neon-green)/0.08)] shadow-[0_0_8px_hsl(var(--neon-green)/0.15)]'
                : 'text-muted-foreground/50 bg-muted/20 hover:text-muted-foreground'
            )}
          >
            {viewer.showGrid ? 'On' : 'Off'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportTab() {
  const { currentJob } = useGenerationStore();
  const isCompleted = currentJob?.status === 'completed';
  const result = currentJob?.result;

  const handleDownload = (format: string, url?: string) => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `model.${format}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Downloading ${format.toUpperCase()}...`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="panel-section-label">Export</p>
        {isCompleted ? (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[hsl(var(--neon-green))] shadow-[0_0_8px_hsl(var(--neon-green)/0.15)]">
            <CheckCircle2 className="w-3 h-3" /> Ready
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Generate first
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {EXPORT_FORMATS.map((format, i) => {
          const downloadUrl = result?.downloadUrls[format.id];
          const enabled = isCompleted && !!downloadUrl;
          return (
            <motion.button
              key={format.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => enabled && handleDownload(format.id, downloadUrl)}
              disabled={!enabled}
              className={cn(
                'card-elevated group flex flex-col items-center gap-2 p-3.5 rounded-xl border text-center transition-all duration-300',
                enabled
                  ? 'border-[hsl(var(--border)/0.4)] hover:border-[hsl(var(--neon-purple)/0.4)] hover:shadow-[0_0_30px_hsl(var(--neon-purple)/0.15)] cursor-pointer hover:scale-[1.02]'
                  : 'border-[hsl(var(--border)/0.2)] cursor-not-allowed opacity-30 grayscale-[30%]'
              )}
            >
              <FileDown className={cn(
                'w-4 h-4 transition-all duration-300 group-hover:scale-110',
                enabled ? 'text-muted-foreground/70 group-hover:text-[hsl(var(--neon-purple))] group-hover:drop-shadow-[0_0_8px_hsl(var(--neon-purple)/0.6)]' : 'text-muted-foreground/30'
              )} />
              <span className={cn('text-[11px] font-bold tracking-wide', enabled ? 'text-foreground/80 group-hover:text-foreground' : 'text-muted-foreground/30')}>{format.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function LogsTab() {
  const { currentJob } = useGenerationStore();
  const logs = currentJob?.logs ?? [];
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentJob?.logs?.length]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="panel-section-label">Generation Log</p>
        {logs.length > 0 && <span className="text-[10px] font-mono text-muted-foreground/40 tabular-nums">{logs.length}</span>}
      </div>
      {logs.length === 0 ? (
        <div className="empty-state py-6">
          <div className="empty-state-icon shadow-[0_0_12px_hsl(var(--neon-cyan)/0.08)]" style={{ animation: 'float-gentle 4s ease-in-out infinite' }}>
            <Info className="w-5 h-5" />
          </div>
          <p className="text-[11px] text-muted-foreground/40">No logs yet</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {logs.map((entry) => <LogLine key={entry.id} entry={entry} />)}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
}

/* ── Status Card (shown above tabs) ────────────────────── */
function StatusCard() {
  const { currentJob } = useGenerationStore();

  if (!currentJob || currentJob.status === 'idle') {
    return (
      <div className="px-3 py-2.5 border-b border-[hsl(var(--border)/0.3)]">
        <StatusBadge status="idle" />
      </div>
    );
  }

  const isActive = ['generating', 'texturing', 'rigging', 'queued', 'uploading'].includes(currentJob.status);

  return (
    <div className={cn(
      'px-3 py-3 border-b border-[hsl(var(--border)/0.3)] space-y-2.5 transition-all duration-500',
      isActive && 'bg-gradient-to-b from-[hsl(var(--neon-purple)/0.04)] to-transparent'
    )}>
      <StatusBadge status={currentJob.status} />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/50 font-medium">Progress</span>
        <span className="text-[11px] font-mono font-bold text-[hsl(var(--neon-purple))] tabular-nums drop-shadow-[0_0_6px_hsl(var(--neon-purple)/0.4)]">{currentJob.progress}%</span>
      </div>
      <div className={cn(isActive && '[&>*]:animate-[pulse-glow_2s_ease-in-out_infinite]')}>
        <ProgressBar value={currentJob.progress} color="purple" size="sm" showGlow />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/50 font-medium">Elapsed</span>
        <span className="text-[11px] font-mono text-muted-foreground/70 tabular-nums tracking-wide">{formatElapsed(currentJob.elapsedSeconds)}</span>
      </div>
    </div>
  );
}

/* ── Inspector Tabs Config ──────────────────────────────── */
const INSPECTOR_TABS: { id: InspectorTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'scene', label: 'Scene', icon: Box },
  { id: 'properties', label: 'Properties', icon: Activity },
  { id: 'material', label: 'Material', icon: Palette },
  { id: 'lighting', label: 'Lighting', icon: Sparkles },
  { id: 'export', label: 'Export', icon: Download },
  { id: 'logs', label: 'Logs', icon: Info },
];

/* ── Main Inspector Component ──────────────────────────── */
export function RightSidebar() {
  const { rightSidebarCollapsed, toggleRightSidebar, inspectorTab, setInspectorTab } = useUIStore();

  if (rightSidebarCollapsed) {
    return (
      <aside className="flex flex-col items-center panel-glass border-l border-[hsl(var(--border)/0.3)] h-full py-2">
        <button
          onClick={toggleRightSidebar}
          className="flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground/60 hover:text-[hsl(var(--neon-purple))] hover:bg-[hsl(var(--neon-purple)/0.08)] hover:shadow-[0_0_16px_hsl(var(--neon-purple)/0.15)] transition-all duration-300"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 flex items-center justify-center">
          <Activity className="w-4 h-4 text-muted-foreground/30" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col panel-glass border-l border-[hsl(var(--border)/0.3)] h-full" style={{ boxShadow: 'inset 1px 0 0 hsl(var(--neon-purple) / 0.04)' }}>
      {/* Header */}
      <div className="panel-header relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--neon-purple)/0.06)] via-transparent to-[hsl(var(--neon-blue)/0.04)] pointer-events-none" />
        <div className="relative flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[hsl(var(--neon-purple)/0.1)] shadow-[0_0_8px_hsl(var(--neon-purple)/0.2)]">
            <Activity className="w-3.5 h-3.5 text-[hsl(var(--neon-purple))]" />
          </div>
          <span className="text-xs font-bold tracking-wide text-gradient">Inspector</span>
        </div>
        <button onClick={toggleRightSidebar} className="relative text-muted-foreground/50 hover:text-[hsl(var(--neon-purple))] hover:shadow-[0_0_8px_hsl(var(--neon-purple)/0.2)] transition-all duration-200 p-0.5 rounded-md hover:bg-[hsl(var(--neon-purple)/0.06)]">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Status Card */}
      <StatusCard />

      {/* Tabs */}
      <div className="px-1.5 pt-1.5 pb-1 shrink-0">
        <div className="flex flex-wrap gap-0.5">
          {INSPECTOR_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = inspectorTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setInspectorTab(tab.id)}
                className={cn(
                  'tab-premium relative flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium transition-all duration-200',
                  isActive ? 'tab-premium-active shadow-[0_0_12px_hsl(var(--neon-purple)/0.12)]' : 'hover:shadow-[0_0_6px_hsl(var(--neon-purple)/0.06)]'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="inspector-tab-underline"
                    className="absolute bottom-0 left-2 right-2 h-[1.5px] rounded-full"
                    style={{ background: 'linear-gradient(90deg, hsl(var(--neon-purple)), hsl(var(--neon-blue)))', boxShadow: '0 0 8px hsl(var(--neon-purple) / 0.4)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className={cn(
                  'w-3 h-3 transition-all duration-200',
                  isActive ? 'text-[hsl(var(--neon-purple))] drop-shadow-[0_0_6px_hsl(var(--neon-purple)/0.6)]' : 'text-muted-foreground/50'
                )} />
                <span className={cn('hidden xl:inline', isActive ? 'text-foreground' : '')}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <ScrollArea className="flex-1 scrollbar-neon">
        <div className="p-3">
          {inspectorTab === 'scene' && <SceneTab />}
          {inspectorTab === 'properties' && <PropertiesTab />}
          {inspectorTab === 'material' && <MaterialTab />}
          {inspectorTab === 'lighting' && <LightingTab />}
          {inspectorTab === 'export' && <ExportTab />}
          {inspectorTab === 'logs' && <LogsTab />}
        </div>
      </ScrollArea>
    </aside>
  );
}