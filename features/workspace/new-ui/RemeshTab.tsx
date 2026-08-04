"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { RefreshCw, Play, Settings, AlertTriangle, CheckCircle, Cpu, ShieldCheck, Zap, Layers, Upload, X } from 'lucide-react';
import { Shape3D } from '@/types/new-ui';

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

export default function RemeshTab({ activeModel, onUpdateModel, onNavigate }: RemeshTabProps) {
  const [targetType, setTargetType] = useState('quad-dominant');
  const [vertexDensity, setVertexDensity] = useState('20K');
  const [symmetry, setSymmetry] = useState(true);
  const [keepBoundaries, setKeepBoundaries] = useState(true);
  const [uploadedModel, setUploadedModel] = useState<File | null>(null);
  const [uploadedModelUrl, setUploadedModelUrl] = useState<string | null>(null);
  const [uploadedModelName, setUploadedModelName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any>(null);

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(glb|gltf)$/i)) {
      setStatusMessage('Please upload a .glb or .gltf file');
      return;
    }
    setUploadedModel(file);
    setUploadedModelName(file.name);
    const url = URL.createObjectURL(file);
    setUploadedModelUrl(url);
    setStatusMessage(null);
    setSuccessResult(null);
  };

  const handleRemesh = async () => {
    if (isProcessing) return;

    // If user uploaded a model, upload it first
    let modelUrl = uploadedModelUrl;
    if (uploadedModel && !modelUrl) {
      setIsProcessing(true);
      setStatusMessage('Uploading model...');
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
        if (!modelUrl) throw new Error('No URL returned');
      } catch (err: any) {
        setStatusMessage(`Upload failed: ${err.message}`);
        setIsProcessing(false);
        return;
      }
    }

    setIsProcessing(true);
    setStatusMessage('Submitting remesh job...');
    setSuccessResult(null);

    try {
      const payload: any = {
        prompt: `Remesh model with ${targetType} topology, ${vertexDensity} vertex density`,
        mode: 'remesh',
        quality: 'standard',
      };
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
              setSuccessResult({
                name: `${activeModel.name} (Remeshed)`,
                complexity: `${vertexDensity} Optimized Quad-Mesh`,
                promptDescription: `Remeshed with ${targetType} topology.`,
                oldVertices: 'Original',
                newVertices: `~${vertexDensity} Quads`,
                reduction: 'Optimized',
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
    <div className="flex-1 p-6 flex flex-col lg:flex-row gap-6 animate-fadeIn text-[hsl(var(--foreground))]" id="remesh-tab-panel">
      
      {/* Left Input Configuration Panel */}
      <div className="w-full lg:w-[380px] flex flex-col gap-5 flex-shrink-0" id="remesh-left-panel">
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-5 flex flex-col gap-5" id="remesh-inputs-box">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <RefreshCw size={20} className="text-[hsl(var(--primary))]" />
              Remesh & Decimate
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Optimize active 3D topology and convert messy high-poly geometries to pristine game-ready assets.
            </p>
          </div>

          {/* Model Upload / Active Target */}
          <div className="bg-[hsl(var(--surface-2))] rounded-xl border border-[hsl(var(--border))] p-4 flex flex-col gap-3" id="remesh-upload-area">
            <span className="text-[9px] font-bold text-[hsl(var(--primary))] uppercase tracking-wider">Target Model</span>
            
            {uploadedModelUrl ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-gradient-to-tr from-[hsl(var(--primary))]/20 to-transparent flex items-center justify-center border border-[hsl(var(--primary))]/10">
                  <Layers size={18} className="text-[hsl(var(--primary))]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{uploadedModelName}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate font-mono">{((uploadedModel?.size ?? 0) / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={() => { setUploadedModel(null); setUploadedModelUrl(null); setUploadedModelName(''); }} className="text-[hsl(var(--muted-foreground))] hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-gradient-to-tr from-[hsl(var(--primary))]/20 to-transparent flex items-center justify-center border border-[hsl(var(--primary))]/10">
                  <Layers size={18} className="text-[hsl(var(--primary))]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{activeModel.name}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate font-mono">{activeModel.complexity}</p>
                </div>
              </div>
            )}
            
            <label className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 cursor-pointer transition-colors text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]">
              <Upload size={14} />
              <span>Upload GLB/GLTF Model</span>
              <input type="file" accept=".glb,.gltf" onChange={handleModelUpload} className="hidden" />
            </label>
          </div>

          <div className="flex flex-col gap-4" id="remesh-settings-form">
            {/* Target Topology Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Topology Algorithm</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[hsl(var(--primary))] cursor-pointer"
                id="re-topology-select"
              >
                <option value="quad-dominant">Quad-Dominant Flow (Subdivision Friendly)</option>
                <option value="uniform-triangles">Uniform Triangulation (Sculpt Ready)</option>
                <option value="decimate">Fast Decimation (Polygon Reduction)</option>
                <option value="voronoi">Voronoi Dual-Mesh (Stylized Concept)</option>
              </select>
            </div>

            {/* Target Vertex Count */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Target Density</label>
              <select
                value={vertexDensity}
                onChange={(e) => setVertexDensity(e.target.value)}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-[hsl(var(--primary))] cursor-pointer"
                id="re-density-select"
              >
                <option value="10K">10K Low-Poly (Mobile Ready)</option>
                <option value="20K">20K Game-Ready (Optimized Assets)</option>
                <option value="50K">50K Mid-Poly (Cinema / VFX)</option>
                <option value="100K">100K High-Poly (Subdivision Raw)</option>
              </select>
            </div>

            {/* Constraints */}
            <div className="flex flex-col gap-3 pt-2 border-t border-[hsl(var(--border))]" id="remesh-toggles">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Preserve Symmetry</span>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))]">Maintains mirror axis planes</span>
                </div>
                <input
                  type="checkbox"
                  checked={symmetry}
                  onChange={(e) => setSymmetry(e.target.checked)}
                  className="accent-[hsl(var(--primary))] h-4 w-4 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">Retain Hard Edges</span>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))]">Keeps sharp boundary splits</span>
                </div>
                <input
                  type="checkbox"
                  checked={keepBoundaries}
                  onChange={(e) => setKeepBoundaries(e.target.checked)}
                  className="accent-[hsl(var(--primary))] h-4 w-4 cursor-pointer"
                />
              </div>
            </div>

            {/* Run Button */}
            <button
              onClick={handleRemesh}
              disabled={isProcessing}
              className="w-full mt-2 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] hover:brightness-110 active:scale-[0.98] text-black font-extrabold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-[0_4px_15px_rgba(245,166,35,0.2)]"
              id="trigger-remesh-btn"
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-black" />
                  Remeshing Mesh...
                </>
              ) : (
                <>
                  <Play size={10} className="fill-black stroke-none" />
                  Bake Retopology Flow
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Right Result Visualizer Stage */}
      <div className="flex-1 bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-6 flex flex-col gap-6 relative overflow-hidden" id="remesh-right-stage">
        
        {/* Background Anime Speed Lines/Aura overlay during baking */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/60 z-20 flex flex-col items-center justify-center text-center p-6 animate-speed-lines">
            {/* Pulsing energy sphere representing compute */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] animate-energy-pulse flex items-center justify-center text-black font-extrabold text-xs">
              <RefreshCw size={36} className="animate-spin text-black stroke-[3]" />
            </div>
            <h3 className="text-lg font-black text-[hsl(var(--primary))] uppercase tracking-widest mt-6 animate-pulse">
              Computing Dual-Contour Retopology...
            </h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2 max-w-sm leading-relaxed font-mono">
              {statusMessage}
            </p>
          </div>
        )}

        <div className="flex-1 flex flex-col justify-between z-10">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Cpu size={16} className="text-[hsl(var(--primary))]" />
              Topology Pipeline Diagnostics
            </h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Review current vertex structures and performance ratios. Once remeshed, updates are pushed directly to the Studio.
            </p>
          </div>

          {/* Interactive display */}
          {successResult ? (
            <div className="bg-[hsl(var(--surface-2))] border border-emerald-500/30 rounded-xl p-5 flex flex-col gap-4 animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <CheckCircle size={18} className="text-emerald-500" />
                <span className="text-sm font-bold text-white uppercase tracking-wider">Remeshing Complete!</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[hsl(var(--surface-1))] p-3 rounded-lg border border-[hsl(var(--border))]">
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Source Polys</p>
                  <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] mt-1">{successResult.oldVertices}</p>
                </div>
                <div className="bg-[hsl(var(--surface-1))] p-3 rounded-lg border border-emerald-500/10">
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Remeshed Polys</p>
                  <p className="text-xs font-bold text-emerald-500 mt-1">{successResult.newVertices}</p>
                </div>
              </div>
              <div className="bg-[hsl(var(--surface-1))] p-4 rounded-lg border border-[hsl(var(--border))] flex items-center justify-between">
                <span className="text-xs text-[hsl(var(--muted-foreground))]">Reduction Ratio:</span>
                <span className="text-xs font-bold text-[hsl(var(--primary))]">{successResult.reduction}</span>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed italic bg-black/45 p-3 rounded-lg border border-[hsl(var(--border))]">
                💡 Topology Summary: {successResult.promptDescription}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-[hsl(var(--border))] rounded-xl flex-1 my-6 bg-[hsl(var(--surface-2))]/40">
              <Settings size={36} className="text-[hsl(var(--border))] mb-3 animate-spin-slow" />
              <h4 className="text-xs font-bold text-[hsl(var(--muted-foreground))]">Awaiting Topology Pipeline Trigger</h4>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] max-w-xs mt-1.5 leading-relaxed">
                Click &quot;Bake Retopology Flow&quot; to optimize and convert your active model primitives into structured game meshes.
              </p>
            </div>
          )}

          {/* Quick Warning Footer */}
          <div className="bg-[hsl(var(--surface-2))] rounded-xl p-4 border border-amber-500/10 flex items-start gap-3">
            <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Engine Notice</span>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1 leading-relaxed">
                Applying dual-contour retopology generates a clean isomorphic flow over the existing active model. It will update the layout of raw ThreeDViewer primitives.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
