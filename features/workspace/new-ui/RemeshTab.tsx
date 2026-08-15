"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import anime from 'animejs';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Play, Settings, AlertTriangle, CheckCircle, Cpu, ShieldCheck, Zap, Layers, Upload, X, Box } from 'lucide-react';
import { Shape3D } from '@/types/new-ui';
import { useProjectStore } from '@/stores/useProjectStore';
import { useWorkspaceModels } from '@/hooks/useBackendData';

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
    <div className="flex-1 flex flex-col lg:flex-row gap-0 bg-[hsl(var(--surface-0))] overflow-hidden" id="remesh-tab-panel">
      {/* Left Settings sidebar — Refined Studio layout */}
      <aside className="w-full lg:w-[360px] border-r border-[hsl(var(--border))] flex flex-col h-full bg-[hsl(var(--surface-1))] z-10" id="remesh-left-panel">
        
        {/* SECTION: TARGET ASSET */}
        <div className="p-6 border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] flex items-center justify-center shadow-lg shadow-[hsl(var(--primary))]/20">
              <RefreshCw size={18} className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-black uppercase tracking-tighter">Retopology Flow</span>
              <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase">Topology Optimization</span>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-8" id="remesh-target-box">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Target Asset</span>
          </div>

          <div className="flex flex-col gap-3">
{isUploadingModel ? (
  <div className="w-full flex flex-col items-center gap-2 py-4 bg-[hsl(var(--surface-2))] rounded-xl border border-[hsl(var(--border))]">
    <RefreshCw size={16} className="text-[hsl(var(--primary))] animate-spin" />
    <div className="w-full max-w-[80%] h-1 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
      <div className="h-full bg-[hsl(var(--primary))] transition-all duration-200" style={{ width: `${modelUploadProgress}%` }} />
    </div>
    <button
      onClick={() => {
        // TODO: Implement actual cancel functionality
        // For now, just reset state
        setIsUploadingModel(false);
        setModelUploadProgress(0);
        setStatusMessage('Upload cancelled');
      }}
      className="text-[8px] font-mono text-[hsl(var(--muted-foreground))]/50 hover:underline"
    >
      Cancel
    </button>
  </div>
) : uploadedModelUrl ? (
              <div className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--neon-green)/0.3)] rounded-xl p-3 flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-lg bg-[hsl(var(--neon-green))/0.1] flex items-center justify-center text-[hsl(var(--neon-green))]">
                  <Layers size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-[hsl(var(--foreground))] truncate">{uploadedModelName}</p>
                  <p className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tighter">Ready to Remesh</p>
                </div>
                <button 
                  onClick={() => { setUploadedModel(null); setUploadedModelUrl(null); setUploadedModelName(''); }} 
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
              id="remesh-upload-dropzone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-1.5 py-5 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center group ${
                isDragOver
                  ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                  : 'border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] hover:border-[hsl(var(--primary))]/50 hover:bg-[hsl(var(--surface-2))]'
              }`}
            >
              <Upload size={16} className="text-[hsl(var(--muted-foreground))] group-hover:scale-110 group-hover:text-[hsl(var(--primary))] transition-all" />
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-[hsl(var(--foreground))]">Import Custom Mesh</span>
                <span className="text-[8px] text-[hsl(var(--muted-foreground))] font-mono uppercase">GLB / GLTF Only</span>
              </div>
              <input type="file" accept=".glb,.gltf" onChange={handleModelUpload} className="hidden" />
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-6" id="remesh-pipeline-box">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Processing Pipeline</span>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Remesh Algorithm</label>
              <select
                value={effectiveModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={isLoadingModels}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl px-3 py-2.5 text-[11px] font-black text-[hsl(var(--foreground))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))] transition-all appearance-none disabled:opacity-60 shadow-sm"
              >
                {modelOptions.map((m) => (
                  <option key={m.id || 'default'} value={m.id}>
                    {m.label}{m.installed ? '' : ' (Not Installed)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Target Topology</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl px-3 py-2.5 text-[11px] font-black text-[hsl(var(--foreground))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))]"
              >
                <option value="quad-dominant">Quad-Dominant Flow</option>
                <option value="uniform-triangles">Uniform Triangulation</option>
                <option value="decimate">Fast Decimation</option>
                <option value="voronoi">Voronoi Concept</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Vertex Density</label>
              <select
                value={vertexDensity}
                onChange={(e) => setVertexDensity(e.target.value)}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl px-3 py-2.5 text-[11px] font-black text-[hsl(var(--foreground))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))]"
              >
                <option value="10K">10K Low-Poly (Mobile)</option>
                <option value="20K">20K Optimized (Game)</option>
                <option value="50K">50K Mid-Poly (CGI)</option>
                <option value="100K">100K High-Poly (Raw)</option>
              </select>
            </div>

            <div className="flex flex-col gap-3 pt-2 border-t border-[hsl(var(--border))/40]">
              {[
                { label: 'Preserve Symmetry', state: symmetry, setter: setSymmetry, desc: 'Sync mirror planes' },
                { label: 'Retain Hard Edges', state: keepBoundaries, setter: setKeepBoundaries, desc: 'Protect sharp splits' },
              ].map((t) => (
                <div key={t.label} className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-[hsl(var(--foreground))] uppercase">{t.label}</span>
                    <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase">{t.desc}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={t.state}
                    onChange={(e) => t.setter(e.target.checked)}
                    className="accent-[hsl(var(--primary))] h-4 w-4 cursor-pointer"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleRemesh}
              disabled={isProcessing}
              className="w-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] hover:brightness-110 active:scale-[0.98] text-[hsl(var(--surface-0))] font-black py-3 rounded-xl text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-[0_8px_20px_rgba(245,166,35,0.2)] mt-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Remeshing...
                </>
              ) : (
                <>
                  <Zap size={14} className="fill-current" />
                  Bake Topology
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Right Result Visualizer Stage — Full Studio Expansion */}
      <div className="flex-1 bg-[hsl(var(--surface-0))] flex flex-col relative overflow-hidden" id="remesh-right-stage">
        
        {/* Background Aura overlay during baking */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[hsl(var(--surface-0))/0.8] backdrop-blur-md z-30 flex flex-col items-center justify-center text-center p-12"
            >
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-[hsl(var(--primary))/0.1] border-t-[hsl(var(--primary))] animate-spin" />
                <RefreshCw size={32} className="absolute inset-0 m-auto text-[hsl(var(--primary))] animate-pulse" />
              </div>
              <h3 className="text-xl font-black text-[hsl(var(--foreground))] uppercase tracking-widest mt-8">Synthesizing Topology</h3>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tighter mt-1">{statusMessage}</p>
              
              <div className="w-48 h-1 bg-[hsl(var(--surface-3))] rounded-full mt-8 overflow-hidden">
                <div className="h-full bg-[hsl(var(--primary))] animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col p-8 z-10 overflow-y-auto">
          <div className="max-w-4xl w-full mx-auto flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]" />
                <h3 className="text-[11px] font-black text-[hsl(var(--foreground))] uppercase tracking-widest">
                  Topology Pipeline Diagnostics
                </h3>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] max-w-2xl leading-relaxed">
                Analyze and review isomorphic mesh distribution. The Studio engine automatically maps these baked attributes to the primary render stage.
              </p>
            </div>

            {/* Interactive display */}
            {successResult ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                <div className="col-span-full bg-[hsl(var(--surface-1))] border border-[hsl(var(--neon-green)/0.2)] rounded-2xl p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[hsl(var(--neon-green))/0.1] flex items-center justify-center text-[hsl(var(--neon-green))]">
                    <CheckCircle size={24} />
                  </div>
                  <div>
                    <span className="text-sm font-black text-[hsl(var(--foreground))] uppercase tracking-tight">Optimization Success</span>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono uppercase">Mesh retopologized with {successResult.reduction} reduction</p>
                  </div>
                </div>

                <div className="bg-[hsl(var(--surface-1))] p-6 rounded-2xl border border-[hsl(var(--border))] flex flex-col gap-4">
                  <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-widest border-b border-[hsl(var(--border))] pb-2">Mesh Statistics</span>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono">Input Density</span>
                      <span className="text-xs font-bold text-[hsl(var(--foreground))]">{successResult.oldVertices}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono text-[hsl(var(--neon-green))]">Optimized Density</span>
                      <span className="text-xs font-bold text-[hsl(var(--neon-green))]">{successResult.newVertices}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[hsl(var(--surface-1))] p-6 rounded-2xl border border-[hsl(var(--border))] flex flex-col gap-4">
                  <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-widest border-b border-[hsl(var(--border))] pb-2">Analysis AI</span>
                  <p className="text-[11px] text-[hsl(var(--foreground))] leading-relaxed">
                    {successResult.promptDescription}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-[400px] flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-[hsl(var(--border))] rounded-3xl bg-[hsl(var(--surface-1))]/50">
                <div className="w-20 h-20 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center text-[hsl(var(--border))] mb-6">
                  <Settings size={40} className="animate-spin-slow opacity-20" />
                </div>
                <h4 className="text-sm font-black text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Awaiting Stage Trigger</h4>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] max-w-sm mt-2 leading-relaxed uppercase font-bold tracking-tighter">
                  Select a model source and click &quot;Bake Topology&quot; to initiate the Studio retopology pipeline.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Engine Notice Footer */}
        <div className="mt-auto p-6 bg-[hsl(var(--surface-1))] border-t border-[hsl(var(--border))]">
          <div className="max-w-4xl mx-auto flex items-start gap-4">
            <AlertTriangle size={18} className="text-[hsl(var(--neon-amber))] flex-shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-[hsl(var(--neon-amber))] uppercase tracking-widest">Studio Engine Notice</span>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed uppercase font-bold tracking-tighter">
                Retopology updates are destructive to the local vertex buffer but persistent in the Studio stage. Always export original primitives before committing heavy decimation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
