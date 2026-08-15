"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import anime from 'animejs';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  Upload,
  Play,
  Pause,
  RefreshCw,
  CheckCircle,
  X,
  Download,
  Box,
  PersonStanding,
  Move,
  Footprints,
  Hand,
  Music,
  ArrowUpFromLine,
  ChevronDown,
  Info,
  Sparkles,
  Bone,
  RotateCcw,
  Zap,
  Grid3X3,
  Eye,
  Cpu,
  Maximize,
} from 'lucide-react';
import { toast } from 'sonner';
import { Shape3D } from '@/types/new-ui';
import { useProjectStore } from '@/stores/useProjectStore';
import { useWorkspaceModels } from '@/hooks/useBackendData';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RiggingAnimationTabProps {
  activeModel: {
    name: string;
    prompt: string;
    shapes: Shape3D[];
    themeColor: string;
    accentColor: string;
    description: string;
    promptDescription: string;
    complexity: string;
    textures: string;
  };
  onUpdateModel: (updatedModel: any) => void;
  onNavigate: (tab: string) => void;
}

interface AnimationPreset {
  id: string;
  label: string;
  description: string;
  icon: any;
  duration: number;
  fps: number;
  frameCount: number;
}

interface RiggingResult {
  boneCount: number;
  jointHierarchy: string;
  rigWeightMap: 'Complete' | 'Partial' | 'None';
}

const ANIMATION_PRESETS: AnimationPreset[] = [
  {
    id: 'idle',
    label: 'Idle',
    description: 'Breathing animation',
    icon: PersonStanding,
    duration: 2.0,
    fps: 30,
    frameCount: 60,
  },
  {
    id: 'walk',
    label: 'Walk',
    description: 'Standard walk cycle',
    icon: Move,
    duration: 1.2,
    fps: 30,
    frameCount: 36,
  },
  {
    id: 'run',
    label: 'Run',
    description: 'Running cycle',
    icon: Footprints,
    duration: 0.8,
    fps: 30,
    frameCount: 24,
  },
  {
    id: 'wave',
    label: 'Wave',
    description: 'Hand wave gesture',
    icon: Hand,
    duration: 1.5,
    fps: 30,
    frameCount: 45,
  },
  {
    id: 'dance',
    label: 'Dance',
    description: 'Dance moves',
    icon: Music,
    duration: 3.0,
    fps: 30,
    frameCount: 90,
  },
  {
    id: 'jump',
    label: 'Jump',
    description: 'Jump animation',
    icon: ArrowUpFromLine,
    duration: 1.0,
    fps: 30,
    frameCount: 30,
  },
];

const RIG_TYPES = [
  { value: 'full_body', label: 'Full Body Rig' },
  { value: 'upper_body', label: 'Upper Body Only' },
  { value: 'lower_body', label: 'Lower Body Only' },
];

const BONE_STRUCTURES = [
  { value: 'humanoid_standard', label: 'Humanoid (Standard)' },
  { value: 'quadruped', label: 'Quadruped' },
  { value: 'custom', label: 'Custom' },
];

const BLEND_MODES = [
  { value: 'replace', label: 'Replace' },
  { value: 'additive', label: 'Additive' },
  { value: 'mix', label: 'Mix' },
];

const SUPPORTED_FORMATS = [
  { label: 'GLB', desc: 'Binary glTF' },
  { label: 'GLTF', desc: 'JSON glTF' },
  { label: 'FBX', desc: 'Autodesk FBX' },
  { label: 'OBJ', desc: 'Wavefront OBJ' },
];

// Offline fallback: used only when the workspace-models endpoint is unreachable
const LOCAL_MODELS: { id: string; label: string; installed: boolean }[] = [
  { id: 'unirig', label: 'UniRig', installed: false },
  { id: 'anigen', label: 'AniGen', installed: false },
];

