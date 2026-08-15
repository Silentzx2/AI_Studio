"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import anime from 'animejs';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Sparkles, Sliders, CheckCircle, Zap, Image as ImageIcon, Upload, X, Settings, ChevronDown, RefreshCw, AlertTriangle, Cpu, Info } from 'lucide-react';
import { Shape3D } from '@/types/new-ui';
import { useProjectStore } from '@/stores/useProjectStore';
import { useWorkspaceModels } from '@/hooks/useBackendData';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

  const hasInitializedRef = useRef(false);
  // Set default texture model to the first installed one (preferred: hunyuan3d-2.1)
  useEffect(() => {
    if (!hasInitializedRef.current && availableTextureModels.length > 0) {
      const preferred = availableTextureModels.find((m) => m.id === 'hunyuan3d-2.1' && m.installed) || availableTextureModels[0];
      if (preferred && preferred.id !== materialModel) {
        setMaterialModel(preferred.id);
        hasInitializedRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableTextureModels]);

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
        targets: '#texture-upload-area',
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
    <TooltipProvider delayDuration={400}>
    <div className="flex-1 flex flex-col lg:flex-row gap-0 bg-black overflow-hidden" id="texture-tab-panel">
      {/* Left Settings sidebar — Refined Studio layout */}
      <aside className="w-full lg:w-[400px] border-r border-white/5 flex flex-col h-full bg-black z-10" id="texture-left-panel">
        
        <div className="p-8 border-b border-white/[0.03] bg-white/[0.01]">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
              <Palette size={20} className="text-amber-500" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-black uppercase tracking-[-0.01em] text-white">Surface Painter</span>
              <span className="text-[9px] text-white/30 font-black uppercase tracking-[0.2em]">Neural PBR Synthesis</span>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-8 space-y-10 scrollbar-thin" id="texture-engine-box">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Target Asset Manifest</span>
          </div>

          <div className="flex flex-col gap-4">
            {/* Model Upload */}
            <div className="flex flex-col gap-2" id="texture-upload-area">
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
                          <Palette size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-white truncate uppercase tracking-widest">{uploadedModelName}</p>
                          <p className="text-[9px] text-white/30 font-black uppercase tracking-[0.15em] mt-0.5">Asset Synchronized</p>
                        </div>
                        <button 
                          onClick={() => { setUploadedModel(null); setUploadedModelUrl(null); setUploadedModelName(''); }} 
                          className="p-2 rounded-xl hover:bg-rose-500/10 text-white/20 hover:text-rose-500 transition-all"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <label
                        id="texture-upload-dropzone"
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
                          <span className="text-[8px] text-white/20 font-black uppercase tracking-[0.2em]">Automatic UV Unwrap</span>
                        </div>
                        <input type="file" accept=".glb,.gltf" onChange={handleModelUpload} className="hidden" />
                      </label>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Target asset for PBR material projection</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Model Selection */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Neural Provider</label>
                <Tooltip>
                  <TooltipTrigger>
                    <Info size={12} className="text-white/20" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[200px]">
                    <p className="text-[10px]">AI model specializing in 3D surface painting and PBR channel generation.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="relative group">
                <select
                  value={materialModel}
                  onChange={(e) => setMaterialModel(e.target.value)}
                  disabled={isLoadingTextureModels}
                  className="w-full bg-white/[0.02] border border-white/5 rounded-2xl pl-4 pr-10 py-3.5 text-[11px] font-black text-white/80 cursor-pointer focus:outline-none focus:border-amber-500/30 transition-all appearance-none disabled:opacity-60 uppercase tracking-widest"
                >
                  {availableTextureModels.map((m: any) => (
                    <option key={m.id} value={m.id} disabled={m.installed === false} className="bg-black text-white">
                      {m.label}{m.installed === false ? ' (Pending)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-4 top-4 text-white/20 pointer-events-none group-hover:text-amber-500 transition-colors" />
              </div>
            </div>
          </div>

          {/* SECTION: TEXTURE GENERATION */}
          <div className="flex flex-col gap-8" id="texture-generation-box">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Material Synthesis</span>
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Material Prompt</label>
                  <button 
                    onClick={handleRandomPrompt}
                    className="text-[10px] font-black text-amber-500 hover:brightness-110 flex items-center gap-1.5 transition-all uppercase tracking-widest"
                  >
                    <RefreshCw size={10} />
                    Shuffle
                  </button>
                </div>
                <textarea
                  value={texturePrompt}
                  onChange={(e) => setTexturePrompt(e.target.value)}
                  placeholder="Polished obsidian, gold filigree trim, heavy weathering..."
                  className="w-full bg-white/[0.02] border border-white/5 rounded-2xl p-4 text-[11px] text-white/80 placeholder-white/10 min-h-[100px] max-h-[160px] focus:outline-none focus:border-amber-500/30 transition-all resize-none font-black leading-relaxed shadow-inner"
                />
              </div>

              {/* Baking Parameters */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Resolution</label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-3 py-3 text-[10px] font-black text-white/70 cursor-pointer focus:outline-none focus:border-amber-500/30 transition-all appearance-none uppercase tracking-widest"
                  >
                    <option value="4096" className="bg-black text-white">4K Ultra</option>
                    <option value="2048" className="bg-black text-white">2K High</option>
                    <option value="1024" className="bg-black text-white">1K Standard</option>
                    <option value="512" className="bg-black text-white">512px Draft</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest">Style</label>
                  <select
                    value={themeStyle}
                    onChange={(e) => setThemeStyle(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-3 py-3 text-[10px] font-black text-white/70 cursor-pointer focus:outline-none focus:border-amber-500/30 transition-all appearance-none uppercase tracking-widest"
                  >
                    <option value="photorealistic" className="bg-black text-white">Realistic</option>
                    <option value="stylized-handpainted" className="bg-black text-white">Handpainted</option>
                    <option value="anime" className="bg-black text-white">Anime/Cel</option>
                    <option value="cyberpunk" className="bg-black text-white">Cyberpunk</option>
                  </select>
                </div>
              </div>

              {/* Physics Sliders */}
              <div className="flex flex-col gap-6 pt-4 border-t border-white/[0.03]">
                {[
                  { label: 'Weathering', value: weathering, setter: setWeathering, color: 'bg-amber-500' },
                  { label: 'Metalness', value: metalnessBias, setter: setMetalnessBias, color: 'bg-emerald-500' },
                  { label: 'Roughness', value: roughnessBias, setter: setRoughnessBias, color: 'bg-blue-500' },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col gap-3 group">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] group-hover:text-white/50 transition-colors">{s.label}</span>
                      <span className="text-[10px] font-black text-white/60 tabular-nums">{Math.round(s.value * 100)}%</span>
                    </div>
                    <div className="relative h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={false}
                        animate={{ width: `${s.value * 100}%` }}
                        className={cn("absolute inset-y-0 left-0 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]", s.color)}
                      />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={s.value}
                        onChange={(e) => s.setter(parseFloat(e.target.value))}
                        className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleTextureGen}
                disabled={isProcessing || !texturePrompt}
                variant="premium"
                className="w-full h-14 rounded-2xl text-[11px] mt-4"
                id="trigger-texture-btn"
              >
                {isProcessing ? (
                  <>
                    <Sparkles size={18} className="animate-spin text-amber-500" />
                    Baking Surface...
                  </>
                ) : (
                  <>
                    <Palette size={18} className="fill-current" />
                    Paint Neural Materials
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Right Result Visualizer Stage — Full Studio Expansion */}
      <div className="flex-1 bg-[#050505] flex flex-col relative overflow-hidden" id="texture-right-stage">
        
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
                  <Palette size={32} className="text-amber-500 animate-pulse" />
                </div>
              </div>
              <h3 className="text-2xl font-black text-white uppercase tracking-[0.2em] mt-10">Baking PBR Materials</h3>
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
                  Surface Analysis Pipeline
                </h3>
              </div>
              <p className="text-[11px] text-white/30 font-black uppercase tracking-[0.1em] max-w-2xl leading-relaxed">
                Analyze and review AI-generated surface attributes. The Studio automatically applies Albedo, Normal, and Roughness maps to the active workspace.
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
                    <span className="text-lg font-black text-white uppercase tracking-tight">Material Synthesis Success</span>
                    <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">Full PBR stack generated in {resolution}px</p>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white/[0.02] p-10 rounded-3xl border border-white/5 flex flex-col gap-8 shadow-2xl"
                >
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] border-b border-white/5 pb-4">Material Metrics</span>
                  <div className="space-y-6">
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Bake Resolution</span>
                      <span className="text-sm font-black text-white/80 tabular-nums">{resolution}px</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] text-amber-500/60 font-black uppercase tracking-widest">Shader Model</span>
                      <span className="text-sm font-black text-amber-500 uppercase tracking-widest">{themeStyle}</span>
                    </div>
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white/[0.02] p-10 rounded-3xl border border-white/5 flex flex-col gap-8 shadow-2xl"
                >
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] border-b border-white/5 pb-4">AI Interpretation</span>
                  <p className="text-[11px] text-white/60 font-black uppercase tracking-[0.1em] leading-relaxed italic">
                    {successResult.texturesDescription}
                  </p>
                </motion.div>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 min-h-[500px] flex flex-col items-center justify-center text-center p-20 border-2 border-dashed border-white/5 rounded-[40px] bg-white/[0.01] group hover:bg-white/[0.02] transition-colors duration-700"
              >
                <div className="w-24 h-24 rounded-3xl bg-white/[0.02] flex items-center justify-center text-white/5 mb-8 border border-white/5 group-hover:scale-110 group-hover:border-amber-500/20 group-hover:text-amber-500/20 transition-all duration-700">
                  <Palette size={48} className="animate-pulse" />
                </div>
                <h4 className="text-sm font-black text-white/40 uppercase tracking-[0.4em]">Awaiting Surface Projection</h4>
                <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.2em] mt-5 max-w-sm leading-relaxed">
                  Describe your material and click &quot;Paint Materials&quot; to begin the AI texture generation process.
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
                Generated textures are applied as temporary overrides. Use the &quot;Commit&quot; button in the primary workspace to bake them permanently into your asset history.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
    </TooltipProvider>
  );
}
