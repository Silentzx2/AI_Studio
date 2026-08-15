"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import anime from 'animejs';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Play, Settings, AlertTriangle, CheckCircle, Cpu, ShieldCheck, Zap, Layers, Upload, X, Box, Info, Sparkles } from 'lucide-react';
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
}

// Offline fallback: used only when the workspace-models endpoint is unreachable
const LOCAL_MODELS: { id: string; label: string; installed: boolean }[] = [
  { id: '', label: 'Default remesh pipeline', installed: true },
];

export default function RemeshTab({ activeModel, onUpdateModel, onNavigate }: RemeshTabProps) {
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

  // Models compatible with the remesh workspace
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
    }));
  }, [workspaceModels, modelsError]);

  // Keep the selection valid for the current (filtered) option list
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
      const { promise } = uploadService.uploadWithProgress(file, (progress) => {
        setModelUploadProgress(progress.percent);
      }, '/api/v1/upload/model');
      const { url } = await promise;
      setUploadedModel(file);
      setUploadedModelName(file.name);
      setUploadedModelUrl(url);
      setStatusMessage(null);
      setSuccessResult(null);
      
      // Load model into viewer
      window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url } }));

      // AnimeJS animation for successful load
      anime({
        targets: '#remesh-upload-area',
        scale: [1.02, 1],
        boxShadow: ['0 0 20px hsl(var(--primary)/0.5)', '0 0 0px hsl(var(--primary)/0)'],
        duration: 800,
        easing: 'easeOutElastic(1, .8)'
      });

    } catch (err: any) {
      setStatusMessage(`Upload failed: ${err.message}`);
    } finally {
      setIsUploadingModel(false);
      setModelUploadProgress(0);
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

    // If user uploaded a model, it is already uploaded via handleModelUpload
    let modelUrl = uploadedModelUrl;

    setIsProcessing(true);
    setStatusMessage('Submitting remesh job...');
    setSuccessResult(null);

    try {
      const payload: any = {
        prompt: `Remesh model with ${targetType} topology, ${vertexDensity} vertex density`,
        mode: 'remesh',
        quality: 'standard',
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

  return (
    <TooltipProvider delayDuration={400}>
    <div className="flex-1 flex flex-col lg:flex-row gap-0 bg-black overflow-hidden" id="remesh-tab-panel">
      {/* Left Settings sidebar — Refined Studio layout */}
      <aside className="w-full lg:w-[400px] border-r border-white/5 flex flex-col h-full bg-black z-10" id="remesh-left-panel">
        
        {/* SECTION: TARGET ASSET */}
        <div className="p-8 border-b border-white/[0.03] bg-white/[0.01]">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
              <RefreshCw size={20} className="text-amber-500" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-black uppercase tracking-[-0.01em] text-white">Retopology Flow</span>
              <span className="text-[9px] text-white/30 font-black uppercase tracking-[0.2em]">Topology Optimization</span>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-8 space-y-10 scrollbar-thin" id="remesh-target-box">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Target Asset Manifest</span>
          </div>

          <div className="flex flex-col gap-4">
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
                        <Layers size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black text-white truncate uppercase tracking-widest">{uploadedModelName}</p>
                        <p className="text-[9px] text-white/30 font-black uppercase tracking-[0.15em] mt-0.5">Ready for Synthesis</p>
                      </div>
                      <button 
                        onClick={() => { setUploadedModel(null); setUploadedModelUrl(null); setUploadedModelName(''); }} 
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
                <p>Target asset being remeshed</p>
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <label
                  id="remesh-upload-dropzone"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "flex flex-col items-center justify-center gap-3 py-10 rounded-3xl border-2 border-dashed transition-all cursor-pointer text-center group",
                    isDragOver
                      ? 'border-amber-500 bg-amber-500/5'
                      : 'border-white/5 bg-white/[0.01] hover:border-amber-500/30 hover:bg-white/[0.03]'
                  )}
                >
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.02] flex items-center justify-center mb-1 group-hover:scale-110 group-hover:bg-amber-500/10 transition-all">
                    <Upload size={20} className="text-white/20 group-hover:text-amber-500 transition-all" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-black text-white uppercase tracking-widest">Import Custom Mesh</span>
                    <span className="text-[8px] text-white/20 font-black uppercase tracking-[0.2em]">GLB / GLTF Only</span>
                  </div>
                  <input type="file" accept=".glb,.gltf" onChange={handleModelUpload} className="hidden" />
                </label>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Import an external GLB/GLTF mesh for retopology</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex flex-col gap-8" id="remesh-pipeline-box">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Synthesis Configuration</span>
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Neural Algorithm</label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info size={12} className="text-white/20" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[200px]">
                      <p className="text-[10px]">Select the AI model responsible for the retopology calculation.</p>
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

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Target Topology</label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info size={12} className="text-white/20" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[200px]">
                      <p className="text-[10px]"><strong>Quad-Dominant</strong>: Best for animation and sculpting.<br/><strong>Uniform</strong>: Best for simulations.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3.5 text-[11px] font-black text-white/80 cursor-pointer focus:outline-none focus:border-amber-500/30 transition-all appearance-none uppercase tracking-widest"
                >
                  <option value="quad-dominant" className="bg-black text-white">Quad-Dominant Flow</option>
                  <option value="uniform-triangles" className="bg-black text-white">Uniform Triangulation</option>
                  <option value="decimate" className="bg-black text-white">Fast Decimation</option>
                  <option value="voronoi" className="bg-black text-white">Voronoi Concept</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Vertex Resolution</label>
                <select
                  value={vertexDensity}
                  onChange={(e) => setVertexDensity(e.target.value)}
                  className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3.5 text-[11px] font-black text-white/80 cursor-pointer focus:outline-none focus:border-amber-500/30 transition-all appearance-none uppercase tracking-widest"
                >
                  <option value="10K" className="bg-black text-white">10K Low-Poly (Mobile)</option>
                  <option value="20K" className="bg-black text-white">20K Optimized (Game)</option>
                  <option value="50K" className="bg-black text-white">50K Mid-Poly (CGI)</option>
                  <option value="100K" className="bg-black text-white">100K High-Poly (Raw)</option>
                </select>
              </div>

              <div className="flex flex-col gap-4 pt-4 border-t border-white/[0.03]">
                {[
                  { label: 'Preserve Symmetry', state: symmetry, setter: setSymmetry, desc: 'Sync mirror planes' },
                  { label: 'Retain Hard Edges', state: keepBoundaries, setter: setKeepBoundaries, desc: 'Protect sharp splits' },
                ].map((t) => (
                  <div key={t.label} className="flex items-center justify-between group">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-white/70 uppercase tracking-widest group-hover:text-white transition-colors">{t.label}</span>
                      <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.1em]">{t.desc}</span>
                    </div>
                    <button 
                      onClick={() => t.setter(!t.state)}
                      className={cn(
                        "w-10 h-5 rounded-full relative transition-all duration-500",
                        t.state ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-white/10'
                      )}
                    >
                      <motion.div 
                        animate={{ x: t.state ? 22 : 2 }}
                        className="absolute top-1 left-0 w-3 h-3 rounded-full bg-white shadow-sm"
                      />
                    </button>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleRemesh}
                disabled={isProcessing}
                variant="premium"
                className="w-full h-14 rounded-2xl text-[11px] mt-4"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    Synthesizing Topology...
                  </>
                ) : (
                  <>
                    <Zap size={18} className="fill-current" />
                    Bake Neural Topology
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Right Result Visualizer Stage — Full Studio Expansion */}
      <div className="flex-1 bg-[#050505] flex flex-col relative overflow-hidden" id="remesh-right-stage">
        
        {/* Background Aura overlay during baking */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl z-30 flex flex-col items-center justify-center text-center p-12"
            >
              <div className="relative">
                <div className="w-32 h-32 rounded-full border-4 border-white/5 border-t-amber-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw size={32} className="text-amber-500 animate-pulse" />
                </div>
              </div>
              <h3 className="text-2xl font-black text-white uppercase tracking-[0.2em] mt-10">Reconstructing Topology</h3>
              <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.3em] mt-3">{statusMessage}</p>
              
              <div className="w-60 h-1.5 bg-white/5 rounded-full mt-12 overflow-hidden border border-white/5">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 15, repeat: Infinity }}
                  className="h-full bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]" 
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col p-12 z-10 overflow-y-auto scrollbar-thin">
          <div className="max-w-5xl w-full mx-auto flex flex-col gap-12">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                <h3 className="text-[12px] font-black text-white/80 uppercase tracking-[0.3em]">
                  Topology Pipeline Output
                </h3>
              </div>
              <p className="text-[11px] text-white/30 font-black uppercase tracking-[0.1em] max-w-2xl leading-relaxed">
                Analyze and review isomorphic mesh distribution. The Studio engine automatically maps these baked attributes to the primary render stage.
              </p>
            </motion.div>

            {/* Interactive display */}
            {successResult ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="col-span-full bg-white/[0.02] border border-emerald-500/20 rounded-3xl p-10 flex items-center gap-6 shadow-2xl"
                >
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shadow-inner">
                    <CheckCircle size={32} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-lg font-black text-white uppercase tracking-tight">Optimization Synchronized</span>
                    <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">Mesh retopologized with {successResult.reduction} reduction</p>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white/[0.02] p-10 rounded-3xl border border-white/5 flex flex-col gap-8 shadow-2xl"
                >
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] border-b border-white/5 pb-4">Mesh Statistics</span>
                  <div className="space-y-6">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Input Density</span>
                      <span className="text-sm font-black text-white/80 tabular-nums">{successResult.oldVertices}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] text-emerald-500/60 font-black uppercase tracking-widest">Optimized Density</span>
                      <span className="text-sm font-black text-emerald-500 tabular-nums">{successResult.newVertices}</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: '100%' }}
                        animate={{ width: '40%' }}
                        className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                      />
                    </div>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white/[0.02] p-10 rounded-3xl border border-white/5 flex flex-col gap-8 shadow-2xl"
                >
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] border-b border-white/5 pb-4">Synthesis Context</span>
                  <div className="flex flex-col gap-4">
                    <p className="text-[11px] text-white/60 font-black uppercase tracking-[0.1em] leading-relaxed italic">
                      &quot;{successResult.promptDescription}&quot;
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="px-3 py-1 rounded-xl bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-widest text-white/30">Neural v2.5</div>
                      <div className="px-3 py-1 rounded-xl bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-widest text-white/30">H100 Optimized</div>
                    </div>
                  </div>
                </motion.div>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 min-h-[500px] flex flex-col items-center justify-center text-center p-20 border-2 border-dashed border-white/5 rounded-[40px] bg-white/[0.01] group hover:bg-white/[0.02] transition-colors duration-700"
              >
                <div className="w-24 h-24 rounded-3xl bg-white/[0.02] flex items-center justify-center text-white/5 mb-8 border border-white/5 group-hover:scale-110 group-hover:border-amber-500/20 group-hover:text-amber-500/20 transition-all duration-700">
                  <Settings size={48} className="animate-spin-slow" />
                </div>
                <h4 className="text-sm font-black text-white/40 uppercase tracking-[0.4em]">Awaiting Synthesis Trigger</h4>
                <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.2em] mt-5 max-w-sm leading-relaxed">
                  Select a model source and click &quot;Bake Topology&quot; to initiate the Studio retopology pipeline.
                </p>
                <div className="mt-12 flex items-center gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                  <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                  <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Engine Notice Footer */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-auto p-10 bg-black border-t border-white/[0.03]"
        >
          <div className="max-w-5xl mx-auto flex items-start gap-6">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/5 flex items-center justify-center border border-amber-500/10 shrink-0">
              <AlertTriangle size={20} className="text-amber-500" />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-black text-amber-500 uppercase tracking-[0.3em]">Studio Engine Notice</span>
              <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.15em] leading-relaxed max-w-3xl">
                Retopology updates are destructive to the local vertex buffer but persistent in the Studio stage. Always export original primitives before committing heavy decimation.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
    </TooltipProvider>
  );
}
