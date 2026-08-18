"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import anime from 'animejs';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Upload, X, ChevronDown, CheckCircle, Zap, Layers, Box, Settings } from 'lucide-react';
import { Shape3D } from '@/types/new-ui';
import { useProjectStore } from '@/stores/useProjectStore';
import { useWorkspaceModels } from '@/hooks/useBackendData';
import { loadModelInViewer } from '@/stores/useViewerStore';
import { cn } from '@/lib/utils';
import AssetPanelHost from '@/features/workspace/AssetPanelHost';

interface RemeshTabProps {
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

const LOCAL_MODELS: { id: string; label: string; installed: boolean; low_vram_supported: boolean; low_vram_required_mb: number }[] = [
  { id: '', label: 'Default remesh pipeline', installed: true, low_vram_supported: false, low_vram_required_mb: 0 },
];

export default function RemeshTab({ activeModel, onUpdateModel, onNavigate, controlsOnly }: RemeshTabProps & { controlsOnly?: boolean }) {
  const { addLayer, currentProject } = useProjectStore();
  const [targetType, setTargetType] = useState('quad-dominant');
  const [vertexDensity, setVertexDensity] = useState('20K');
  const [symmetry, setSymmetry] = useState(true);
  const [keepBoundaries, setKeepBoundaries] = useState(true);
  const [uploadedModel, setUploadedModel] = useState<File | null>(null);
  const [uploadedModelUrl, setUploadedModelUrl] = useState<string | null>(null);
  const [uploadedModelName, setUploadedModelName] = useState<string>('');
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [modelUploadProgress, setModelUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any>(null);
  const [lowVram, setLowVram] = useState(false);
  const cancelUploadRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    anime({
      targets: '#remesh-left-panel > div',
      opacity: [0, 1],
      translateX: [-20, 0],
      delay: anime.stagger(60),
      easing: 'easeOutQuad',
      duration: 500
    });
    anime({
      targets: '#remesh-right-stage',
      opacity: [0, 1],
      scale: [0.98, 1],
      easing: 'easeOutQuad',
      duration: 600
    });
  }, []);

  const {
    models: workspaceModels,
    loading: isLoadingModels,
    error: modelsError,
  } = useWorkspaceModels('remesh');
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

  const selectedModel =
    modelOptions.find((m) => m.id === selectedModelId) ||
    modelOptions.find((m) => m.installed) ||
    modelOptions[0];
  const effectiveModelId = selectedModel?.id ?? '';

