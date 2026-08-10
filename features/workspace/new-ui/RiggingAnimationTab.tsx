"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import anime from 'animejs';
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
      const { url } = await uploadService.uploadWithProgress(file, (progress) => {
        setModelUploadProgress(progress.percent);
      }, '/api/v1/upload/model');
      
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

  const handleExportRigged = () => {
    toast.success('Exporting rigged model as FBX...', {
      description: `${uploadedModelName || activeModel.name}_rigged.fbx`,
    });
  };

  const handleTimelineScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTimelinePosition(parseFloat(e.target.value));
    setIsPlaying(false);
  };

  const currentTime = (timelinePosition / 100) * currentDuration;

  return (
    <div
      className="flex-1 min-h-0 p-6 flex flex-col lg:flex-row gap-6 animate-fadeIn text-[hsl(var(--foreground))] overflow-y-auto"
      id="rigging-animation-tab-panel"
    >
      {/* Left Input Configuration Panel */}
      <div className="w-full lg:w-[360px] flex flex-col gap-6 flex-shrink-0" id="rigging-left-panel">
        
        {/* SECTION: ASSET & ENGINE */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-5 flex flex-col gap-5 shadow-sm" id="rigging-engine-box">
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Rigging Engine</span>
            <Cpu size={12} className="text-[hsl(var(--primary))]" />
          </div>

          <div className="flex flex-col gap-4">
            {/* Model Upload area */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Target Asset</label>
              
              {isUploadingModel ? (
                <div className="w-full flex flex-col items-center gap-2 py-4 bg-[hsl(var(--surface-2))] rounded-xl border border-[hsl(var(--border))]">
                  <RefreshCw size={16} className="text-[hsl(var(--primary))] animate-spin" />
                  <div className="w-full max-w-[80%] h-1 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
                    <div className="h-full bg-[hsl(var(--primary))] transition-all duration-200" style={{ width: `${modelUploadProgress}%` }} />
                  </div>
                </div>
              ) : uploadedModelUrl ? (
                <div className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--neon-green)/0.3)] rounded-xl p-3 flex items-center gap-3 group">
                  <div className="w-8 h-8 rounded-lg bg-[hsl(var(--neon-green))/0.1] flex items-center justify-center text-[hsl(var(--neon-green))]">
                    <PersonStanding size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-[hsl(var(--foreground))] truncate">{uploadedModelName}</p>
                    <p className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tighter">Ready for Skeleton</p>
                  </div>
                  <button 
                    onClick={clearUploadedModel} 
                    className="p-1.5 rounded-lg hover:bg-[hsl(var(--destructive))/0.1] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[hsl(var(--primary))/0.1] flex items-center justify-center text-[hsl(var(--primary))]">
                    <Box size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-[hsl(var(--foreground))] truncate">{activeModel.name}</p>
                    <p className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tighter">Active Workspace Mesh</p>
                  </div>
                </div>
              )}
              
              <label
                id="rigging-upload-area"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-1.5 py-5 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center group ${
                  isDragOver
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                    : 'border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] hover:border-[hsl(var(--primary))]/50 hover:bg-[hsl(var(--surface-2))]'
                }`}
              >
                <Upload size={16} className="text-[hsl(var(--muted-foreground))] group-hover:scale-110 group-hover:text-[hsl(var(--primary))] transition-all" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-[hsl(var(--foreground))]">Import Humanoid Mesh</span>
                  <span className="text-[8px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tighter">GLB / FBX Supported</span>
                </div>
                <input type="file" accept=".glb,.gltf,.fbx,.obj" onChange={handleModelUpload} className="hidden" ref={fileInputRef} />
              </label>
            </div>

          {/* Provider selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Compute Provider</label>
            <div className="relative group">
              <select
                value={effectiveModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={isLoadingModels}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl px-3 pr-8 py-2.5 text-[11px] font-black text-[hsl(var(--foreground))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))] transition-all appearance-none disabled:opacity-60 shadow-sm"
              >
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.installed ? '' : ' (Not Installed)'}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3 text-[hsl(var(--muted-foreground))] pointer-events-none group-hover:text-[hsl(var(--primary))] transition-colors" />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: RIGGING CONFIG */}
      <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-5 flex flex-col gap-5 shadow-sm" id="rigging-config-box">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Rigging Config</span>
          <Bone size={12} className="text-[hsl(var(--primary))]" />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Skeleton Type</label>
            <div className="relative group">
              <select
                value={boneStructure}
                onChange={(e) => setBoneStructure(e.target.value)}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl px-3 pr-8 py-2.5 text-[11px] font-black text-[hsl(var(--foreground))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))] transition-all appearance-none shadow-sm"
              >
                {BONE_STRUCTURES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3 text-[hsl(var(--muted-foreground))] pointer-events-none group-hover:text-[hsl(var(--primary))] transition-colors" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Joint Hierarchy</label>
            <div className="relative group">
              <select
                value={rigType}
                onChange={(e) => setRigType(e.target.value)}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl px-3 pr-8 py-2.5 text-[11px] font-black text-[hsl(var(--foreground))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))] transition-all appearance-none shadow-sm"
              >
                {RIG_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3 text-[hsl(var(--muted-foreground))] pointer-events-none group-hover:text-[hsl(var(--primary))] transition-colors" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--border))/40]">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-[hsl(var(--foreground))] uppercase">Auto-Rig Pipeline</span>
              <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase">AI Bone Placement</span>
            </div>
            <input
              type="checkbox"
              checked={autoRig}
              onChange={(e) => setAutoRig(e.target.checked)}
              className="accent-[hsl(var(--primary))] h-4 w-4 cursor-pointer"
            />
          </div>

          <button
            onClick={handleApplyRigging}
            disabled={isRigging}
            className="w-full bg-[hsl(var(--primary))] hover:brightness-110 active:scale-[0.98] text-[hsl(var(--surface-0))] font-black py-3 rounded-xl text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-[0_8px_20px_rgba(245,166,35,0.2)] mt-2"
          >
            {isRigging ? (
              <>
                <RefreshCw size={14} className="animate-spin text-[hsl(var(--surface-0))]" />
                Baking Skeleton...
              </>
            ) : (
              <>
                <Zap size={14} className="fill-current text-[hsl(var(--surface-0))]" />
                Build Character Rig
              </>
            )}
          </button>
        </div>
      </div>

        {/* SECTION: ANIMATION CONFIG (PRESETS & SETTINGS) */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-5 flex flex-col gap-5 shadow-sm" id="rigging-motion-box">
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Motion Studio</span>
            <Play size={12} className="text-[hsl(var(--primary))]" />
          </div>

          <div className="flex flex-col gap-5">
            {/* Presets Grid */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Animation Presets</label>
              <div className="grid grid-cols-3 gap-2">
                {ANIMATION_PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  const isSelected = selectedPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(isSelected ? null : preset.id)}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all group ${
                        isSelected
                          ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/[0.06]'
                          : 'border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] hover:border-[hsl(var(--primary))]/30'
                      }`}
                    >
                      <Icon size={16} className={isSelected ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))]'} />
                      <span className={`text-[9px] font-black uppercase tracking-tighter ${isSelected ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                        {preset.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Animation Settings */}
            <div className="flex flex-col gap-4 pt-2 border-t border-[hsl(var(--border))/40]">
              {/* Loop */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-[hsl(var(--foreground))] uppercase">Seamless Loop</span>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase">Infinite Playback</span>
                </div>
                <input
                  type="checkbox"
                  checked={loopAnimation}
                  onChange={(e) => setLoopAnimation(e.target.checked)}
                  className="accent-[hsl(var(--primary))] h-4 w-4 cursor-pointer"
                />
              </div>

              {/* Speed */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase">Playback Speed</span>
                  <span className="text-[10px] font-black text-[hsl(var(--primary))] tabular-nums">{speed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-[hsl(var(--primary))] cursor-pointer h-1.5 bg-[hsl(var(--surface-3))] rounded-lg appearance-none"
                />
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 mt-2">
                <button
                  onClick={handlePreviewAnimation}
                  disabled={!riggingComplete || !selectedPreset}
                  className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 disabled:opacity-40 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest text-[hsl(var(--foreground))] flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  {isPlaying ? (
                    <>
                      <Pause size={12} className="text-[hsl(var(--primary))]" />
                      Pause Motion
                    </>
                  ) : (
                    <>
                      <Play size={12} className="text-[hsl(var(--primary))]" />
                      Preview Motion
                    </>
                  )}
                </button>

                {riggingComplete && (
                  <button
                    onClick={handleExportRigged}
                    className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] hover:border-[hsl(var(--neon-green))]/50 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest text-[hsl(var(--foreground))] flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <Download size={12} className="text-[hsl(var(--neon-green))]" />
                    Export Rigged Asset
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION: FORMATS */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
          <span className="text-[9px] font-black text-[hsl(var(--primary))] uppercase tracking-widest border-b border-[hsl(var(--border))] pb-1">Compatibility</span>
          <div className="grid grid-cols-4 gap-2">
            {SUPPORTED_FORMATS.map((fmt) => (
              <div key={fmt.label} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] text-center">
                <Box size={14} className="text-[hsl(var(--muted-foreground))]" />
                <span className="text-[9px] font-black text-[hsl(var(--foreground))] uppercase">{fmt.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Viewport Area */}
      <div className="flex-1 bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl flex flex-col relative overflow-hidden shadow-sm" id="rigging-right-stage">
        
        {/* Processing State */}
        {isRigging && (
          <div className="absolute inset-0 bg-[hsl(var(--surface-0)/0.8)] backdrop-blur-sm z-30 flex flex-col items-center justify-center text-center p-8 animate-fadeIn">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-[hsl(var(--primary))/0.1] border-t-[hsl(var(--primary))] animate-spin" />
              <Bone size={24} className="absolute inset-0 m-auto text-[hsl(var(--primary))] animate-pulse" />
            </div>
            <h3 className="text-sm font-black text-[hsl(var(--foreground))] uppercase tracking-widest mt-6">{statusMessage}</h3>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tighter mt-1">Skeleton Synthesis in Progress</p>
            
            <div className="w-48 h-1 bg-[hsl(var(--surface-3))] rounded-full mt-6 overflow-hidden">
              <div className="h-full bg-[hsl(var(--primary))] transition-all duration-500" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="text-[10px] font-black text-[hsl(var(--primary))] mt-2 tabular-nums">{progressPercent}%</span>
          </div>
        )}

        {/* Viewport Header */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-20 pointer-events-none">
          <div className="flex flex-col gap-0.5 bg-[hsl(var(--surface-1))/0.8] backdrop-blur-md px-3 py-2 rounded-xl border border-[hsl(var(--border))] pointer-events-auto shadow-sm">
            <div className="flex items-center gap-2">
              <Eye size={12} className="text-[hsl(var(--primary))]" />
              <span className="text-[10px] font-black text-[hsl(var(--foreground))] uppercase tracking-widest">Viewport</span>
            </div>
            <p className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase">
              {riggingComplete ? 'Rigged Model Active' : 'Waiting for Skeleton'}
            </p>
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            <button className="p-2 rounded-xl bg-[hsl(var(--surface-1))/0.8] backdrop-blur-md border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] shadow-sm transition-all">
              <Maximize size={14} />
            </button>
          </div>
        </div>

        {/* Placeholder for 3D Stage */}
        <div className="flex-1 flex items-center justify-center relative bg-[radial-gradient(circle_at_center,hsl(var(--surface-2))_0%,hsl(var(--surface-1))_100%)] overflow-hidden">
          
          {!riggingComplete && !isRigging && (
            <div className="flex flex-col items-center text-center gap-4 animate-pulse">
              <div className="w-16 h-16 rounded-full bg-[hsl(var(--surface-3))] flex items-center justify-center text-[hsl(var(--muted-foreground))]">
                <Box size={32} />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-widest">No Active Rig</span>
                <span className="text-[9px] text-[hsl(var(--muted-foreground))/0.6] font-mono">Upload and build to preview</span>
              </div>
            </div>
          )}

          {riggingComplete && !isRigging && (
            <div className="flex flex-col items-center gap-6">
              <PersonStanding size={120} className="text-[hsl(var(--primary))/0.2] stroke-[0.5]" />
              <div className="flex items-center gap-4 bg-[hsl(var(--surface-2))/0.5] backdrop-blur-md px-4 py-2 rounded-full border border-[hsl(var(--border))]">
                <div className="flex items-center gap-2 border-r border-[hsl(var(--border))] pr-4">
                  <Activity size={14} className="text-[hsl(var(--primary))]" />
                  <span className="text-[10px] font-black text-[hsl(var(--foreground))] uppercase">{selectedPreset || 'IDLE'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <RefreshCw size={14} className={`text-[hsl(var(--muted-foreground))] ${isPlaying ? 'animate-spin' : ''}`} />
                  <span className="text-[10px] font-black text-[hsl(var(--foreground))] uppercase tracking-widest">{isPlaying ? 'Playing' : 'Paused'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Timeline Controller */}
        {riggingComplete && (
          <div className="p-4 bg-[hsl(var(--surface-1))/0.8] backdrop-blur-md border-t border-[hsl(var(--border))] z-20">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setIsPlaying(!isPlaying)} className="w-8 h-8 rounded-lg bg-[hsl(var(--primary))] text-white flex items-center justify-center hover:brightness-110 active:scale-95 transition-all">
                    {isPlaying ? <Pause size={14} fill="white" /> : <Play size={14} fill="white" className="translate-x-0.5" />}
                  </button>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-[hsl(var(--foreground))] uppercase">{selectedPreset || 'Select Preset'}</span>
                    <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">00:{Math.floor(currentTime).toString().padStart(2, '0')} / 00:{Math.floor(currentDuration).toString().padStart(2, '0')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-[hsl(var(--muted-foreground))] uppercase">Speed: {speed}x</span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={timelinePosition}
                onChange={handleTimelineScrub}
                className="w-full accent-[hsl(var(--primary))] cursor-pointer h-1 bg-[hsl(var(--surface-3))] rounded-full appearance-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
