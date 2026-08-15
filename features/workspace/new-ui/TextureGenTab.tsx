"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import anime from 'animejs';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Sparkles, Sliders, CheckCircle, Zap, Image as ImageIcon, Upload, X, Settings, ChevronDown, RefreshCw, AlertTriangle, Cpu } from 'lucide-react';
import { Shape3D } from '@/types/new-ui';
import { useProjectStore } from '@/stores/useProjectStore';
import { useWorkspaceModels } from '@/hooks/useBackendData';
import { toast } from 'sonner';

interface TextureGenTabProps {
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

export default function TextureGenTab({ activeModel, onUpdateModel, onNavigate }: TextureGenTabProps) {
  const { addLayer, currentProject } = useProjectStore();
  const [texturePrompt, setTexturePrompt] = useState('polished carbon fiber, neon teal glowing segments, brushed aerospace grade aluminum, futuristic sci-fi trim');
  const [resolution, setResolution] = useState('2048');
  const [themeStyle, setThemeStyle] = useState('photorealistic');
  const [weathering, setWeathering] = useState(0.3);
  const [metalnessBias, setMetalnessBias] = useState(0.5);
  const [roughnessBias, setRoughnessBias] = useState(0.5);
  const [materialModel, setMaterialModel] = useState<string>('hunyuan3d-2.1');
  const [uploadedModel, setUploadedModel] = useState<File | null>(null);
  const [uploadedModelUrl, setUploadedModelUrl] = useState<string | null>(null);
  const [uploadedModelName, setUploadedModelName] = useState<string>('');
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [modelUploadProgress, setModelUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelUploadRef = React.useRef<(() => void) | null>(null);

  // Fetch texture-compatible models from the workspace-aware API
  const { models: textureModels, loading: isLoadingTextureModels, error: textureModelsError } = useWorkspaceModels('texture-generation');

  // Resolve available texture models, falling back to TEXTURE_MODELS if the API is unavailable
  const availableTextureModels = useMemo(() => {
    if (textureModelsError || !textureModels || textureModels.length === 0) {
      return [
        { id: 'hunyuan3d-2.1', label: 'Hunyuan3D 2.1 (recommended)', installed: true },
        { id: 'hunyuan3d-2', label: 'Hunyuan3D 2', installed: true },
        { id: 'trellis', label: 'TRELLIS', installed: true },
      ];
    }
    return textureModels.map((m: any) => ({
      id: m.id,
      label: m.label,
      installed: m.installed,
    }));
  }, [textureModels, textureModelsError]);

  // Set default texture model to the first installed one (preferred: hunyuan3d-2.1)
  useEffect(() => {
  if (availableTextureModels.length > 0) {
    const preferred = availableTextureModels.find((m) => m.id === 'hunyuan3d-2.1' && m.installed) || availableTextureModels[0];
    if (preferred.id !== materialModel) setMaterialModel(preferred.id);
  }
}, [availableTextureModels, materialModel]);

  // Cleanup polling on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    anime({
      targets: '#texture-left-panel > div',
      opacity: [0, 1],
      translateX: [-20, 0],
      delay: anime.stagger(60),
      easing: 'easeOutQuad',
      duration: 500
    });
    anime({
      targets: '#texture-right-stage',
      opacity: [0, 1],
      scale: [0.98, 1],
      easing: 'easeOutQuad',
      duration: 600
    });
  }, []);

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

      // Load model into viewer
      window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url } }));

      // AnimeJS animation for successful load
      anime({
        targets: '#texture-upload-area',
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
        targets: '#texture-upload-dropzone',
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
      targets: '#texture-upload-dropzone',
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
      targets: '#texture-upload-dropzone',
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

  const handleRandomPrompt = () => {
    const prompts = [
      'glowing anime cel-shaded metallic gold, vivid crimson trim, glossy reflective lacquer',
      'rusted vintage copper plate, verdigris corrosion decay, heavy iron hardware details',
      'steampunk golden brass plates, dark polished mahogany timber, intricate copper conduits',
      'glowing liquid plasma purple glass, dark obsidian armor plates, tactical fiber decals',
      'frosted polycarbonate case, semi-transparent matte white, orange structural highlights',
    ];
    setTexturePrompt(prompts[Math.floor(Math.random() * prompts.length)]);
  };

  const handleTextureGen = async () => {
    if (isProcessing || !texturePrompt) return;

    // If user uploaded a model, it is already uploaded via handleModelUpload
    let modelUrl = uploadedModelUrl;

    setIsProcessing(true);
    setStatusMessage('Submitting texture generation job...');
    setSuccessResult(null);

    try {
      const payload: any = {
        prompt: texturePrompt,
        mode: 'texture-generation',
        quality: resolution === '4096' ? 'ultra' : resolution === '2048' ? 'high-poly' : resolution === '1024' ? 'standard' : 'draft',
        style_preset: themeStyle,
        generate_texture: true,
        provider: materialModel,
        workspace: 'texture-generation',
        processing_metadata: {
          weathering,
          metalness_bias: metalnessBias,
          roughness_bias: roughnessBias,
        },
      };
      if (modelUrl) {
        payload.reference_image_url = modelUrl;
      }
      if (currentProject?.id) {
        payload.project_id = currentProject.id;
      }

      const response = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok && data.data?.job_id) {
        setStatusMessage(`Job submitted (ID: ${data.data?.job_id}). Processing...`);
        // Poll job status
        const jobId = data.data?.job_id;
        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/v1/generation/${jobId}/status`);
            const statusData = await statusRes.json();
            if (statusData.data?.status === 'completed') {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setSuccessResult({
                texturesDescription: `${resolution} textures baked for prompt: "${texturePrompt}"`,
                accentColor: 'hsl(var(--primary))',
                mapsCount: '4 Map Channels Baked',
                albedoStatus: '100% Painted (RGB)',
                roughnessStatus: 'Roughness Map Applied',
                metalnessStatus: 'Metalness Channel Active',
              });
              addLayer({
                id: `texture-${Date.now()}`,
                type: 'texture',
                name: `PBR Textures (${resolution})`,
                enabled: true,
                visible: true,
                data: {
                  prompt: texturePrompt,
                  resolution,
                  themeStyle,
                  weathering,
                  mapsCount: '4',
                  albedoStatus: '100% Painted (RGB)',
                  roughnessStatus: 'Roughness Map Applied',
                  metalnessStatus: 'Metalness Channel Active',
                },
                sourceTab: 'TextureGen',
                timestamp: new Date(),
              });
              setIsProcessing(false);
            } else if (statusData.data?.status === 'failed') {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setStatusMessage(`Generation failed: ${statusData.data?.error_message || 'Unknown error'}`);
              setIsProcessing(false);
            } else {
              setStatusMessage(statusData.data?.stage || 'Processing...');
            }
          } catch {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
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
    <div className="flex-1 flex flex-col lg:flex-row gap-0 bg-[hsl(var(--surface-0))] overflow-hidden" id="texture-tab-panel">
      {/* Left Settings sidebar — Refined Studio layout */}
      <aside className="w-full lg:w-[360px] border-r border-[hsl(var(--border))] flex flex-col h-full bg-[hsl(var(--surface-1))] z-10" id="texture-left-panel">
        <div className="p-6 border-b border-[hsl(var(--border))]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr bg-[hsl(var(--surface-2))] flex items-center justify-center shadow-lg shadow-[hsl(var(--primary))]/20">
              <Palette size={18} className="text-[hsl(var(--foreground))]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-black uppercase tracking-tighter">Surface Painter</span>
              <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase">AI PBR Generation</span>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-8" id="texture-engine-box">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))] text-left">Target Asset</span>
          </div>

          <div className="flex flex-col gap-4">
            {/* Model Upload */}
            <div className="flex flex-col gap-2" id="texture-upload-area">
              <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Target Asset</label>
              
{isUploadingModel ? (
  <div className="w-full flex flex-col items-center gap-2 py-3 bg-[hsl(var(--surface-2))] rounded-xl border border-[hsl(var(--border))]">
    <RefreshCw size={16} className="text-[hsl(var(--primary))] animate-spin" />
    <div className="w-full max-w-[80%] h-1 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
      <div className="h-full bg-[hsl(var(--primary))] transition-all duration-200" style={{ width: `${modelUploadProgress}%` }} />
    </div>
    <button
      onClick={() => {
        if (cancelUploadRef.current) {
          cancelUploadRef.current();
        }
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
                <div className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-3 flex items-center gap-3 group">
                  <div className="w-8 h-8 rounded-lg bg-[hsl(var(--neon-green))/0.1] flex items-center justify-center text-[hsl(var(--muted-foreground))]">
                    <Palette size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-[hsl(var(--foreground))] truncate">{uploadedModelName}</p>
                    <p className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tighter">Asset Ready</p>
                  </div>
                  <button 
                    onClick={() => { setUploadedModel(null); setUploadedModelUrl(null); setUploadedModelName(''); }} 
                    className="p-1.5 rounded-lg hover:bg-[hsl(var(--destructive))/0.1] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label
                  id="texture-upload-dropzone"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center relative overflow-hidden group ${
                    isDragOver
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                      : 'border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] hover:border-[hsl(var(--primary))]/50 hover:bg-[hsl(var(--surface-2))]'
                  }`}
                >
                  <Upload size={18} className="text-[hsl(var(--muted-foreground))] group-hover:scale-110 group-hover:text-[hsl(var(--primary))] transition-all" />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black text-[hsl(var(--foreground))]">Drop GLB Asset</span>
                    <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tighter">Automatic UV Unwrap</span>
                  </div>
                  <input type="file" accept=".glb,.gltf" onChange={handleModelUpload} className="hidden" />
                </label>
              )}
            </div>

            {/* Model Selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Provider</label>
              <div className="relative group">
                <select
                  value={materialModel}
                  onChange={(e) => setMaterialModel(e.target.value)}
                  disabled={isLoadingTextureModels}
                  className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl pl-3 pr-8 py-2.5 text-[11px] font-black text-[hsl(var(--foreground))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))] transition-all appearance-none disabled:opacity-50 shadow-sm"
                >
                  {availableTextureModels.map((m: any) => (
                    <option key={m.id} value={m.id} disabled={m.installed === false}>
                      {m.label}{m.installed === false ? ' (Not Installed)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-3 text-[hsl(var(--muted-foreground))] pointer-events-none group-hover:text-[hsl(var(--primary))] transition-colors" />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION: TEXTURE GENERATION */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-5 flex flex-col gap-5 shadow-sm" id="texture-generation-box">
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">PBR Painting</span>
            <Palette size={12} className="text-[hsl(var(--primary))]" />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <label>Material Prompt</label>
                <button 
                  onClick={handleRandomPrompt}
                  className="text-[hsl(var(--primary))] hover:brightness-110 flex items-center gap-1 transition-all"
                >
                  <RefreshCw size={10} />
                  Shuffle
                </button>
              </div>
              <textarea
                value={texturePrompt}
                onChange={(e) => setTexturePrompt(e.target.value)}
                placeholder="Polished obsidian, gold filigree trim, heavy weathering..."
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-3 text-[11px] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))/0.5] min-h-[90px] max-h-[140px] focus:outline-none focus:border-[hsl(var(--primary))] transition-all resize-none font-bold leading-relaxed shadow-inner"
              />
            </div>

            {/* Baking Parameters */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Resolution</label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-lg px-2 py-2 text-[10px] font-black text-[hsl(var(--foreground))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))]"
                >
                  <option value="4096">4K Ultra</option>
                  <option value="2048">2K High</option>
                  <option value="1024">1K Standard</option>
                  <option value="512">512px Draft</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Style</label>
                <select
                  value={themeStyle}
                  onChange={(e) => setThemeStyle(e.target.value)}
                  className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-lg px-2 py-2 text-[10px] font-black text-[hsl(var(--foreground))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))]"
                >
                  <option value="photorealistic">Realistic</option>
                  <option value="stylized-handpainted">Handpainted</option>
                  <option value="anime">Anime/Cel</option>
                  <option value="cyberpunk">Cyberpunk</option>
                </select>
              </div>
            </div>

            {/* Physics Sliders */}
            <div className="flex flex-col gap-3.5 pt-2">
              {[
                { label: 'Weathering', value: weathering, setter: setWeathering, color: 'accent-[hsl(var(--primary))]' },
                { label: 'Metalness', value: metalnessBias, setter: setMetalnessBias, color: 'accent-[hsl(var(--muted-foreground))]' },
                { label: 'Roughness', value: roughnessBias, setter: setRoughnessBias, color: 'accent-[hsl(var(--muted-foreground))]' },
              ].map((s) => (
                <div key={s.label} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                    <span>{s.label}</span>
                    <span className="text-[hsl(var(--foreground))] font-mono">{Math.round(s.value * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={s.value}
                    onChange={(e) => s.setter(parseFloat(e.target.value))}
                    className={`w-full h-1 cursor-pointer transition-all ${s.color}`}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleTextureGen}
              disabled={isProcessing || !texturePrompt}
              className="w-full bg-[hsl(var(--primary))] hover:brightness-110 active:scale-[0.98] disabled:opacity-50 text-[hsl(var(--surface-0))] font-black py-3 rounded-xl text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-[0_8px_20px_rgba(245,166,35,0.2)] mt-2"
              id="trigger-texture-btn"
            >
              {isProcessing ? (
                <>
                  <Sparkles size={14} className="animate-spin" />
                  Baking...
                </>
              ) : (
                <>
                  <Palette size={14} />
                  Paint Materials
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Right Result Visualizer Stage — Full Studio Expansion */}
      <div className="flex-1 bg-[hsl(var(--surface-0))] flex flex-col relative overflow-hidden" id="texture-right-stage">
        
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
                <Palette size={32} className="absolute inset-0 m-auto text-[hsl(var(--primary))] animate-pulse" />
              </div>
              <h3 className="text-xl font-black text-[hsl(var(--foreground))] uppercase tracking-widest mt-8">Baking PBR Materials</h3>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tighter mt-1">{statusMessage}</p>
              
              <div className="w-48 h-1 bg-[hsl(var(--surface-3))] rounded-full mt-8 overflow-hidden">
                <div className="h-full bg-[hsl(var(--primary))] animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col p-5 z-10 overflow-y-auto">
          <div className="max-w-4xl w-full mx-auto flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]" />
                <h3 className="text-[11px] font-black text-[hsl(var(--foreground))] uppercase tracking-widest">
                  Surface Analysis Pipeline
                </h3>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] max-w-2xl leading-relaxed">
                Analyze and review AI-generated surface attributes. The Studio automatically applies Albedo, Normal, and Roughness maps to the active workspace.
              </p>
            </div>

            {/* Interactive display */}
            {successResult ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                <div className="col-span-full bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[hsl(var(--neon-green))/0.1] flex items-center justify-center text-[hsl(var(--muted-foreground))]">
                    <CheckCircle size={24} />
                  </div>
                  <div>
                    <span className="text-sm font-black text-[hsl(var(--foreground))] uppercase tracking-tight">Material Synthesis Success</span>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono uppercase">Full PBR stack generated in {resolution}px</p>
                  </div>
                </div>

                <div className="bg-[hsl(var(--surface-1))] p-4 rounded-xl border border-[hsl(var(--border))] flex flex-col gap-4">
                  <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-widest border-b border-[hsl(var(--border))] pb-2">Material Info</span>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono">Bake Resolution</span>
                      <span className="text-xs font-bold text-[hsl(var(--foreground))]">{resolution}px</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono">Shader Model</span>
                      <span className="text-xs font-bold text-[hsl(var(--primary))] uppercase">{themeStyle}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[hsl(var(--surface-1))] p-4 rounded-xl border border-[hsl(var(--border))] flex flex-col gap-4">
                  <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-widest border-b border-[hsl(var(--border))] pb-2">AI Interpretation</span>
                  <p className="text-[11px] text-[hsl(var(--foreground))] leading-relaxed">
                    {successResult.texturesDescription}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-[400px] flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-[hsl(var(--border))] rounded-3xl bg-[hsl(var(--surface-1))]/50">
                <div className="w-20 h-20 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center text-[hsl(var(--border))] mb-6">
                  <Palette size={40} className="animate-pulse opacity-20" />
                </div>
                <h4 className="text-sm font-black text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Awaiting Surface Projection</h4>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] max-w-sm mt-2 leading-relaxed uppercase font-bold tracking-tighter">
                  Describe your material and click &quot;Paint Materials&quot; to begin the AI texture generation process.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Engine Notice Footer */}
        <div className="mt-auto p-6 bg-[hsl(var(--surface-1))] border-t border-[hsl(var(--border))]">
          <div className="max-w-4xl mx-auto flex items-start gap-4">
            <AlertTriangle size={18} className="text-[hsl(var(--muted-foreground))] flex-shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Studio Engine Notice</span>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed uppercase font-bold tracking-tighter">
                Generated textures are applied as temporary overrides. Use the &quot;Commit&quot; button in the primary workspace to bake them permanently into your asset history.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
