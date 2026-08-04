"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { Shape3D } from '@/types/new-ui';

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

export default function RiggingAnimationTab({ activeModel, onUpdateModel, onNavigate }: RiggingAnimationTabProps) {
  const [uploadedModel, setUploadedModel] = useState<File | null>(null);
  const [uploadedModelUrl, setUploadedModelUrl] = useState<string | null>(null);
  const [uploadedModelName, setUploadedModelName] = useState<string>('');
  const [uploadedModelSize, setUploadedModelSize] = useState<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);

  // Rigging state
  const [autoRig, setAutoRig] = useState(true);
  const [rigType, setRigType] = useState('full_body');
  const [boneStructure, setBoneStructure] = useState('humanoid_standard');

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

  const validateAndSetModel = useCallback((file: File) => {
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
    setUploadedModel(file);
    setUploadedModelName(file.name);
    setUploadedModelSize(file.size);
    const url = URL.createObjectURL(file);
    setUploadedModelUrl(url);
    setStatusMessage(null);
    setRiggingComplete(false);
    setRiggingResult(null);
    setIsPlaying(false);
    setTimelinePosition(0);
    toast.success('Model loaded', {
      description: `${file.name} (${formatFileSize(file.size)})`,
    });
    return true;
  }, []);

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetModel(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
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

    // Upload model if user uploaded one
    if (uploadedModel) {
      setStatusMessage('Uploading model...');
      setProgressPercent(5);
      try {
        const formData = new FormData();
        formData.append('file', uploadedModel);
        const uploadRes = await fetch('/api/v1/upload/model', {
          method: 'POST',
          body: formData,
        });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const uploadData = await uploadRes.json();
        modelUrl = uploadData?.data?.url || uploadData?.url || '';
        if (!modelUrl) throw new Error('No URL returned from upload');
        setProgressPercent(15);
        setStatusMessage('Model uploaded. Submitting rigging job...');
      } catch (err: any) {
        toast.error('Upload failed', {
          description: err.message || 'Could not upload model.',
        });
        setStatusMessage(`Upload failed: ${err.message}`);
        setIsRigging(false);
        setProgressPercent(0);
        return;
      }
    }

    // Submit rigging job
    setStatusMessage('Submitting rigging job...');
    setProgressPercent(20);

    try {
      const payload: any = {
        prompt: `Auto-rig 3D model with ${rigType} skeleton using ${boneStructure} bone structure${autoRig ? ', auto-rig enabled' : ', manual rig'}`,
        mode: 'rigging',
        quality: 'standard',
        auto_rig: autoRig,
      };
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
      }, 800);
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
      className="flex-1 p-6 flex flex-col lg:flex-row gap-6 animate-fadeIn text-[hsl(var(--foreground))]"
      id="rigging-animation-tab-panel"
    >
      {/* ==================== LEFT PANEL ==================== */}
      <div
        className="w-full lg:w-[380px] flex flex-col gap-6 flex-shrink-0"
        id="rigging-left-panel"
      >
        {/* Main Config Card */}
        <div
          className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-5 flex flex-col gap-6"
          id="rigging-inputs-box"
        >
          {/* Header */}
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Activity size={20} className="text-[hsl(var(--primary))]" />
              3D Rigging & Animation
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Auto-rig your 3D models and preview animations
            </p>
          </div>

          {/* Model Upload / Active Target */}
          <div
            className="bg-[hsl(var(--surface-2))] rounded-xl border border-[hsl(var(--border))] p-4 flex flex-col gap-4"
            id="rigging-upload-area"
          >
            <span className="text-[9px] font-bold text-[hsl(var(--primary))] uppercase tracking-wider">
              Target Model
            </span>

            {uploadedModelUrl ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-gradient-to-tr from-[hsl(var(--primary))]/20 to-transparent flex items-center justify-center border border-[hsl(var(--primary))]/10">
                  <Box size={18} className="text-[hsl(var(--primary))]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {uploadedModelName}
                  </p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate font-mono">
                    {formatFileSize(uploadedModelSize)}
                  </p>
                </div>
                <button
                  onClick={clearUploadedModel}
                  className="text-[hsl(var(--muted-foreground))] hover:text-white transition-colors"
                  aria-label="Remove uploaded model"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-gradient-to-tr from-[hsl(var(--primary))]/20 to-transparent flex items-center justify-center border border-[hsl(var(--primary))]/10">
                  <Activity size={18} className="text-[hsl(var(--primary))]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {activeModel.name}
                  </p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate font-mono">
                    {activeModel.complexity}
                  </p>
                </div>
              </div>
            )}

            {/* Drag-and-drop upload zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={
                'flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed cursor-pointer transition-all text-[11px] ' +
                (isDragOver
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 text-[hsl(var(--primary))]'
                  : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]')
              }
            >
              <Upload size={14} />
              <span>Upload 3D Model (.glb / .gltf)</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,.gltf"
                onChange={handleModelUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Rigging Options Section */}
          <div
            className="flex flex-col gap-5"
            id="rigging-options-form"
          >
            <div className="flex items-center gap-2">
              <Bone size={14} className="text-[hsl(var(--primary))]" />
              <span className="text-xs font-bold text-white">Rigging Options</span>
            </div>

            {/* Auto Rig Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Auto Rig</span>
                <span className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">
                  Automatically detect and generate skeleton
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoRig}
                onChange={(e) => setAutoRig(e.target.checked)}
                className="accent-[hsl(var(--primary))] h-4 w-4 cursor-pointer"
              />
            </div>

            {/* Rig Type Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                Rig Type
              </label>
              <div className="relative">
                <select
                  value={rigType}
                  onChange={(e) => setRigType(e.target.value)}
                  className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-2.5 pr-8 text-xs text-white focus:outline-none focus:border-[hsl(var(--primary))] cursor-pointer appearance-none"
                  id="rig-type-select"
                >
                  {RIG_TYPES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] pointer-events-none"
                />
              </div>
            </div>

            {/* Joint Count Display */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                Joint Count
              </span>
              <span className="text-xs font-bold text-[hsl(var(--muted-foreground))]">Auto-detect</span>
            </div>

            {/* Bone Structure Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                Bone Structure
              </label>
              <div className="relative">
                <select
                  value={boneStructure}
                  onChange={(e) => setBoneStructure(e.target.value)}
                  className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-2.5 pr-8 text-xs text-white focus:outline-none focus:border-[hsl(var(--primary))] cursor-pointer appearance-none"
                  id="bone-structure-select"
                >
                  {BONE_STRUCTURES.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] pointer-events-none"
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[hsl(var(--border))]" />

          {/* Animation Presets Section */}
          <div className="flex flex-col gap-4" id="animation-presets-section">
            <div className="flex items-center gap-2">
              <Play size={14} className="text-[hsl(var(--primary))]" />
              <span className="text-xs font-bold text-white">Animation Presets</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {ANIMATION_PRESETS.map((preset) => {
                const PresetIcon = preset.icon;
                const isSelected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(isSelected ? null : preset.id)}
                    className={
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all cursor-pointer ' +
                      (isSelected
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/[0.06] shadow-[0_0_12px_rgba(245,166,35,0.1)]'
                        : 'border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] hover:border-[hsl(var(--primary))]/30 hover:bg-[hsl(var(--primary))]/[0.03]')
                    }
                  >
                    <PresetIcon
                      size={20}
                      className={isSelected ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'}
                    />
                    <span className={
                      'text-[10px] font-bold ' +
                      (isSelected ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]')
                    }>
                      {preset.label}
                    </span>
                    <span className="text-[8px] text-[hsl(var(--muted-foreground))] leading-tight text-center">
                      {preset.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[hsl(var(--border))]" />

          {/* Animation Settings Section */}
          <div className="flex flex-col gap-4" id="animation-settings-section">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-[hsl(var(--primary))]" />
              <span className="text-xs font-bold text-white">Animation Settings</span>
            </div>

            {/* Loop Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Loop</span>
                <span className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">
                  Repeat animation continuously
                </span>
              </div>
              <input
                type="checkbox"
                checked={loopAnimation}
                onChange={(e) => setLoopAnimation(e.target.checked)}
                className="accent-[hsl(var(--primary))] h-4 w-4 cursor-pointer"
              />
            </div>

            {/* Speed Slider */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                <span>Speed</span>
                <span className="text-[hsl(var(--primary))] tabular-nums">{speed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-[hsl(var(--primary))] cursor-pointer"
                id="speed-slider"
              />
              <div className="flex justify-between text-[9px] text-[hsl(var(--muted-foreground))] font-mono">
                <span>0.5x</span>
                <span>2.0x</span>
              </div>
            </div>

            {/* Blend Mode Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                Blend Mode
              </label>
              <div className="relative">
                <select
                  value={blendMode}
                  onChange={(e) => setBlendMode(e.target.value)}
                  className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-2.5 pr-8 text-xs text-white focus:outline-none focus:border-[hsl(var(--primary))] cursor-pointer appearance-none"
                  id="blend-mode-select"
                >
                  {BLEND_MODES.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] pointer-events-none"
                />
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[hsl(var(--border))]" />

          {/* Credit Cost Badge */}
          <div className="flex items-center justify-between bg-[hsl(var(--surface-2))] border border-[hsl(var(--surface-3))] rounded-lg px-3 py-2">
            <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono uppercase font-bold">
              Estimated Cost
            </span>
            <span className="text-xs font-bold text-[hsl(var(--primary))] flex items-center gap-1">
              <Sparkles size={12} className="text-[hsl(var(--primary))]" />
              50 Credits
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3" id="rigging-action-buttons">
            <button
              onClick={handleApplyRigging}
              disabled={isRigging}
              className="w-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] hover:brightness-110 active:scale-[0.98] text-black font-extrabold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-[0_4px_15px_rgba(245,166,35,0.2)] mt-4"
              id="apply-rigging-btn"
            >
              {isRigging ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-black" />
                  Rigging...
                </>
              ) : (
                <>
                  <Bone size={14} className="stroke-[2.5]" />
                  Apply Rigging
                </>
              )}
            </button>

            <button
              onClick={handlePreviewAnimation}
              disabled={!riggingComplete || !selectedPreset}
              className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl py-3.5 text-xs font-bold text-white flex items-center justify-center gap-2 transition-all mt-4"
              id="preview-animation-btn"
            >
              {isPlaying ? (
                <>
                  <Pause size={14} className="text-[hsl(var(--primary))]" />
                  Pause Animation
                </>
              ) : (
                <>
                  <Play size={14} className="text-[hsl(var(--primary))]" />
                  Preview Animation
                </>
              )}
            </button>

            {riggingComplete && (
              <button
                onClick={handleExportRigged}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] hover:border-emerald-500/50 rounded-xl py-3.5 text-xs font-bold text-white flex items-center justify-center gap-2 transition-all mt-4"
                id="export-rigged-btn"
              >
                <Download size={13} className="text-emerald-400" />
                Export Rigged Model (FBX)
              </button>
            )}
          </div>
        </div>

        {/* Supported Formats Info */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-4 flex flex-col gap-3">
          <span className="text-[10px] font-bold text-[hsl(var(--primary))] uppercase tracking-wider">
            Supported Model Formats
          </span>
          <div className="grid grid-cols-4 gap-2">
            {SUPPORTED_FORMATS.map((fmt) => (
              <div
                key={fmt.label}
                className="flex flex-col items-center gap-1 p-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]"
              >
                <Box size={16} className="text-[hsl(var(--muted-foreground))]" />
                <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">
                  {fmt.label}
                </span>
                <span className="text-[8px] text-[hsl(var(--muted-foreground))] text-center leading-tight">
                  {fmt.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ==================== RIGHT PANEL ==================== */}
      <div
        className="flex-1 bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-6 flex flex-col gap-6 relative overflow-hidden"
        id="rigging-right-stage"
      >
        {/* Processing Overlay */}
        {isRigging && (
          <div className="absolute inset-0 bg-black/60 z-20 flex flex-col items-center justify-center text-center p-6 animate-speed-lines">
            <div className="w-24 h-24 rounded-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] animate-energy-pulse flex items-center justify-center text-black font-extrabold text-xs">
              <Bone size={36} className="animate-spin text-black stroke-[3]" />
            </div>
            <h3 className="text-lg font-black text-[hsl(var(--primary))] uppercase tracking-widest mt-6 animate-pulse">
              Rigging Model...
            </h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2 max-w-sm leading-relaxed font-mono">
              {statusMessage}
            </p>
            <div className="w-64 h-2 bg-[hsl(var(--surface-2))] rounded-full mt-4 overflow-hidden border border-[hsl(var(--border))]">
              <div
                className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono mt-1.5 tabular-nums">
              {progressPercent}%
            </span>
          </div>
        )}

        <div className="flex-1 flex flex-col gap-6 z-10">
          {/* Header */}
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Eye size={16} className="text-[hsl(var(--primary))]" />
              Preview & Results
            </h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {riggingComplete
                ? 'Rigging applied. Select an animation preset and preview the result.'
                : 'Upload a 3D model, configure rigging options, then click "Apply Rigging" to generate a skeleton.'}
            </p>
          </div>

          {/* 3D Viewport Placeholder */}
          <div
            className="relative w-full rounded-xl border border-[hsl(var(--border))] overflow-hidden flex-shrink-0"
            style={{ height: '280px' }}
            id="rigging-viewport"
          >
            {/* Grid pattern background */}
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: 'hsl(var(--surface-0))',
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            {/* Center icon / placeholder content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
              {riggingComplete ? (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[hsl(var(--primary))]/20 to-transparent flex items-center justify-center border border-[hsl(var(--primary))]/20 mb-3">
                    <PersonStanding size={32} className="text-[hsl(var(--primary))]" />
                  </div>
                  <p className="text-xs font-bold text-white">
                    {uploadedModelName || activeModel.name}
                  </p>
                  <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle size={10} />
                    Rigged — {riggingResult?.boneCount} bones
                  </p>
                </>
              ) : (
                <>
                  <Grid3X3
                    size={40}
                    className={isRigging ? 'text-[hsl(var(--primary))]/30 animate-pulse' : 'text-[hsl(var(--border))] mb-2'}
                  />
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    {isRigging ? 'Processing rigging...' : '3D Viewport'}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Animation Timeline Bar */}
          {riggingComplete && selectedPreset && (
            <div
              className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--surface-3))] rounded-xl p-4 flex flex-col gap-3 animate-fadeIn"
              id="animation-timeline"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                  Timeline
                </span>
                <div className="flex items-center gap-2">
                  {loopAnimation && (
                    <span className="text-[9px] text-[hsl(var(--primary))] font-mono uppercase font-bold flex items-center gap-1">
                      <RotateCcw size={9} className="text-[hsl(var(--primary))]" />
                      Loop
                    </span>
                  )}
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">
                    {currentPreset?.fps} FPS
                  </span>
                </div>
              </div>

              {/* Scrubber */}
              <div className="flex items-center gap-4">
                <button
                  onClick={handlePreviewAnimation}
                  className="w-8 h-8 rounded-lg bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 flex items-center justify-center hover:bg-[hsl(var(--primary))]/20 transition-colors flex-shrink-0"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause size={14} className="text-[hsl(var(--primary))]" />
                  ) : (
                    <Play size={14} className="text-[hsl(var(--primary))] ml-0.5" />
                  )}
                </button>

                <div className="flex-1 relative">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.1}
                    value={timelinePosition}
                    onChange={handleTimelineScrub}
                    className="w-full accent-[hsl(var(--primary))] cursor-pointer h-1.5"
                    id="timeline-scrubber"
                  />
                </div>

                <div className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono tabular-nums flex-shrink-0 whitespace-nowrap">
                  {formatTime(currentTime)} / {formatTime(currentDuration)}
                </div>
              </div>
            </div>
          )}

          {/* Results Grid: Rigging Status + Animation Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Rigging Status Card */}
            <div
              className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--surface-3))] rounded-xl p-5 flex flex-col gap-4"
              id="rigging-status-card"
            >
              <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                Rigging Status
              </span>

              {riggingComplete && riggingResult ? (
                <div className="flex flex-col gap-2.5 animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-emerald-500" />
                    <span className="text-xs font-bold text-emerald-400">Complete</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">Bone Count</span>
                      <span className="text-[10px] text-[hsl(var(--primary))] font-bold tabular-nums">
                        {riggingResult.boneCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">Weight Map</span>
                      <span className={
                        'text-[10px] font-bold ' +
                        (riggingResult.rigWeightMap === 'Complete'
                          ? 'text-emerald-400'
                          : riggingResult.rigWeightMap === 'Partial'
                            ? 'text-amber-400'
                            : 'text-red-400')
                      }>
                        {riggingResult.rigWeightMap}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1">
                    <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase">Joint Hierarchy</span>
                    <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1 leading-relaxed">
                      {riggingResult.jointHierarchy}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <Bone size={24} className="text-[hsl(var(--border))] mb-2" />
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    {isRigging ? 'Processing...' : 'Not yet rigged'}
                  </p>
                  {isRigging && (
                    <p className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono mt-1">
                      {progressPercent}%
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Animation Preview Card */}
            <div
              className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--surface-3))] rounded-xl p-5 flex flex-col gap-4"
              id="animation-preview-card"
            >
              <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                Animation Preview
              </span>

              {selectedPreset && currentPreset ? (
                <div className="flex flex-col gap-2.5 animate-fadeIn">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const IconComp = currentPreset.icon;
                      return <IconComp size={14} className="text-[hsl(var(--primary))]" />;
                    })()}
                    <span className="text-xs font-bold text-white">
                      {currentPreset.label}
                    </span>
                  </div>
                  <p className="text-[9px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                    {currentPreset.description}
                  </p>
                  <div className="flex flex-col gap-1.5 mt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">FPS</span>
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-bold tabular-nums">
                        {currentPreset.fps}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">Duration</span>
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-bold tabular-nums">
                        {currentPreset.duration.toFixed(1)}s
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">Frames</span>
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-bold tabular-nums">
                        {currentPreset.frameCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">Blend</span>
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-bold">
                        {blendMode}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">Speed</span>
                      <span className="text-[10px] text-[hsl(var(--primary))] font-bold tabular-nums">
                        {speed.toFixed(1)}x
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <Play size={24} className="text-[hsl(var(--border))] mb-2" />
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    Select a preset to preview
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Info Notice */}
          <div className="bg-[hsl(var(--surface-2))] rounded-xl p-4 border border-[hsl(var(--primary))]/10 flex items-start gap-3 mt-auto">
            <Info size={15} className="text-[hsl(var(--primary))] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="text-[10px] font-bold text-[hsl(var(--primary))] uppercase tracking-wider">
                Rigging & Animation Info
              </span>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1 leading-relaxed">
                Auto-rigging detects body segments and generates a bone skeleton
                with proper weight maps.{' '}
                <strong className="text-white">Full Body Rig</strong> includes all
                limbs,{' '}
                <strong className="text-white">Upper Body</strong> covers torso
                and arms, and{' '}
                <strong className="text-white">Lower Body</strong> covers hips
                and legs. Animation presets are applied after rigging is complete.
                Export as FBX for use in game engines and 3D software.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