  const handleModelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(glb|gltf)$/i)) {
      setStatusMessage('Please upload a .glb or .gltf file');
      return;
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
      setUploadedModelUrl(url);
      setStatusMessage(null);
      setSuccessResult(null);
      cancelUploadRef.current = null;

      loadModelInViewer(url, file.name);

      anime({
        targets: '#remesh-upload-area',
        scale: [1.02, 1],
        boxShadow: ['0 0 20px hsl(var(--primary)/0.5)', '0 0 0px hsl(var(--primary)/0)'],
        duration: 800,
        easing: 'easeOutElastic(1, .8)'
      });

    } catch (err: any) {
      if (err.message !== 'Upload cancelled') {
        setStatusMessage(`Upload failed: ${err.message}`);
      }
    } finally {
      setIsUploadingModel(false);
      setModelUploadProgress(0);
      cancelUploadRef.current = null;
    }
  };

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) {
      setIsDragOver(true);
      anime({
        targets: '#remesh-upload-dropzone',
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
      targets: '#remesh-upload-dropzone',
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
      targets: '#remesh-upload-dropzone',
      scale: 1,
      boxShadow: '0 0 0px hsl(var(--primary)/0)',
      duration: 300,
      easing: 'easeOutQuad'
    });
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleModelUpload({ target: { files: [file] } } as any);
    }
  };

  const handleRemesh = async () => {
    if (isProcessing) return;

    let modelUrl = uploadedModelUrl;

    setIsProcessing(true);
    setStatusMessage('Submitting remesh job...');
    setSuccessResult(null);

    try {
      const payload: any = {
        prompt: `Remesh model with ${targetType} topology, ${vertexDensity} vertex density`,
        mode: 'remesh',
        quality: 'standard',
        low_vram: lowVram,
        workspace: 'remesh',
      };
      if (effectiveModelId) {
        payload.provider = effectiveModelId;
      }
      if (modelUrl) {
        payload.reference_image_url = modelUrl;
        payload.mode = 'remesh';
      }

      const response = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok && data.data?.job_id) {
        setStatusMessage(`Job submitted (ID: ${data.data?.job_id}). Processing...`);
        const jobId = data.data?.job_id;
        const poll = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/v1/generation/${jobId}/status`);
            const statusData = await statusRes.json();
             if (statusData.data?.status === 'completed') {
                clearInterval(poll);
                const res = statusData.data?.result || {};
                const inputVerts = res.vertex_count ?? res.polygon_count ?? null;
                const optimized = inputVerts
                  ? `~${Math.round(inputVerts)} Vertices`
                  : `~${vertexDensity} Quads`;
                setSuccessResult({
                  name: `${activeModel.name} (Remeshed)`,
                  complexity: `${vertexDensity} Optimized Quad-Mesh`,
                  promptDescription: `Remeshed with ${targetType} topology.`,
                  oldVertices: inputVerts ? `${inputVerts}` : 'Original',
                  newVertices: optimized,
                  reduction: 'Optimized',
                });
               addLayer({
                 id: `remesh-${Date.now()}`,
                 type: 'remesh',
                 name: `Remesh (${vertexDensity})`,
                 enabled: true,
                 visible: true,
                 data: {
                   targetType,
                   vertexDensity,
                   symmetry,
                   keepBoundaries,
                   model: effectiveModelId,
                   oldVertices: inputVerts ? `${inputVerts}` : 'Original',
                   newVertices: optimized,
                   reduction: 'Optimized',
                 },
                 sourceTab: 'Remesh',
                 timestamp: new Date(),
               });
                setIsProcessing(false);
            } else if (statusData.data?.status === 'failed') {
              clearInterval(poll);
              setStatusMessage(`Remesh failed: ${statusData.data?.error_message || 'Unknown error'}`);
              setIsProcessing(false);
            } else {
              setStatusMessage(statusData.data?.stage || 'Processing...');
            }
          } catch {
            clearInterval(poll);
            setIsProcessing(false);
          }
        }, 2000);
      } else {
        const errMsg = data.detail || data.error || 'Backend returned an error.';
        setStatusMessage(`Error: ${errMsg}`);
        setIsProcessing(false);
      }
    } catch (err: any) {
      setStatusMessage('Cannot connect to backend. Ensure the API server is running.');
      setIsProcessing(false);
    }
  };

  const leftPanel = (
    <aside className="w-full lg:w-72 xl:w-80 border-r border-tripo-white-5 flex flex-col h-full bg-tripo-gray-2 z-10" id="remesh-left-panel">
      <div className="px-3 py-2 border-b border-tripo-white-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-tripo-yellow-1/10 flex items-center justify-center">
            <RefreshCw size={13} className="text-tripo-yellow-1" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-white">Retopology Flow</span>
            <span className="text-[10px] text-tripo-gray-400">Mesh Optimization</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 scrollbar-thin" id="remesh-target-box">
        <div className="flex flex-col gap-2.5">
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
                <Layers size={12} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{uploadedModelName}</p>
                <p className="text-[10px] text-emerald-400 font-medium">Ready to Remesh</p>
              </div>
              <button
                onClick={() => { setUploadedModel(null); setUploadedModelUrl(null); setUploadedModelName(''); }}
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
            id="remesh-upload-dropzone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-1 py-3.5 rounded-lg border border-dashed transition-all cursor-pointer text-center group ${
              isDragOver
                ? 'border-tripo-yellow-1 bg-tripo-yellow-1/5'
                : 'border-tripo-white-10 bg-tripo-gray-3 hover:border-tripo-yellow-1/50 hover:bg-tripo-gray-3/80'
            }`}
          >
            <Upload size={14} className="text-tripo-gray-400 group-hover:scale-110 group-hover:text-tripo-yellow-1 transition-all" />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-tripo-gray-200">Import Custom Mesh</span>
              <span className="text-[10px] text-tripo-gray-500">GLB / GLTF Only</span>
            </div>
            <input type="file" accept=".glb,.gltf" onChange={handleModelUpload} className="hidden" />
          </label>
        </div>

        <div className="flex flex-col gap-2.5 pt-2 border-t border-tripo-white-5" id="remesh-pipeline-box">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-tripo-gray-300">Remesh Algorithm</label>
            <select
              value={effectiveModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              disabled={isLoadingModels}
              className="w-full bg-tripo-gray-3 border border-tripo-white-5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-tripo-gray-200 cursor-pointer focus:outline-none focus:border-tripo-yellow-1 transition-all appearance-none disabled:opacity-60"
            >
              {modelOptions.map((m) => (
                <option key={m.id || 'default'} value={m.id}>
                  {m.label}{m.installed ? '' : ' (Not Installed)'}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-tripo-gray-400">Topology Type</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full bg-tripo-gray-3 border border-tripo-white-5 rounded-lg px-2 py-1 text-xs font-medium text-tripo-gray-200 cursor-pointer focus:outline-none focus:border-tripo-yellow-1"
              >
                <option value="quad-dominant">Quad-Dominant</option>
                <option value="uniform-triangles">Triangles</option>
                <option value="decimate">Decimate</option>
                <option value="voronoi">Voronoi</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-tripo-gray-400">Target Density</label>
              <select
                value={vertexDensity}
                onChange={(e) => setVertexDensity(e.target.value)}
                className="w-full bg-tripo-gray-3 border border-tripo-white-5 rounded-lg px-2 py-1 text-xs font-medium text-tripo-gray-200 cursor-pointer focus:outline-none focus:border-tripo-yellow-1"
              >
                <option value="10K">10K (Mobile)</option>
                <option value="20K">20K (Game)</option>
                <option value="50K">50K (CGI)</option>
                <option value="100K">100K (Raw)</option>
              </select>
            </div>
          </div>

          {effectiveModelId && (modelOptions.find((m) => m.id === effectiveModelId)?.low_vram_supported) && (
            <div className="flex items-center justify-between bg-tripo-gray-3 border border-tripo-white-5 rounded-lg px-2.5 py-1.5">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-tripo-gray-300">Low VRAM Mode</span>
                <span className="text-[9.5px] text-tripo-gray-500">
                  ~{((modelOptions.find((m) => m.id === effectiveModelId)?.low_vram_required_mb || 0) / 1024).toFixed(1)} GB min
                </span>
              </div>
              <button
                onClick={() => setLowVram(!lowVram)}
                className={cn(
                  'w-7 h-3.5 rounded-full transition-all relative cursor-pointer',
                  lowVram ? 'bg-tripo-yellow-1' : 'bg-tripo-gray-4',
                )}
              >
                <div className={cn('absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all', lowVram ? 'left-4' : 'left-0.5')} />
              </button>
            </div>
          )}

          <div className="flex flex-col gap-1.5 pt-1 border-t border-tripo-white-5">
            {[
              { label: 'Preserve Symmetry', state: symmetry, setter: setSymmetry, desc: 'Sync mirror planes' },
              { label: 'Retain Hard Edges', state: keepBoundaries, setter: setKeepBoundaries, desc: 'Protect sharp splits' },
            ].map((t) => (
              <label key={t.label} className="flex items-center justify-between cursor-pointer">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-tripo-gray-200">{t.label}</span>
                  <span className="text-[9.5px] text-tripo-gray-400">{t.desc}</span>
                </div>
                <input
                  type="checkbox"
                  checked={t.state}
                  onChange={(e) => t.setter(e.target.checked)}
                  className="accent-tripo-yellow-1 h-3.5 w-3.5 cursor-pointer rounded"
                />
              </label>
            ))}
          </div>

          <button
            onClick={handleRemesh}
            disabled={isProcessing}
            className="w-full bg-tripo-yellow-1 hover:bg-yellow-400 text-black font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 cursor-pointer mt-1"
          >
            {isProcessing ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                Remeshing...
              </>
            ) : (
              <>
                <Zap size={13} className="fill-current" />
                Bake Topology
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );

  if (controlsOnly) {
    return leftPanel;
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-0 bg-tripo-gray-3 overflow-hidden" id="remesh-tab-panel">
      {leftPanel}

      <div className="flex-1 bg-tripo-gray-3 flex flex-col relative overflow-hidden" id="remesh-right-stage">
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-tripo-gray-3/80 backdrop-blur-md z-30 flex flex-col items-center justify-center text-center p-12"
            >
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-tripo-white-5 border-t-tripo-yellow-1 animate-spin" />
                <RefreshCw size={32} className="absolute inset-0 m-auto text-tripo-yellow-1 animate-pulse" />
              </div>
              <h3 className="text-xl font-black text-tripo-gray-100 uppercase tracking-widest mt-8">Synthesizing Topology</h3>
              <p className="text-3 text-tripo-gray-300 font-mono uppercase tracking-tighter mt-1">{statusMessage}</p>

              <div className="w-48 h-1 bg-tripo-gray-4 rounded-full mt-8 overflow-hidden">
                <div className="h-full bg-tripo-yellow-1 animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col p-5 z-10 overflow-y-auto">
          <div className="max-w-4xl w-full mx-auto flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-tripo-yellow-1" />
                <h3 className="text-3 font-medium text-tripo-gray-300 uppercase tracking-widest">
                  Topology Pipeline Diagnostics
                </h3>
              </div>
              <p className="text-3 text-tripo-gray-300 max-w-2xl leading-relaxed">
                Analyze and review isomorphic mesh distribution. The Studio engine automatically maps these baked attributes to the primary render stage.
              </p>
            </div>

            {successResult ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                <div className="col-span-full bg-tripo-gray-4 border border-tripo-white-5 rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-tripo-yellow-1/10 flex items-center justify-center text-tripo-gray-300">
                    <CheckCircle size={24} />
                  </div>
                  <div>
                    <span className="text-3.5 font-black text-tripo-gray-100 uppercase tracking-tight">Optimization Success</span>
                    <p className="text-2.5 text-tripo-gray-300">Mesh retopologized with {successResult.reduction} reduction</p>
                  </div>
                </div>

                <div className="bg-tripo-gray-4 p-4 rounded-xl border border-tripo-white-5 flex flex-col gap-4">
                  <span className="text-2.5 font-bold text-tripo-gray-300 uppercase tracking-widest border-b border-tripo-white-5 pb-2">Mesh Statistics</span>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <span className="text-2.5 text-tripo-gray-300 uppercase">Input Density</span>
                      <span className="text-3 font-bold text-tripo-gray-100">{successResult.oldVertices}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-2.5 text-tripo-gray-300 uppercase">Optimized Density</span>
                      <span className="text-3 font-bold text-tripo-gray-300">{successResult.newVertices}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-tripo-gray-4 p-4 rounded-xl border border-tripo-white-5 flex flex-col gap-4">
                  <span className="text-2.5 font-bold text-tripo-gray-300 uppercase tracking-widest border-b border-tripo-white-5 pb-2">Analysis AI</span>
                  <p className="text-3 text-tripo-gray-100 leading-relaxed">
                    {successResult.promptDescription}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-[400px] flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-tripo-white-5 rounded-3xl bg-tripo-gray-4/50">
                <div className="w-20 h-20 rounded-full bg-tripo-gray-4 flex items-center justify-center text-tripo-white-5 mb-6">
                  <Settings size={40} className="animate-spin-slow opacity-20" />
                </div>
                <h4 className="text-3 font-medium text-tripo-gray-300 uppercase tracking-wider">Awaiting Stage Trigger</h4>
                <p className="text-2.5 text-tripo-gray-300 max-w-sm mt-2 leading-relaxed">
                  Select a model source and click "Bake Topology" to initiate the Studio retopology pipeline.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto p-6 bg-tripo-gray-4 border-t border-tripo-white-5">
          <div className="max-w-4xl mx-auto flex items-start gap-4">
            <div className="w-5 h-5 rounded-full bg-tripo-yellow-1/10 flex items-center justify-center text-tripo-yellow-1 flex-shrink-0 mt-0.5">
              <span className="text-2.5 font-bold">i</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2.5 font-bold text-tripo-gray-300 uppercase tracking-widest">Studio Engine Notice</span>
              <p className="text-2.5 text-tripo-gray-300 leading-relaxed">
                Retopology updates are destructive to the local vertex buffer but persistent in the Studio stage. Always export original primitives before committing heavy decimation.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex w-62 flex-col h-full bg-tripo-gray-3 border-l border-tripo-white-5 rounded-l-5 shadow-[0px_1px_10px_0px] shadow-black/40 relative z-10">
        <AssetPanelHost />
      </div>
    </div>
  );
}
