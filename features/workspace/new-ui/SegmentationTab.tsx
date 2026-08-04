"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Layers,
  Upload,
  Play,
  RefreshCw,
  CheckCircle,
  X,
  AlertTriangle,
  Download,
  Box,
  Hexagon,
  Palette,
  Sparkles,
  Eye,
  EyeOff,
  ChevronDown,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { Shape3D } from '@/types/new-ui';

interface SegmentationTabProps {
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

interface SegmentedPart {
  id: string;
  name: string;
  faceCount: number;
  vertexCount: number;
  material: string;
  color: string;
  selected: boolean;
  visible: boolean;
}

const PART_COLORS = [
  'hsl(var(--primary))', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6',
  '#EC4899', '#F97316', '#06B6D4', '#84CC16', '#E11D48',
  '#6366F1', '#14B8A6', '#F59E0B', '#6D28D9', '#059669',
  '#DC2626', '#7C3AED', '#2563EB', '#D946EF', '#0EA5E9',
];

const SEGMENTATION_METHODS = [
  {
    value: 'semantic',
    label: 'Semantic Segmentation',
    desc: 'AI-based part detection using deep learning',
    icon: Sparkles,
  },
  {
    value: 'geometric',
    label: 'Geometric Partition',
    desc: 'Mesh splitting by geometric analysis',
    icon: Hexagon,
  },
  {
    value: 'material',
    label: 'Material-Based Split',
    desc: 'Separate by material groups',
    icon: Palette,
  },
];

export default function SegmentationTab({ activeModel, onUpdateModel, onNavigate }: SegmentationTabProps) {
  const [uploadedModel, setUploadedModel] = useState<File | null>(null);
  const [uploadedModelUrl, setUploadedModelUrl] = useState<string | null>(null);
  const [uploadedModelName, setUploadedModelName] = useState<string>('');
  const [uploadedModelSize, setUploadedModelSize] = useState<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const [segmentMethod, setSegmentMethod] = useState('semantic');
  const [maxParts, setMaxParts] = useState(8);
  const [preserveUvs, setPreserveUvs] = useState(true);
  const [exportSeparated, setExportSeparated] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [segmentedParts, setSegmentedParts] = useState<SegmentedPart[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);

  const [showWarnings, setShowWarnings] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressSimRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (progressSimRef.current) { clearInterval(progressSimRef.current); progressSimRef.current = null; }
    };
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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
    setSegmentedParts([]);
    setIsCompleted(false);
    setShowWarnings(false);
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
    setSegmentedParts([]);
    setIsCompleted(false);
    setStatusMessage(null);
  };

  const togglePartSelection = (partId: string) => {
    setSegmentedParts((prev) =>
      prev.map((p) => (p.id === partId ? { ...p, selected: !p.selected } : p))
    );
  };

  const togglePartVisibility = (partId: string) => {
    setSegmentedParts((prev) =>
      prev.map((p) => (p.id === partId ? { ...p, visible: !p.visible } : p))
    );
  };

  const selectAllParts = () => {
    setSegmentedParts((prev) => prev.map((p) => ({ ...p, selected: true })));
  };

  const deselectAllParts = () => {
    setSegmentedParts((prev) => prev.map((p) => ({ ...p, selected: false })));
  };

  const handleExportAll = () => {
    const selectedCount = segmentedParts.length;
    if (selectedCount === 0) {
      toast.error('No parts to export');
      return;
    }
    toast.success(`Exporting all ${selectedCount} parts...`);
  };

  const handleExportSelected = () => {
    const selectedParts = segmentedParts.filter((p) => p.selected);
    if (selectedParts.length === 0) {
      toast.error('No parts selected', {
        description: 'Select at least one part to export.',
      });
      return;
    }
    toast.success(`Exporting ${selectedParts.length} selected parts...`);
  };

  const handleStartSegmenting = async () => {
    if (isProcessing) return;

    if (!uploadedModel && (!activeModel || !activeModel.name)) {
      toast.error('No model available', {
        description: 'Upload a 3D model or ensure an active model is loaded.',
      });
      return;
    }

    setIsProcessing(true);
    setIsCompleted(false);
    setSegmentedParts([]);
    setProgressPercent(0);
    setStatusMessage('Preparing segmentation pipeline...');
    setShowWarnings(true);

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
        setStatusMessage('Model uploaded. Submitting segmentation job...');
      } catch (err: any) {
        toast.error('Upload failed', {
          description: err.message || 'Could not upload model.',
        });
        setStatusMessage(`Upload failed: ${err.message}`);
        setIsProcessing(false);
        setProgressPercent(0);
        return;
      }
    }

    // Submit segmentation job
    setStatusMessage('Submitting segmentation job...');
    setProgressPercent(20);

    try {
      const payload: any = {
        prompt: `Segment model into parts using ${segmentMethod} method, max ${maxParts} parts${preserveUvs ? ', preserve UVs' : ''}${exportSeparated ? ', export separated' : ''}`,
        mode: 'partition',
        quality: 'standard',
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
        setStatusMessage(`Job ${jobId} submitted. Analyzing mesh...`);
        toast.info('Segmentation started', {
          description: `Job ID: ${jobId}`,
        });

        // Simulate progressive updates while polling
        let simulatedProgress = 25;
        progressSimRef.current = setInterval(() => {
          if (simulatedProgress < 85) {
            simulatedProgress += Math.floor(Math.random() * 8) + 2;
            simulatedProgress = Math.min(simulatedProgress, 85);
            setProgressPercent(simulatedProgress);
            const stages = [
              'Analyzing mesh topology...',
              'Detecting part boundaries...',
              'Computing segmentation map...',
              'Separating geometry...',
              'Generating part data...',
              'Finalizing segmentation...',
            ];
            const stageIdx = Math.min(
              Math.floor((simulatedProgress - 25) / 10),
              stages.length - 1
            );
            setStatusMessage(stages[stageIdx]);
          } else {
            if (progressSimRef.current) { clearInterval(progressSimRef.current); progressSimRef.current = null; }
          }
        }, 1500);

        // Poll actual backend status
        pollIntervalRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/v1/generation/${jobId}/status`);
            const statusData = await statusRes.json();

            if (statusData.data?.status === 'completed') {
              if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
              if (progressSimRef.current) { clearInterval(progressSimRef.current); progressSimRef.current = null; }

              setProgressPercent(100);
              setStatusMessage('Segmentation complete!');
              setIsCompleted(true);
              setIsProcessing(false);

              const backendParts = statusData.data?.parts || statusData.data?.result?.parts || [];
              setSegmentedParts(backendParts);

              toast.success('Segmentation complete!', {
                description: `Detected ${backendParts.length} parts`,
              });
            } else if (statusData.data?.status === 'failed') {
              if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
              if (progressSimRef.current) { clearInterval(progressSimRef.current); progressSimRef.current = null; }

              const errMsg = statusData.data?.error_message || 'Unknown error';
              setStatusMessage(`Segmentation failed: ${errMsg}`);
              setIsProcessing(false);
              setProgressPercent(0);

              toast.error('Segmentation failed', {
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
            if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
            if (progressSimRef.current) { clearInterval(progressSimRef.current); progressSimRef.current = null; }
            setIsProcessing(false);
            setProgressPercent(0);
            setStatusMessage('Connection lost to backend during polling.');

            toast.error('Connection lost', {
              description: 'Lost connection to the backend during segmentation.',
            });
          }
        }, 2000);
      } else {
        const errMsg = data.detail || data.error || 'Backend returned an error.';
        setStatusMessage(`Error: ${errMsg}`);
        setIsProcessing(false);
        setProgressPercent(0);

        toast.error('Segmentation failed', {
          description: errMsg,
        });
      }
    } catch {
      toast.error('Backend unreachable', {
        description: 'Could not connect to the backend to start segmentation.',
      });
      setIsProcessing(false);
      setProgressPercent(0);
      setStatusMessage('Backend unreachable. Please check your connection and retry.');
    }
  };

  const selectedCount = segmentedParts.filter((p) => p.selected).length;
  const totalFaces = segmentedParts.reduce((acc, p) => acc + p.faceCount, 0);
  const totalVerts = segmentedParts.reduce((acc, p) => acc + p.vertexCount, 0);

  const currentMethod = SEGMENTATION_METHODS.find((m) => m.value === segmentMethod);
  const MethodIcon = currentMethod?.icon || Layers;

  return (
    <div
      className="flex-1 p-6 flex flex-col lg:flex-row gap-6 animate-fadeIn text-[hsl(var(--foreground))]"
      id="segmentation-tab-panel"
    >
      {/* Left Panel: Configuration */}
      <div
        className="w-full lg:w-[380px] flex flex-col gap-5 flex-shrink-0"
        id="segmentation-left-panel"
      >
        <div
          className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-5 flex flex-col gap-6"
          id="segmentation-inputs-box"
        >
          {/* Header */}
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers size={20} className="text-[hsl(var(--primary))]" />
              Part Segmentation
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Select a model from Assets on the right or upload your own for Part
              Segmentation.
            </p>
          </div>

          {/* Model Upload / Active Target */}
          <div
            className="bg-[hsl(var(--surface-2))] rounded-xl border border-[hsl(var(--border))] p-4 flex flex-col gap-4"
            id="segmentation-upload-area"
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
                  <Layers size={18} className="text-[hsl(var(--primary))]" />
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

          {/* Segmentation Settings */}
          <div
            className="flex flex-col gap-5"
            id="segmentation-settings-form"
          >
            {/* Segmentation Method */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                Segmentation Method
              </label>
              <div className="relative">
                <select
                  value={segmentMethod}
                  onChange={(e) => setSegmentMethod(e.target.value)}
                  className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-2.5 pr-8 text-xs text-white focus:outline-none focus:border-[hsl(var(--primary))] cursor-pointer appearance-none"
                  id="segment-method-select"
                >
                  {SEGMENTATION_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label} — {m.desc}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] pointer-events-none"
                />
              </div>
              <div className="flex items-start gap-2 mt-0.5">
                <MethodIcon size={12} className="text-[hsl(var(--primary))] mt-0.5 flex-shrink-0" />
                <span className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                  {currentMethod?.desc}
                </span>
              </div>
            </div>

            {/* Max Parts Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                <span>Max Parts</span>
                <span className="text-[hsl(var(--primary))] tabular-nums">{maxParts}</span>
              </div>
              <input
                type="range"
                min={2}
                max={20}
                step={1}
                value={maxParts}
                onChange={(e) => setMaxParts(parseInt(e.target.value, 10))}
                className="w-full accent-[hsl(var(--primary))] cursor-pointer"
                id="max-parts-slider"
              />
              <div className="flex justify-between text-[9px] text-[hsl(var(--muted-foreground))] font-mono">
                <span>2</span>
                <span>20</span>
              </div>
            </div>

            {/* Toggles */}
            <div
              className="flex flex-col gap-4 pt-2 border-t border-[hsl(var(--border))]"
              id="segmentation-toggles"
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Preserve UVs</span>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">
                    Retain existing UV mapping data
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={preserveUvs}
                  onChange={(e) => setPreserveUvs(e.target.checked)}
                  className="accent-[hsl(var(--primary))] h-4 w-4 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">
                    Export Separated Parts
                  </span>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">
                    Output each part as individual mesh
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={exportSeparated}
                  onChange={(e) => setExportSeparated(e.target.checked)}
                  className="accent-[hsl(var(--primary))] h-4 w-4 cursor-pointer"
                />
              </div>
            </div>

            {/* Credit Cost Badge */}
            <div className="flex items-center justify-between bg-[hsl(var(--surface-2))] border border-[hsl(var(--surface-3))] rounded-lg px-4 py-3">
              <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono uppercase font-bold">
                Estimated Cost
              </span>
              <span className="text-xs font-bold text-[hsl(var(--primary))] flex items-center gap-1">
                <Sparkles size={12} className="text-[hsl(var(--primary))]" />
                40 Credits
              </span>
            </div>

            {/* Start Segmenting Button */}
            <button
              onClick={handleStartSegmenting}
              disabled={isProcessing}
              className="w-full mt-4 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] hover:brightness-110 active:scale-[0.98] text-black font-extrabold py-3.5 rounded-xl text-xs flex items-center justify-center gap-3 transition-all disabled:opacity-50 shadow-[0_4px_15px_rgba(245,166,35,0.2)]"
              id="trigger-segmentation-btn"
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-black" />
                  Segmenting...
                </>
              ) : (
                <>
                  <Play size={10} className="fill-black stroke-none" />
                  Start Segmenting
                </>
              )}
            </button>
          </div>
        </div>

        {/* Limitation Warnings */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-4 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-[hsl(var(--neon-amber))]" />
            <span className="text-[10px] font-bold text-[hsl(var(--neon-amber))] uppercase tracking-wider">
              Limitations
            </span>
          </div>
          <div className="flex items-start gap-2.5 text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">
            <X size={12} className="text-[hsl(var(--destructive))]/60 flex-shrink-0 mt-0.5" />
            <span>Unavailable for quad models</span>
          </div>
          <div className="flex items-start gap-2.5 text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">
            <X size={12} className="text-[hsl(var(--destructive))]/60 flex-shrink-0 mt-0.5" />
            <span>Unavailable for rigged models</span>
          </div>
        </div>
      </div>

      {/* Right Panel: Results Display */}
      <div
        className="flex-1 bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-6 flex flex-col gap-6 relative overflow-hidden"
        id="segmentation-right-stage"
      >
        {/* Processing Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/60 z-20 flex flex-col items-center justify-center text-center p-6 animate-speed-lines">
            <div className="w-24 h-24 rounded-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] animate-energy-pulse flex items-center justify-center text-black font-extrabold text-xs">
              <Layers size={36} className="animate-spin text-black stroke-[3]" />
            </div>
            <h3 className="text-lg font-black text-[hsl(var(--primary))] uppercase tracking-widest mt-6 animate-pulse">
              Segmenting Model...
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

        <div className="flex-1 flex flex-col justify-between z-10">
          {/* Header */}
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Box size={16} className="text-[hsl(var(--primary))]" />
              Segmentation Results
            </h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {isCompleted
                ? `${segmentedParts.length} parts detected. Inspect, toggle visibility, and export individual parts.`
                : 'Configure segmentation settings on the left, then click "Start Segmenting" to analyze the model.'}
            </p>
          </div>

          {/* Completed Results */}
          {isCompleted && segmentedParts.length > 0 ? (
            <div className="flex flex-col gap-5 animate-fadeIn">
              {/* Success banner */}
              <div className="flex items-center gap-3">
                <CheckCircle size={18} className="text-[hsl(var(--neon-green))]" />
                <span className="text-sm font-bold text-white uppercase tracking-wider">
                  Segmentation Complete!
                </span>
              </div>

              {/* Summary stats row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[hsl(var(--surface-2))] p-3 rounded-lg border border-[hsl(var(--border))]">
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                    Parts Found
                  </p>
                  <p className="text-xs font-bold text-[hsl(var(--primary))] mt-1 tabular-nums">
                    {segmentedParts.length}
                  </p>
                </div>
                <div className="bg-[hsl(var(--surface-2))] p-3 rounded-lg border border-[hsl(var(--border))]">
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                    Total Faces
                  </p>
                  <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] mt-1 tabular-nums">
                    {totalFaces.toLocaleString()}
                  </p>
                </div>
                <div className="bg-[hsl(var(--surface-2))] p-3 rounded-lg border border-[hsl(var(--border))]">
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                    Total Vertices
                  </p>
                  <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] mt-1 tabular-nums">
                    {totalVerts.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Parts Grid */}
              <div className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--surface-3))] rounded-xl p-5 max-h-[340px] overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                    Detected Parts
                  </span>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={selectAllParts}
                      className="text-[9px] text-[hsl(var(--primary))] hover:underline font-bold uppercase"
                    >
                      Select All
                    </button>
                    <button
                      onClick={deselectAllParts}
                      className="text-[9px] text-[hsl(var(--muted-foreground))] hover:text-white font-bold uppercase"
                    >
                      Deselect
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {segmentedParts.map((part) => (
                    <div
                      key={part.id}
                      className={
                        'bg-[hsl(var(--surface-1))] border rounded-xl p-3 flex items-start gap-3 transition-all cursor-pointer ' +
                        (part.selected
                          ? 'border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/[0.03]'
                          : 'border-[hsl(var(--border))] opacity-70 hover:opacity-100')
                      }
                      onClick={() => togglePartSelection(part.id)}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5 border border-white/10"
                        style={{ backgroundColor: part.color }}
                      />

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {part.name}
                        </p>
                        <div className="flex flex-col gap-0.5 mt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">
                              Faces:
                            </span>
                            <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono tabular-nums">
                              {part.faceCount.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">
                              Verts:
                            </span>
                            <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono tabular-nums">
                              {part.vertexCount.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">
                              Mat:
                            </span>
                            <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono truncate">
                              {part.material}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePartVisibility(part.id);
                        }}
                        className={
                          'flex-shrink-0 p-1 rounded transition-colors ' +
                          (part.visible
                            ? 'text-[hsl(var(--muted-foreground))] hover:text-white'
                            : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--muted-foreground))]')
                        }
                        aria-label={part.visible ? 'Hide part' : 'Show part'}
                      >
                        {part.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Export Buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportAll}
                  className="flex-1 bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 rounded-xl py-2.5 text-xs font-bold text-white flex items-center justify-center gap-2 transition-all"
                >
                  <Download size={13} className="text-[hsl(var(--primary))]" />
                  Export All Parts
                </button>
                <button
                  onClick={handleExportSelected}
                  disabled={selectedCount === 0}
                  className="flex-1 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 text-black font-extrabold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-[0_4px_15px_rgba(245,166,35,0.2)]"
                >
                  <Download size={13} className="stroke-[2.5]" />
                  Export Selected ({selectedCount})
                </button>
              </div>
            </div>
          ) : (
            /* Empty / Idle state */
            <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-[hsl(var(--border))] rounded-xl flex-1 my-6 bg-[hsl(var(--surface-2))]/40">
              <Layers
                size={36}
                className={
                  showWarnings
                    ? 'text-[hsl(var(--neon-amber))]/50 mb-3'
                    : 'text-[hsl(var(--border))] mb-3 animate-spin-slow'
                }
              />
              <h4 className="text-xs font-bold text-[hsl(var(--muted-foreground))]">
                {showWarnings
                  ? 'Processing Finished'
                  : 'Awaiting Segmentation Pipeline Trigger'}
              </h4>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] max-w-xs mt-1.5 leading-relaxed">
                {showWarnings
                  ? 'No parts were detected. Try adjusting the method or max parts count.'
                  : 'Upload a 3D model and configure segmentation options, then click "Start Segmenting" to analyze geometry and detect individual parts.'}
              </p>
            </div>
          )}

          {/* Bottom Info Notice */}
          <div className="bg-[hsl(var(--surface-2))] rounded-xl p-4 border border-[hsl(var(--primary))]/10 flex items-start gap-3">
            <Info size={15} className="text-[hsl(var(--primary))] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="text-[10px] font-bold text-[hsl(var(--primary))] uppercase tracking-wider">
                Part Segmentation Info
              </span>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1 leading-relaxed">
                Segmentation splits a monolithic mesh into logical sub-meshes.{' '}
                <strong className="text-white">Semantic</strong> uses AI to recognize
                body parts, <strong className="text-white">Geometric</strong>{' '}
                partitions by shape, and{' '}
                <strong className="text-white">Material</strong> splits by
                material groups. Results are exportable as separate GLB files.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
