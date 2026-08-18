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
import { loadModelInViewer } from '@/stores/useViewerStore';
import { cn } from '@/lib/utils';
import AssetPanelHost from '@/features/workspace/AssetPanelHost';

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
  controlsOnly?: boolean;
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
const LOCAL_MODELS: { id: string; label: string; installed: boolean; low_vram_supported: boolean; low_vram_required_mb: number }[] = [
  { id: 'unirig', label: 'UniRig', installed: false, low_vram_supported: false, low_vram_required_mb: 0 },
  { id: 'anigen', label: 'AniGen', installed: false, low_vram_supported: false, low_vram_required_mb: 0 },
];

export default function RiggingAnimationTab({ activeModel, onUpdateModel, onNavigate, controlsOnly }: RiggingAnimationTabProps & { controlsOnly?: boolean }) {
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
      low_vram_supported: Boolean(m.low_vram_supported),
      low_vram_required_mb: Number(m.low_vram_required_mb || 0),
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
  const [lowVram, setLowVram] = useState(false);

  // Timeline state
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelinePosition, setTimelinePosition] = useState(0);
  const animationFrameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const lastTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelUploadRef = React.useRef<(() => void) | null>(null);
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
      const { promise, cancel } = uploadService.uploadWithProgress(file, (progress) => {
        setModelUploadProgress(progress.percent);
      }, '/api/v1/upload/model');
      cancelUploadRef.current = cancel;
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
      cancelUploadRef.current = null;

      // Load model into viewer
      loadModelInViewer(url, file.name);

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
      if (err.message !== 'Upload cancelled') {
        toast.error('Upload failed', {
          description: err.message || 'Could not upload model.',
        });
      }
      return false;
    } finally {
      setIsUploadingModel(false);
      setModelUploadProgress(0);
      cancelUploadRef.current = null;
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
        low_vram: lowVram,
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

  const leftPanel = (
    <aside className="w-full lg:w-72 xl:w-80 border-r border-tripo-white-5 flex flex-col h-full bg-tripo-gray-2 z-10" id="rigging-left-panel">
      <div className="px-3 py-2 border-b border-tripo-white-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-tripo-yellow-1/10 flex items-center justify-center">
            <Bone size={13} className="text-tripo-yellow-1" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-white">Rigging & Motion</span>
            <span className="text-[10px] text-tripo-gray-400">Skeleton & Animation</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 scrollbar-thin" id="rigging-engine-box">
        {/* SECTION: ASSET & ENGINE */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-medium text-tripo-gray-300">Target Asset</label>
          
          {isUploadingModel ? (
            <div className="w-full flex flex-col items-center gap-1.5 py-2.5 bg-tripo-gray-3 rounded-lg border border-tripo-white-5">
              <RefreshCw size={14} className="text-tripo-yellow-1 animate-spin" />
              <div className="w-full max-w-[80%] h-1 bg-tripo-gray-4 rounded-full overflow-hidden">
                <div className="h-full bg-tripo-yellow-1 transition-all duration-200" style={{ width: `${modelUploadProgress}%` }} />
              </div>
              <button
                onClick={() => {
                  if (cancelUploadRef.current) cancelUploadRef.current();
                  setIsUploadingModel(false);
                  setModelUploadProgress(0);
                  setStatusMessage('Upload cancelled');
                }}
                className="text-[10px] font-mono text-tripo-gray-400 hover:underline cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : uploadedModelUrl ? (
            <div className="bg-tripo-gray-3 border border-tripo-white-5 rounded-lg p-2 flex items-center gap-2 group">
              <div className="w-6 h-6 rounded-md bg-tripo-yellow-1/10 flex items-center justify-center text-tripo-yellow-1">
                <PersonStanding size={12} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{uploadedModelName}</p>
                <p className="text-[10px] text-emerald-400 font-medium">Ready for Skeleton</p>
              </div>
              <button 
                onClick={clearUploadedModel} 
                className="p-1 rounded-md hover:bg-tripo-white-10 text-tripo-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="bg-tripo-gray-3 border border-tripo-white-5 rounded-lg p-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-tripo-yellow-1/10 flex items-center justify-center text-tripo-yellow-1">
                <Box size={12} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{activeModel.name}</p>
                <p className="text-[10px] text-tripo-gray-400">Active Workspace Mesh</p>
              </div>
            </div>
          )}
          
          <label
            id="rigging-upload-area"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-1 py-3.5 rounded-lg border border-dashed transition-all cursor-pointer text-center group ${
              isDragOver
                ? 'border-tripo-yellow-1 bg-tripo-yellow-1/5'
                : 'border-tripo-white-10 bg-tripo-gray-3 hover:border-tripo-yellow-1/50 hover:bg-tripo-gray-3/80'
            }`}
          >
            <Upload size={14} className="text-tripo-gray-400 group-hover:scale-110 group-hover:text-tripo-yellow-1 transition-all" />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-tripo-gray-200">Import Humanoid Mesh</span>
              <span className="text-[10px] text-tripo-gray-500">GLB / FBX Supported</span>
            </div>
            <input type="file" accept=".glb,.gltf,.fbx,.obj" onChange={handleModelUpload} className="hidden" ref={fileInputRef} />
          </label>
        </div>

        {/* SECTION: RIGGING CONFIG */}
        <div className="flex flex-col gap-2 pt-2 border-t border-tripo-white-5" id="rigging-config-box">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-tripo-gray-400">Skeleton Type</label>
              <select
                value={boneStructure}
                onChange={(e) => setBoneStructure(e.target.value)}
                className="w-full bg-tripo-gray-3 border border-tripo-white-5 rounded-lg px-2 py-1 text-xs font-medium text-tripo-gray-200 cursor-pointer focus:outline-none focus:border-tripo-yellow-1"
              >
                {BONE_STRUCTURES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-tripo-gray-400">Hierarchy</label>
              <select
                value={rigType}
                onChange={(e) => setRigType(e.target.value)}
                className="w-full bg-tripo-gray-3 border border-tripo-white-5 rounded-lg px-2 py-1 text-xs font-medium text-tripo-gray-200 cursor-pointer focus:outline-none focus:border-tripo-yellow-1"
              >
                {RIG_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center justify-between cursor-pointer py-1">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-tripo-gray-200">Auto-Rig Pipeline</span>
              <span className="text-[9.5px] text-tripo-gray-400">AI Bone Placement</span>
            </div>
            <input
              type="checkbox"
              checked={autoRig}
              onChange={(e) => setAutoRig(e.target.checked)}
              className="accent-tripo-yellow-1 h-3.5 w-3.5 cursor-pointer rounded"
            />
          </label>

          <button
            onClick={handleApplyRigging}
            disabled={isRigging}
            className="w-full bg-tripo-yellow-1 hover:bg-yellow-400 text-black font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {isRigging ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                Baking Skeleton...
              </>
            ) : (
              <>
                <Zap size={13} className="fill-current" />
                Build Rig
              </>
            )}
          </button>
        </div>

        {/* SECTION: MOTION STUDIO */}
        <div className="flex flex-col gap-2 pt-2 border-t border-tripo-white-5" id="rigging-motion-box">
          <label className="text-[11px] font-medium text-tripo-gray-300">Animation Presets</label>
          <div className="grid grid-cols-3 gap-1.5">
            {ANIMATION_PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isSelected = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => setSelectedPreset(isSelected ? null : preset.id)}
                  className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-tripo-yellow-1 bg-tripo-yellow-1/10 text-tripo-yellow-1 font-bold'
                      : 'border-tripo-white-5 bg-tripo-gray-3 text-tripo-gray-300 hover:text-white hover:border-tripo-white-10'
                  }`}
                >
                  <Icon size={14} className={isSelected ? 'text-tripo-yellow-1' : 'text-tripo-gray-400'} />
                  <span className="text-[10px]">{preset.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-medium text-tripo-gray-300">Seamless Loop</span>
              <input
                type="checkbox"
                checked={loopAnimation}
                onChange={(e) => setLoopAnimation(e.target.checked)}
                className="accent-tripo-yellow-1 h-3.5 w-3.5 cursor-pointer rounded"
              />
            </label>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px] text-tripo-gray-400">
                <span>Speed</span>
                <span className="text-tripo-gray-200 font-mono">{speed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-tripo-yellow-1 cursor-pointer h-1 bg-tripo-gray-4 rounded-full appearance-none"
              />
            </div>

            <button
              onClick={handlePreviewAnimation}
              disabled={!riggingComplete || !selectedPreset}
              className="w-full bg-tripo-gray-3 hover:bg-tripo-gray-3/80 border border-tripo-white-10 disabled:opacity-40 rounded-lg py-1.5 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause size={12} className="text-tripo-yellow-1" />
                  Pause Motion
                </>
              ) : (
                <>
                  <Play size={12} className="text-tripo-yellow-1" />
                  Preview Motion
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );

  if (controlsOnly) {
    return leftPanel;
  }

  return (
    <div
      className="flex-1 min-h-0 p-4 flex flex-col lg:flex-row gap-4 animate-fadeIn text-[hsl(var(--foreground))] overflow-y-auto"
      id="rigging-animation-tab-panel"
    >
      {leftPanel}
      <AssetPanelHost className="border-t border-[hsl(var(--border))]" />

      {/* Right Viewport Area */}
      <div className="flex-1 bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl flex flex-col relative overflow-hidden shadow-sm" id="rigging-right-stage">
        
        {/* Processing State */}
        {isRigging && (
          <div className="absolute inset-0 bg-[hsl(var(--surface-0)/0.8)] backdrop-blur-sm z-30 flex flex-col items-center justify-center text-center p-5 animate-fadeIn">
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
            <div className="flex flex-col items-center gap-4">
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
                  <button onClick={() => setIsPlaying(!isPlaying)} className="w-8 h-8 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--foreground))] flex items-center justify-center hover:brightness-110 active:scale-95 transition-all">
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
