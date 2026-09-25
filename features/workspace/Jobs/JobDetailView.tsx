'use client';

import React, { useState, useEffect } from 'react';
import {
  ExternalLink,
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Cpu,
  HardDrive,
  Download,
  Trash2,
  RotateCcw,
  Sparkles,
  Maximize2,
  Box,
  Layers,
  Terminal,
  Activity,
  ChevronRight,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { getApiClient } from '@/services/apiClient';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';

const MeshViewer = dynamic(() => import('../Viewport/MeshViewer').then(mod => mod.MeshViewer), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[hsl(var(--surface-0))] animate-pulse flex items-center justify-center text-xs text-zinc-500">Loading 3D Output...</div>
});

interface JobDetailViewProps {
  jobId?: string;
  onBack?: () => void;
}

export const JobDetailView: React.FC<JobDetailViewProps> = ({ jobId: propJobId, onBack }) => {
  const { currentAsset, activeTask, setCurrentAsset, navigateToTool } = useWorkspace();

  const jobId = propJobId || (activeTask?.id ? activeTask.id.slice(0, 8).toUpperCase() : '8F42A1');
  const [activeTab, setActiveTab] = useState<'Result' | 'Parts' | 'Wireframe'>('Result');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState(false);
  const [isRawJsonOpen, setIsRawJsonOpen] = useState(false);

  // Job data state
  const [jobData, setJobData] = useState({
    id: jobId,
    operation: 'Mesh Segmentation',
    model: 'PartField (v1.0)',
    status: 'Running' as 'Running' | 'Completed' | 'Failed',
    priority: 'Normal',
    user: 'you',
    jobType: 'Workspace Job',
    startedAt: '22 Sep 2026, 14:32',
    runningDuration: '12m 24s',
    currentStage: 'Running part segmentation on GPU',
    currentStep: 3,
    totalSteps: 5,
    progress: 62,
    telemetry: {
      gpu: 'RTX 3050',
      gpuUtil: 68,
      vramUsed: 4.2,
      vramTotal: 6.0,
      ramUsed: 6.8,
      ramTotal: 16.0,
      eta: '~ 7 minutes',
      totalEstimated: 'Total: 19 minutes',
    },
    inputMesh: {
      name: currentAsset?.name || 'knight_character.glb',
      format: 'GLB',
      size: currentAsset?.fileSize || '12.4 MB',
      vertices: currentAsset?.vertices || 248864,
      faces: currentAsset?.faces || 496231,
      materials: 8,
      bounds: '0.42 × 0.36 × 0.50 m',
    },
    parameters: {
      'Target Parts': 8,
      'Method': 'Semantic',
      'Hierarchical': 'true',
      'Algorithm': 'v1 (Default)',
      'Colorize Parts': 'true',
      'Generate Labels': 'true',
      'Keep Original': 'false',
      'Output Format': 'GLB',
    },
    outputMesh: {
      name: 'knight_segments.glb',
      format: 'GLB',
      size: '18.6 MB',
      vertices: 248864,
      faces: 496231,
      parts: 8,
      generatedAt: '22 Sep 2026, 14:49',
    },
    steps: [
      { id: 1, name: 'Validate Input', duration: '2s', status: 'completed' },
      { id: 2, name: 'Load Model', duration: '18s', status: 'completed' },
      { id: 3, name: 'Segment Mesh', duration: '12m 24s', status: 'active' },
      { id: 4, name: 'Post Process', duration: 'Waiting', status: 'waiting' },
      { id: 5, name: 'Save Output', duration: 'Waiting', status: 'waiting' },
    ],
    logs: [
      '[14:32:11] [INFO] Job started: 8F42A1',
      '[14:32:12] [INFO] Loading input asset: knight_character.glb',
      '[14:32:14] [INFO] Input validation passed',
      '[14:32:16] [INFO] Loading model: PartField (v1.0)',
      '[14:32:20] [INFO] Model loaded successfully (4.2s)',
      '[14:32:22] [INFO] Preprocessing mesh geometry...',
      '[14:32:24] [INFO] Running segmentation (target parts: 8, method: semantic)',
      '[14:34:11] [INFO] GPU inference in progress... (42%)',
      '[14:36:03] [INFO] GPU inference in progress... (62%)',
      '[14:36:56] [INFO] Generating part labels...',
    ],
  });

  // Pull real job state if available from backend
  useEffect(() => {
    let mounted = true;
    const fetchRealJob = async () => {
      try {
        const client = getApiClient();
        const res = await client.getJobStatus(jobId);
        if (res && mounted) {
          setJobData(prev => ({
            ...prev,
            status: res.status === 'completed' ? 'Completed' : res.status === 'failed' ? 'Failed' : 'Running',
            progress: (res as any).progress ?? prev.progress,
            currentStage: (res as any).stage || (res as any).message || prev.currentStage,
          }));
        }
      } catch {
        // Fall back to current state
      }
    };
    fetchRealJob();
    return () => { mounted = false; };
  }, [jobId]);

  const handleCopyId = () => {
    navigator.clipboard.writeText(jobData.id);
    setCopiedId(true);
    toast.success('Job ID copied to clipboard');
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleUseResult = () => {
    toast.success('Result chained to next workflow');
    navigateToTool('animation');
  };

  const handleCancelJob = () => {
    toast.info('Cancel request sent to scheduler');
  };

  const handleRetryJob = () => {
    toast.info('Retrying job with same parameters...');
  };

  return (
    <div id="job-detail-view" className="flex flex-col h-full w-full bg-[hsl(var(--surface-0))] text-white overflow-y-auto scrollbar-thin select-none">
      {/* Top Main Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[hsl(var(--surface-1))]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
            <Box className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-wide">Job Details</h1>
              {onBack && (
                <button
                  onClick={onBack}
                  className="text-xs text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-[hsl(var(--surface-2))] border border-white/[0.08] cursor-pointer"
                >
                  ← Back to List
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-400">Track, inspect and manage AI execution jobs</p>
          </div>
        </div>
      </div>

      {/* 3-Column Layout Matching REF/JOB_DETAIL/design.png */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 flex-1 items-start">
        {/* LEFT COLUMN: Metadata, Input Asset, Parameters (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Job ID Card */}
          <div className="rounded-xl bg-[hsl(var(--surface-1))] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold font-mono text-white">Job #{jobData.id}</span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
                  title="Copy Job ID"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {jobData.status}
              </span>
            </div>

            <div className="text-[11px] text-zinc-400 space-y-0.5 border-b border-white/[0.04] pb-2.5">
              <div>Started {jobData.startedAt}</div>
              <div>Running for {jobData.runningDuration}</div>
            </div>

            <div className="text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Operation</span>
                <span className="font-semibold text-white">{jobData.operation}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Model</span>
                <span className="font-semibold text-white">{jobData.model}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Priority</span>
                <span className="font-semibold text-white">{jobData.priority}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">User</span>
                <span className="font-semibold text-white">{jobData.user}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Job Type</span>
                <span className="font-semibold text-white">{jobData.jobType}</span>
              </div>
            </div>
          </div>

          {/* Input Asset Card */}
          <div className="rounded-xl bg-[hsl(var(--surface-1))] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Box className="w-4 h-4 text-primary" />
              <span>Input Asset</span>
            </div>

            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.04]">
              <div className="w-10 h-10 rounded-lg bg-[hsl(var(--surface-2))] flex items-center justify-center flex-shrink-0">
                <Box className="w-5 h-5 text-zinc-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate">{jobData.inputMesh.name}</div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  {jobData.inputMesh.format} • {jobData.inputMesh.size}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.04] space-y-1.5 text-[11px]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Mesh Information</div>
              <div className="flex justify-between"><span className="text-zinc-400">Vertices</span><span className="font-mono text-white">{jobData.inputMesh.vertices.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Faces</span><span className="font-mono text-white">{jobData.inputMesh.faces.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Materials</span><span className="font-mono text-white">{jobData.inputMesh.materials}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Bounds</span><span className="font-mono text-white">{jobData.inputMesh.bounds}</span></div>
            </div>
          </div>

          {/* Parameters Card */}
          <div className="rounded-xl bg-[hsl(var(--surface-1))] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                <span>Parameters</span>
              </div>
              <button
                type="button"
                onClick={() => setIsRawJsonOpen(!isRawJsonOpen)}
                className="text-[10px] text-primary hover:underline font-mono cursor-pointer"
              >
                View JSON {isRawJsonOpen ? '▲' : '▼'}
              </button>
            </div>

            {isRawJsonOpen ? (
              <pre className="p-2.5 rounded bg-[hsl(var(--surface-0))] text-[10px] font-mono text-emerald-400 overflow-x-auto border border-white/[0.04]">
                {JSON.stringify(jobData.parameters, null, 2)}
              </pre>
            ) : (
              <div className="space-y-1.5 text-[11px]">
                {Object.entries(jobData.parameters).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-zinc-400">{key}</span>
                    <span className="font-mono text-white font-medium">{String(val)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE COLUMN: Stepper Pipeline, Hardware Telemetry, Live Logs, Intermediate Results (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Processing Pipeline Stepper Card */}
          <div className="rounded-xl bg-[hsl(var(--surface-1))] border border-white/[0.08] p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Activity className="w-4 h-4 text-primary" />
                <span>Processing Pipeline</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Step {jobData.currentStep} of {jobData.totalSteps}</span>
                <span className="text-xs font-bold font-mono text-black bg-primary px-1.5 py-0.5 rounded">
                  {jobData.progress}%
                </span>
              </div>
            </div>

            <div className="text-[11px] text-zinc-400">
              Current stage: <span className="text-white font-medium">{jobData.currentStage}</span>
            </div>

            {/* Stepper node track */}
            <div className="flex items-center justify-between pt-2 px-1 relative">
              <div className="absolute top-5 left-6 right-6 h-[2px] bg-white/[0.08] -z-0" />
              {jobData.steps.map((st) => (
                <div key={st.id} className="flex flex-col items-center gap-1.5 z-10">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                      st.status === 'completed'
                        ? 'bg-primary border-primary text-black shadow-md'
                        : st.status === 'active'
                        ? 'bg-[hsl(var(--surface-0))] border-primary text-primary ring-4 ring-primary/20'
                        : 'bg-[hsl(var(--surface-0))] border-white/[0.1] text-zinc-600'
                    }`}
                  >
                    {st.status === 'completed' ? (
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    ) : st.status === 'active' ? (
                      <Box className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <span>{st.id}</span>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] font-bold text-white whitespace-nowrap">{st.name}</div>
                    <div className="text-[9px] text-zinc-400">{st.duration}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="w-full bg-[hsl(var(--surface-0))] h-2 rounded-full overflow-hidden border border-white/[0.06]">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${jobData.progress}%` }}
              />
            </div>

            {/* Hardware Telemetry 4-Column Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/[0.04]">
              <div className="p-2.5 rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.04]">
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Cpu className="w-3 h-3 text-primary" />
                  <span>GPU</span>
                </div>
                <div className="text-xs font-bold text-white mt-1">{jobData.telemetry.gpu}</div>
                <div className="text-[10px] text-primary font-mono">{jobData.telemetry.gpuUtil}% Utilization</div>
              </div>

              <div className="p-2.5 rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.04]">
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Activity className="w-3 h-3 text-primary" />
                  <span>VRAM</span>
                </div>
                <div className="text-xs font-bold text-white mt-1 font-mono">{jobData.telemetry.vramUsed} / {jobData.telemetry.vramTotal} GB</div>
                <div className="w-full bg-zinc-800 h-1 rounded-full mt-1.5">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${(jobData.telemetry.vramUsed / jobData.telemetry.vramTotal) * 100}%` }} />
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.04]">
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <HardDrive className="w-3 h-3 text-primary" />
                  <span>RAM</span>
                </div>
                <div className="text-xs font-bold text-white mt-1 font-mono">{jobData.telemetry.ramUsed} / {jobData.telemetry.ramTotal} GB</div>
                <div className="w-full bg-zinc-800 h-1 rounded-full mt-1.5">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${(jobData.telemetry.ramUsed / jobData.telemetry.ramTotal) * 100}%` }} />
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.04]">
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Clock className="w-3 h-3 text-primary" />
                  <span>ETA</span>
                </div>
                <div className="text-xs font-bold text-white mt-1">{jobData.telemetry.eta}</div>
                <div className="text-[10px] text-zinc-400">{jobData.telemetry.totalEstimated}</div>
              </div>
            </div>
          </div>

          {/* Live Logs Card */}
          <div className="rounded-xl bg-[hsl(var(--surface-1))] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Terminal className="w-4 h-4 text-primary" />
                <span>Live Logs</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                  <span>Auto Scroll</span>
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="accent-primary cursor-pointer"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => toast.info('Logs cleared in view')}
                  className="text-[11px] text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-[hsl(var(--surface-0))] border border-white/[0.08] cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => toast.success('Logs downloaded')}
                  className="text-[11px] text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-[hsl(var(--surface-0))] border border-white/[0.08] cursor-pointer flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[hsl(var(--surface-0))] font-mono text-[11px] text-zinc-300 h-44 overflow-y-auto space-y-1 border border-white/[0.04]">
              {jobData.logs.map((line, idx) => (
                <div key={idx} className="leading-relaxed">
                  <span className="text-zinc-500">{line.slice(0, 10)}</span>{' '}
                  <span className="text-primary font-semibold">{line.slice(11, 17)}</span>{' '}
                  <span className="text-zinc-200">{line.slice(18)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Output Preview & Information & Actions (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Output Preview Card */}
          <div className="rounded-xl bg-[hsl(var(--surface-1))] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>Output Preview</span>
              </div>
              <button
                type="button"
                onClick={() => toast.info('Toggled fullscreen preview')}
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 3D Viewport window */}
            <div className="h-64 w-full rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.06] overflow-hidden relative">
              <MeshViewer />
            </div>

            {/* Mode switcher tabs */}
            <div className="flex gap-1 p-1 bg-[hsl(var(--surface-0))] rounded-lg border border-white/[0.06]">
              {(['Result', 'Parts', 'Wireframe'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                    activeTab === tab
                      ? 'bg-primary text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Output Information */}
          <div className="rounded-xl bg-[hsl(var(--surface-1))] border border-white/[0.08] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Box className="w-4 h-4 text-primary" />
              <span>Output Information</span>
            </div>

            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between"><span className="text-zinc-400">File Name</span><span className="font-mono text-white font-medium">{jobData.outputMesh.name}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Format</span><span className="font-mono text-white">{jobData.outputMesh.format}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">File Size</span><span className="font-mono text-white">{jobData.outputMesh.size}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Vertices</span><span className="font-mono text-white">{jobData.outputMesh.vertices.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Faces</span><span className="font-mono text-white">{jobData.outputMesh.faces.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Parts</span><span className="font-mono text-white">{jobData.outputMesh.parts}</span></div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => toast.success('Downloading output GLB...')}
                className="w-full py-2 px-3 rounded-xl bg-primary hover:bg-primary/90 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Download GLB File</span>
              </button>
            </div>
          </div>

          {/* Actions Grid Card */}
          <div className="rounded-xl bg-[hsl(var(--surface-1))] border border-white/[0.08] p-4 space-y-3">
            <div className="text-xs font-bold text-white">Actions</div>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={handleCancelJob}
                title="Cancel Job"
                className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[hsl(var(--surface-0))] hover:bg-rose-500/10 border border-white/[0.06] hover:border-rose-500/30 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                <span className="text-[9px] font-semibold">Cancel</span>
              </button>

              <button
                type="button"
                onClick={handleRetryJob}
                title="Retry Job"
                className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[hsl(var(--surface-0))] hover:bg-white/[0.06] border border-white/[0.06] text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="text-[9px] font-semibold">Retry</span>
              </button>

              <button
                type="button"
                onClick={handleUseResult}
                title="Use Result in downstream tool"
                className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[hsl(var(--surface-0))] hover:bg-primary/15 border border-white/[0.06] hover:border-primary/40 text-zinc-400 hover:text-primary transition-colors cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span className="text-[9px] font-semibold">Use Result</span>
              </button>

              <button
                type="button"
                onClick={() => toast.info('Job history removed')}
                title="Delete Job"
                className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-[hsl(var(--surface-0))] hover:bg-rose-500/10 border border-white/[0.06] hover:border-rose-500/30 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-[9px] font-semibold">Delete</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