export default function RiggingAnimationTab({ activeModel, onUpdateModel, onNavigate }: RiggingAnimationTabProps) {
  const { addLayer, currentProject } = useProjectStore();
  const [uploadedModel, setUploadedModel] = useState<File | null>(null);
  const [uploadedModelUrl, setUploadedModelUrl] = useState<string | null>(null);
  const [uploadedModelName, setUploadedModelName] = useState<string>('');
  const [uploadedModelSize, setUploadedModelSize] = useState<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // Rigging state
  const [autoRig, setAutoRig] = useState(true);
  const [rigType, setRigType] = useState('full_body');
  const [boneStructure, setBoneStructure] = useState('humanoid_standard');

  // Models compatible with the rigging workspace
  const {
    models: workspaceModels,
    loading: isLoadingModels,
    error: modelsError,
  } = useWorkspaceModels('rigging');
  const [selectedModelId, setSelectedModelId] = useState('');

  const modelOptions = useMemo(() => {
    if (modelsError || !workspaceModels || workspaceModels.length === 0) {
      return LOCAL_MODELS;
    }
    return workspaceModels.map((m: any) => ({
      id: String(m.id ?? ''),
      label: String(m.label ?? m.name ?? m.id ?? 'Unknown model'),
      installed: Boolean(m.installed ?? m.status === 'ready'),
    }));
  }, [workspaceModels, modelsError]);

  // Keep the selection valid for the current (filtered) option list
  const selectedModel =
    modelOptions.find((m) => m.id === selectedModelId) ||
    modelOptions.find((m) => m.installed) ||
    modelOptions[0];
  const effectiveModelId = selectedModel?.id ?? '';

  // Animation state
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [loopAnimation, setLoopAnimation] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [blendMode, setBlendMode] = useState('replace');

  // Processing state
  const [isRigging, setIsRigging] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [riggingComplete, setRiggingComplete] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [riggingResult, setRiggingResult] = useState<RiggingResult | null>(null);

  // Timeline state
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelinePosition, setTimelinePosition] = useState(0);
  const animationFrameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const lastTimeRef = useRef<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    anime({
      targets: '#rigging-left-panel > div',
      opacity: [0, 1],
      translateX: [-20, 0],
      delay: anime.stagger(60),
      easing: 'easeOutQuad',
      duration: 500
    });
    anime({
      targets: '#rigging-right-stage',
      opacity: [0, 1],
      scale: [0.98, 1],
      easing: 'easeOutQuad',
      duration: 600
    });
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const currentPreset = ANIMATION_PRESETS.find((p) => p.id === selectedPreset);
  const currentDuration = currentPreset ? currentPreset.duration / speed : 2.0;

  // Cleanup all intervals/frames on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
    };
  }, []);

  // Timeline animation loop
  useEffect(() => {
    if (isPlaying && currentPreset) {
      lastTimeRef.current = performance.now();
      const animate = (now: number) => {
        const delta = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;
        setTimelinePosition((prev) => {
          const next = prev + (delta / currentDuration) * 100;
          if (next >= 100) {
            if (loopAnimation) return 0;
            setIsPlaying(false);
            return 100;
          }
          return next;
        });
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, currentPreset, currentDuration, loopAnimation]);

  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [modelUploadProgress, setModelUploadProgress] = useState(0);

  const validateAndSetModel = useCallback(async (file: File) => {
    if (!file.name.match(/\.(glb|gltf)$/i)) {
      toast.error('Invalid file format', {
        description: 'Please upload a .glb or .gltf file.',
      });
      return false;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error('File too large', {
        description: 'Maximum file size is 100 MB.',
      });
      return false;
    }

    setIsUploadingModel(true);
    setModelUploadProgress(0);

    try {
      const { uploadService } = await import('@/services/uploadService');
      const { promise } = uploadService.uploadWithProgress(file, (progress) => {
        setModelUploadProgress(progress.percent);
      }, '/api/v1/upload/model');
      const { url } = await promise;
      
      setUploadedModel(file);
      setUploadedModelName(file.name);
      setUploadedModelSize(file.size);
      setUploadedModelUrl(url);
      setStatusMessage(null);
      setRiggingComplete(false);
      setRiggingResult(null);
      setIsPlaying(false);
      setTimelinePosition(0);
      
      // Load model into viewer
      window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url } }));

      // AnimeJS animation for successful load
      anime({
        targets: '#rigging-upload-area',
        scale: [1.02, 1],
        boxShadow: ['0 0 20px hsl(var(--primary)/0.5)', '0 0 0px hsl(var(--primary)/0)'],
        duration: 800,
        easing: 'easeOutElastic(1, .8)'
      });

      toast.success('Model loaded', {
        description: `${file.name} (${formatFileSize(file.size)})`,
      });
      return true;
    } catch (err: any) {
      toast.error('Upload failed', {
        description: err.message || 'Could not upload model.',
      });
      return false;
    } finally {
      setIsUploadingModel(false);
      setModelUploadProgress(0);
    }
  }, []);

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetModel(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) {
      setIsDragOver(true);
      anime({
        targets: '#rigging-upload-area',
        scale: 1.02,
        boxShadow: '0 0 15px hsl(var(--primary)/0.3)',
        duration: 300,
        easing: 'easeOutQuad'
      });
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    anime({
      targets: '#rigging-upload-area',
      scale: 1,
      boxShadow: '0 0 0px hsl(var(--primary)/0)',
      duration: 300,
      easing: 'easeOutQuad'
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    anime({
      targets: '#rigging-upload-area',
      scale: 1,
      boxShadow: '0 0 0px hsl(var(--primary)/0)',
      duration: 300,
      easing: 'easeOutQuad'
    });
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetModel(file);
  };

  const clearUploadedModel = () => {
    if (uploadedModelUrl) URL.revokeObjectURL(uploadedModelUrl);
    setUploadedModel(null);
    setUploadedModelUrl(null);
    setUploadedModelName('');
    setUploadedModelSize(0);
    setRiggingComplete(false);
    setRiggingResult(null);
    setIsPlaying(false);
    setTimelinePosition(0);
    setStatusMessage(null);
  };

  const handleApplyRigging = async () => {
    if (isRigging) return;

    if (!uploadedModel && (!activeModel || !activeModel.name)) {
      toast.error('No model available', {
        description: 'Upload a 3D model or ensure an active model is loaded.',
      });
      return;
    }

    setIsRigging(true);
    setRiggingComplete(false);
    setRiggingResult(null);
    setProgressPercent(0);
    setIsPlaying(false);
    setTimelinePosition(0);
    setStatusMessage('Preparing rigging pipeline...');

    let modelUrl = uploadedModelUrl;

    // Submit rigging job
    setStatusMessage('Submitting rigging job...');
    setProgressPercent(20);

    try {
      const payload: any = {
        prompt: `Auto-rig 3D model with ${rigType} skeleton using ${boneStructure} bone structure${autoRig ? ', auto-rig enabled' : ', manual rig'}`,
        mode: 'rigging',
        quality: 'standard',
        auto_rig: autoRig,
        workspace: 'rigging',
      };
      if (effectiveModelId) {
        payload.provider = effectiveModelId;
      }
      if (modelUrl) {
        payload.reference_image_url = modelUrl;
      }

      const response = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok && data.data?.job_id) {
        const jobId = data.data?.job_id;
        setProgressPercent(25);
        setStatusMessage(`Job ${jobId} submitted. Analyzing mesh topology...`);
        toast.info('Rigging started', {
          description: `Job ID: ${jobId}`,
        });

        // Simulate progressive updates while polling
        let simulatedProgress = 25;
        const progressSim = setInterval(() => {
          if (simulatedProgress < 85) {
            simulatedProgress += Math.floor(Math.random() * 8) + 2;
            simulatedProgress = Math.min(simulatedProgress, 85);
            setProgressPercent(simulatedProgress);
            const stages = [
              'Analyzing mesh topology...',
              'Detecting body segments...',
              'Building joint hierarchy...',
              'Computing rig weights...',
              'Generating bone structure...',
              'Finalizing rig...',
            ];
            const stageIdx = Math.min(
              Math.floor((simulatedProgress - 25) / 10),
              stages.length - 1
            );
            setStatusMessage(stages[stageIdx]);
          } else {
            clearInterval(progressSim);
          }
        }, 1500);

        // Poll actual backend status
        pollIntervalRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/v1/generation/${jobId}/status`);
            const statusData = await statusRes.json();

            if (statusData.data?.status === 'completed') {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              clearInterval(progressSim);

              setProgressPercent(100);
              setStatusMessage('Rigging complete!');
              setRiggingComplete(true);
              setIsRigging(false);

              setRiggingResult({
                boneCount: statusData.data?.bone_count || statusData.data?.result?.bone_count || 0,
                jointHierarchy: statusData.data?.joint_hierarchy || statusData.data?.result?.joint_hierarchy || '',
                rigWeightMap: statusData.data?.weight_map || statusData.data?.result?.weight_map || 'Complete',
              });

              addLayer({
                id: `rigging-${Date.now()}`,
                type: 'rigging',
                name: `Rig (${rigType})`,
                enabled: true,
                visible: true,
                data: {
                  boneCount: statusData.data?.bone_count || statusData.data?.result?.bone_count || 0,
                  jointHierarchy: statusData.data?.joint_hierarchy || statusData.data?.result?.joint_hierarchy || '',
                  rigWeightMap: statusData.data?.weight_map || statusData.data?.result?.weight_map || 'Complete',
                  rigType,
                  boneStructure,
                  model: effectiveModelId,
                },
                sourceTab: 'RiggingAnimation',
                timestamp: new Date(),
              });

              toast.success('Rigging complete!', {
                description: `${statusData.data?.bone_count || statusData.data?.result?.bone_count || 0} bones generated.`,
              });
            } else if (statusData.data?.status === 'failed') {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              clearInterval(progressSim);

              const errMsg = statusData.data?.error_message || 'Unknown error';
              setStatusMessage(`Rigging failed: ${errMsg}`);
              setIsRigging(false);
              setProgressPercent(0);

              toast.error('Rigging failed', {
                description: errMsg,
              });
            } else {
              if (statusData.data?.progress !== undefined) {
                setProgressPercent(statusData.data.progress);
              }
              if (statusData.data?.stage) {
                setStatusMessage(statusData.data.stage);
              }
            }
          } catch {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            clearInterval(progressSim);
            setIsRigging(false);
            setProgressPercent(0);
            setStatusMessage('Connection lost to backend during polling.');

            toast.error('Connection lost', {
              description: 'Lost connection to the backend during rigging.',
            });
          }
        }, 2000);
      } else {
        const errMsg = data.detail || data.error || 'Backend returned an error.';
        setStatusMessage(`Error: ${errMsg}`);
        setIsRigging(false);
        setProgressPercent(0);

        toast.error('Rigging failed', {
          description: errMsg,
        });
      }
    } catch {
      toast.error('Backend unreachable', {
        description: 'Could not connect to the backend to start rigging.',
      });
      setIsRigging(false);
      setProgressPercent(0);
      setStatusMessage('Backend unreachable. Please check your connection and retry.');
    }
  };

  const handlePreviewAnimation = () => {
    if (!riggingComplete || !selectedPreset) return;
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (timelinePosition >= 100) setTimelinePosition(0);
      setIsPlaying(true);
      toast.info('Previewing animation', {
        description: `${currentPreset?.label} at ${speed}x speed`,
      });
    }
  };

  const handleExportRigged = async () => {
    const url = uploadedModelUrl || currentProject?.modelUrl;
    if (!url) {
      toast.error('No rigged model to export', {
        description: 'Generate or upload a model before exporting.',
      });
      return;
    }
    try {
      setStatusMessage('Exporting rigged model...');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const ext = url.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb';
      const base = (uploadedModelName || activeModel.name).replace(/\.(glb|gltf)$/i, '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${base}_rigged.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success('Rigged model exported', { description: a.download });
    } catch (err: any) {
      toast.error('Export failed', { description: err.message });
    }
  };

  const handleTimelineScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTimelinePosition(parseFloat(e.target.value));
    setIsPlaying(false);
  };

  const currentTime = (timelinePosition / 100) * currentDuration;

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex-1 flex flex-col lg:flex-row gap-0 bg-black overflow-hidden" id="rigging-animation-tab-panel">
        {/* Left Settings sidebar — Refined Studio layout */}
        <aside className="w-full lg:w-[400px] border-r border-white/5 flex flex-col h-full bg-black z-10" id="rigging-left-panel">
          
          {/* Header Banner */}
          <div className="p-8 border-b border-white/[0.03] bg-white/[0.01]">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                <Bone size={20} className="text-amber-500" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-black uppercase tracking-[-0.01em] text-white">Skeletal Studio</span>
                <span className="text-[9px] text-white/30 font-black uppercase tracking-[0.2em]">Neural Rigging & Motion</span>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-8 space-y-10 scrollbar-thin">
            {/* SECTION: TARGET ASSET */}
            <div className="flex flex-col gap-4" id="rigging-target-box">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Target Asset Manifest</span>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    {isUploadingModel ? (
                      <div className="w-full flex flex-col items-center gap-4 py-8 bg-white/[0.02] rounded-3xl border border-white/5">
                        <RefreshCw size={20} className="text-amber-500 animate-spin" />
                        <div className="w-full max-w-[70%] h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${modelUploadProgress}%` }} />
                        </div>
                      </div>
                    ) : uploadedModelUrl ? (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-4 flex items-center gap-4 group">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 shadow-inner">
                          <PersonStanding size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-white truncate uppercase tracking-widest">{uploadedModelName}</p>
                          <p className="text-[9px] text-white/30 font-black uppercase tracking-[0.15em] mt-0.5">Ready for Skeleton</p>
                        </div>
                        <button 
                          onClick={clearUploadedModel} 
                          className="p-2 rounded-xl hover:bg-rose-500/10 text-white/20 hover:text-rose-500 transition-all"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-4 flex items-center gap-4 group">
                        <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/40 group-hover:text-white transition-all">
                          <Box size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-white truncate uppercase tracking-widest">{activeModel.name}</p>
                          <p className="text-[9px] text-white/20 font-black uppercase tracking-[0.15em] mt-0.5">Active Workspace Mesh</p>
                        </div>
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Target asset for skeleton generation</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <label
                    id="rigging-upload-area"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "flex flex-col items-center justify-center gap-3 py-8 rounded-3xl border-2 border-dashed transition-all cursor-pointer text-center group",
                      isDragOver
                        ? 'border-amber-500 bg-amber-500/5'
                        : 'border-white/5 bg-white/[0.01] hover:border-amber-500/30 hover:bg-white/[0.03]'
                    )}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.02] flex items-center justify-center mb-1 group-hover:scale-110 group-hover:bg-amber-500/10 transition-all">
                      <Upload size={20} className="text-white/20 group-hover:text-amber-500 transition-all" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-black text-white uppercase tracking-widest">Import Humanoid Mesh</span>
                      <span className="text-[8px] text-white/20 font-black uppercase tracking-[0.2em]">GLB / FBX Supported</span>
                    </div>
                    <input type="file" accept=".glb,.gltf,.fbx,.obj" onChange={handleModelUpload} className="hidden" ref={fileInputRef} />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Upload a custom 3D model for auto-rigging</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* SECTION: RIGGING CONFIG */}
            <div className="flex flex-col gap-8" id="rigging-config-box">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Kinematic Engine</span>
              </div>

              <div className="flex flex-col gap-6">
                {/* Neural Model */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Compute Model</label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info size={12} className="text-white/20" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[200px]">
                        <p className="text-[10px]">AI model specializing in skeletal inference and joint placement.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <select
                    value={effectiveModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    disabled={isLoadingModels}
                    className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3.5 text-[11px] font-black text-white/80 cursor-pointer focus:outline-none focus:border-amber-500/30 transition-all appearance-none disabled:opacity-60 uppercase tracking-widest"
                  >
                    {modelOptions.map((m) => (
                      <option key={m.id || 'default'} value={m.id} className="bg-black text-white">
                        {m.label}{m.installed ? '' : ' (Pending)'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Skeleton Type */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Skeleton Type</label>
                  <select
                    value={boneStructure}
                    onChange={(e) => setBoneStructure(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3.5 text-[11px] font-black text-white/80 cursor-pointer focus:outline-none focus:border-amber-500/30 transition-all appearance-none uppercase tracking-widest"
                  >
                    {BONE_STRUCTURES.map(s => (
                      <option key={s.value} value={s.value} className="bg-black text-white">{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Joint Hierarchy */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Joint Hierarchy</label>
                  <select
                    value={rigType}
                    onChange={(e) => setRigType(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3.5 text-[11px] font-black text-white/80 cursor-pointer focus:outline-none focus:border-amber-500/30 transition-all appearance-none uppercase tracking-widest"
                  >
                    {RIG_TYPES.map(t => (
                      <option key={t.value} value={t.value} className="bg-black text-white">{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Auto-Rig Toggle */}
                <div className="flex items-center justify-between pt-4 border-t border-white/[0.03] group">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-white/70 uppercase tracking-widest group-hover:text-white transition-colors">Auto-Rig Pipeline</span>
                    <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.1em]">AI Joint Placement</span>
                  </div>
                  <button 
                    onClick={() => setAutoRig(!autoRig)}
                    className={cn(
                      "w-10 h-5 rounded-full relative transition-all duration-500",
                      autoRig ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-white/10'
                    )}
                  >
                    <motion.div 
                      animate={{ x: autoRig ? 22 : 2 }}
                      className="absolute top-1 left-0 w-3 h-3 rounded-full bg-white shadow-sm"
                    />
                  </button>
                </div>

                {/* Bake Button */}
                <Button
                  onClick={handleApplyRigging}
                  disabled={isRigging}
                  variant="premium"
                  className="w-full h-14 rounded-2xl text-[11px] mt-2"
                >
                  {isRigging ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Baking Skeleton...
                    </>
                  ) : (
                    <>
                      <Zap size={18} className="fill-current" />
                      Build Character Rig
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* SECTION: MOTION STUDIO */}
            <div className="flex flex-col gap-8" id="rigging-motion-box">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Motion Studio</span>
              </div>

              {/* Presets Grid */}
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Kinematic Presets</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {ANIMATION_PRESETS.map((preset) => {
                    const Icon = preset.icon;
                    const isSelected = selectedPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => setSelectedPreset(isSelected ? null : preset.id)}
                        className={cn(
                          "flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all group",
                          isSelected
                            ? 'border-amber-500 bg-amber-500/10 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                            : 'border-white/5 bg-white/[0.02] text-white/40 hover:border-white/10 hover:text-white/80'
                        )}
                      >
                        <Icon size={18} className={isSelected ? 'text-amber-500' : 'text-white/40 group-hover:text-white transition-colors'} />
                        <span className={cn(
                          "text-[9px] font-black uppercase tracking-wider text-center truncate w-full",
                          isSelected ? 'text-amber-500' : 'text-white/40 group-hover:text-white'
                        )}>
                          {preset.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Motion Settings */}
              <div className="flex flex-col gap-6 pt-4 border-t border-white/[0.03]">
                {/* Loop */}
                <div className="flex items-center justify-between group">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-white/70 uppercase tracking-widest group-hover:text-white transition-colors">Seamless Loop</span>
                    <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.1em]">Infinite Cyclic Playback</span>
                  </div>
                  <button 
                    onClick={() => setLoopAnimation(!loopAnimation)}
                    className={cn(
                      "w-10 h-5 rounded-full relative transition-all duration-500",
                      loopAnimation ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-white/10'
                    )}
                  >
                    <motion.div 
                      animate={{ x: loopAnimation ? 22 : 2 }}
                      className="absolute top-1 left-0 w-3 h-3 rounded-full bg-white shadow-sm"
                    />
                  </button>
                </div>

                {/* Speed */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Playback Rate</span>
                    <span className="text-[11px] font-black text-amber-500 tabular-nums">{speed.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer h-1.5 bg-white/5 rounded-lg appearance-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3 pt-2">
                  <Button
                    onClick={handlePreviewAnimation}
                    disabled={!riggingComplete || !selectedPreset}
                    variant="outline"
                    className="w-full h-12 rounded-2xl border-white/5 bg-white/[0.02] text-[10px] font-black uppercase tracking-widest text-white/80 hover:text-white hover:bg-white/[0.05] disabled:opacity-30"
                  >
                    {isPlaying ? (
                      <>
                        <Pause size={14} className="text-amber-500 mr-2" />
                        Pause Motion
                      </>
                    ) : (
                      <>
                        <Play size={14} className="text-amber-500 mr-2" />
                        Preview Motion
                      </>
                    )}
                  </Button>

                  {riggingComplete && (
                    <Button
                      onClick={handleExportRigged}
                      variant="outline"
                      className="w-full h-12 rounded-2xl border-emerald-500/20 bg-emerald-500/5 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/40"
                    >
                      <Download size={14} className="text-emerald-400 mr-2" />
                      Export Rigged Asset
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION: FORMATS */}
            <div className="p-6 rounded-3xl bg-white/[0.01] border border-white/5 flex flex-col gap-4">
              <span className="text-[9px] font-black text-amber-500 uppercase tracking-[0.2em]">Supported Formats</span>
              <div className="grid grid-cols-4 gap-2">
                {SUPPORTED_FORMATS.map((fmt) => (
                  <div key={fmt.label} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
                    <Box size={14} className="text-white/30" />
                    <span className="text-[9px] font-black text-white/80 uppercase">{fmt.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Right Viewport Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-black" id="rigging-right-stage">
          {/* Subtle Grid Backdrop */}
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

          {/* Processing State */}
          {isRigging && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl z-30 flex flex-col items-center justify-center text-center p-8 animate-fadeIn">
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-amber-500/10 border-t-amber-500 animate-spin" />
                <Bone size={28} className="absolute inset-0 m-auto text-amber-500 animate-pulse" />
              </div>
              <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mt-8">{statusMessage}</h3>
              <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em] mt-2">Kinematic Skeleton Synthesis in Progress</p>
              
              <div className="w-64 h-1.5 bg-white/5 rounded-full mt-8 overflow-hidden">
                <div className="h-full bg-amber-500 transition-all duration-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]" style={{ width: `${progressPercent}%` }} />
              </div>
              <span className="text-[11px] font-black text-amber-500 mt-3 tabular-nums">{progressPercent}%</span>
            </div>
          )}

          {/* Viewport Header */}
          <div className="absolute top-0 left-0 right-0 p-8 flex items-center justify-between z-20 pointer-events-none">
            <div className="flex flex-col gap-1 bg-black/60 backdrop-blur-xl px-5 py-3 rounded-2xl border border-white/5 pointer-events-auto shadow-2xl">
              <div className="flex items-center gap-2.5">
                <Eye size={14} className="text-amber-500" />
                <span className="text-[11px] font-black text-white uppercase tracking-widest">Viewport</span>
              </div>
              <p className="text-[9px] text-white/30 font-black uppercase tracking-[0.15em]">
                {riggingComplete ? 'Rigged Model Active' : 'Waiting for Skeleton'}
              </p>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <button className="p-3 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/5 text-white/40 hover:text-white shadow-2xl transition-all">
                <Maximize size={16} />
              </button>
            </div>
          </div>

          {/* Center 3D Stage / Visualization */}
          <div className="flex-1 flex items-center justify-center relative overflow-hidden">
            {!riggingComplete && !isRigging && (
              <div className="flex flex-col items-center text-center gap-5">
                <div className="w-20 h-20 rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-white/20">
                  <Box size={36} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] font-black text-white/40 uppercase tracking-[0.2em]">No Active Rig</span>
                  <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.15em]">Upload mesh and build skeleton to preview</span>
                </div>
              </div>
            )}

            {riggingComplete && !isRigging && (
              <div className="flex flex-col items-center gap-8">
                <PersonStanding size={140} className="text-amber-500/20 stroke-[0.5]" />
                <div className="flex items-center gap-6 bg-black/60 backdrop-blur-xl px-6 py-3 rounded-3xl border border-white/5 shadow-2xl">
                  <div className="flex items-center gap-3 border-r border-white/5 pr-6">
                    <Activity size={16} className="text-amber-500" />
                    <span className="text-[11px] font-black text-white uppercase tracking-widest">{selectedPreset || 'IDLE'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <RefreshCw size={16} className={cn("text-white/40", isPlaying && "animate-spin text-amber-500")} />
                    <span className="text-[11px] font-black text-white uppercase tracking-widest">{isPlaying ? 'Playing' : 'Paused'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Timeline Controller */}
          {riggingComplete && (
            <div className="p-8 bg-black/80 backdrop-blur-xl border-t border-white/5 z-20">
              <div className="flex flex-col gap-4 max-w-3xl mx-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setIsPlaying(!isPlaying)} 
                      className="w-10 h-10 rounded-2xl bg-amber-500 text-black flex items-center justify-center hover:brightness-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                    >
                      {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="translate-x-0.5" />}
                    </button>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-white uppercase tracking-widest">{selectedPreset || 'Select Preset'}</span>
                      <span className="text-[9px] text-white/30 font-mono tracking-wider">
                        00:{Math.floor(currentTime).toString().padStart(2, '0')} / 00:{Math.floor(currentDuration).toString().padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest bg-white/[0.03] px-3 py-1.5 rounded-xl border border-white/5">
                      Speed: {speed}x
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={timelinePosition}
                  onChange={handleTimelineScrub}
                  className="w-full accent-amber-500 cursor-pointer h-1 bg-white/5 rounded-full appearance-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
