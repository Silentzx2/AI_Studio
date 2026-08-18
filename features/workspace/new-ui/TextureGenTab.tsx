"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import anime from 'animejs';
import { motion, AnimatePresence } from 'motion/react';
import { Palette, Sparkles, Upload, X, ChevronDown, RefreshCw, CheckCircle } from 'lucide-react';
import { Shape3D } from '@/types/new-ui';
import { useProjectStore } from '@/stores/useProjectStore';
import { useWorkspaceModels } from '@/hooks/useBackendData';
import { loadModelInViewer } from '@/stores/useViewerStore';
import { cn } from '@/lib/utils';
import AssetPanelHost from '@/features/workspace/AssetPanelHost';

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
  controlsOnly?: boolean;
}

export default function TextureGenTab({ activeModel, onUpdateModel, onNavigate, controlsOnly }: TextureGenTabProps & { controlsOnly?: boolean }) {
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
  const [lowVram, setLowVram] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelUploadRef = React.useRef<(() => void) | null>(null);

  const { models: textureModels, loading: isLoadingTextureModels, error: textureModelsError } = useWorkspaceModels('texture-generation');

  const availableTextureModels = useMemo(() => {
    if (textureModelsError || !textureModels || textureModels.length === 0) {
      return [
        { id: 'hunyuan3d-2.1', label: 'Hunyuan3D 2.1 (recommended)', installed: true, low_vram_supported: true, low_vram_required_mb: 10240 },
        { id: 'hunyuan3d-2', label: 'Hunyuan3D 2', installed: true, low_vram_supported: true, low_vram_required_mb: 16384 },
        { id: 'trellis', label: 'TRELLIS', installed: true, low_vram_supported: false, low_vram_required_mb: 0 },
      ];
    }
    return textureModels.map((m: any) => ({
      id: m.id,
      label: m.label,
      installed: m.installed,
      low_vram_supported: m.low_vram_supported,
      low_vram_required_mb: m.low_vram_required_mb,
    }));
  }, [textureModels, textureModelsError]);

  useEffect(() => {
    if (availableTextureModels.length > 0) {
      const preferred = availableTextureModels.find((m) => m.id === 'hunyuan3d-2.1' && m.installed) || availableTextureModels[0];
      if (preferred.id !== materialModel) setMaterialModel(preferred.id);
    }
  }, [availableTextureModels, materialModel]);

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

      loadModelInViewer(url, file.name);

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
        low_vram: lowVram,
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

  const leftPanel = (
    <aside className="w-full lg:w-72 xl:w-80 border-r border-tripo-white-5 flex flex-col h-full bg-tripo-gray-2 z-10" id="texture-left-panel">
      <div className="px-3 py-2 border-b border-tripo-white-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-tripo-yellow-1/10 flex items-center justify-center">
            <Palette size={13} className="text-tripo-yellow-1" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-white">Surface Painter</span>
            <span className="text-[10px] text-tripo-gray-400">AI PBR Generation</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 scrollbar-thin" id="texture-engine-box">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5" id="texture-upload-area">
            <label className="text-[11px] font-medium text-tripo-gray-300">Target 3D Model</label>

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
                  <Palette size={12} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{uploadedModelName}</p>
                  <p className="text-[10px] text-emerald-400 font-medium">Ready for texturing</p>
                </div>
                <button
                  onClick={() => { setUploadedModel(null); setUploadedModelUrl(null); setUploadedModelName(''); }}
                  className="p-1 rounded-md hover:bg-tripo-white-10 text-tripo-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <label
                id="texture-upload-dropzone"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-1 py-3.5 rounded-lg border border-dashed transition-all cursor-pointer text-center relative overflow-hidden group ${
                  isDragOver
                    ? 'border-tripo-yellow-1 bg-tripo-yellow-1/5'
                    : 'border-tripo-white-10 bg-tripo-gray-3 hover:border-tripo-yellow-1/50 hover:bg-tripo-gray-3/80'
                }`}
              >
                <Upload size={14} className="text-tripo-gray-400 group-hover:scale-110 group-hover:text-tripo-yellow-1 transition-all" />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-tripo-gray-200">Drop 3D model or browse</span>
                  <span className="text-[10px] text-tripo-gray-500">Supports .glb, .gltf</span>
                </div>
                <input type="file" accept=".glb,.gltf" onChange={handleModelUpload} className="hidden" />
              </label>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-tripo-gray-300">Provider Model</label>
            <div className="relative group">
              <select
                value={materialModel}
                onChange={(e) => setMaterialModel(e.target.value)}
                disabled={isLoadingTextureModels}
                className="w-full bg-tripo-gray-3 border border-tripo-white-5 rounded-lg pl-2.5 pr-7 py-1.5 text-xs font-medium text-tripo-gray-200 cursor-pointer focus:outline-none focus:border-tripo-yellow-1 transition-all appearance-none disabled:opacity-50"
              >
                {availableTextureModels.map((m: any) => (
                  <option key={m.id} value={m.id} disabled={m.installed === false}>
                    {m.label}{m.installed === false ? ' (Not Installed)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-2 text-tripo-gray-400 pointer-events-none group-hover:text-tripo-yellow-1 transition-colors" />
            </div>

            {materialModel && (availableTextureModels.find((m: any) => m.id === materialModel)?.low_vram_supported) && (
              <div className="flex items-center justify-between bg-tripo-gray-3 border border-tripo-white-5 rounded-lg px-2.5 py-1.5 mt-1">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-tripo-gray-300">Low VRAM mode</span>
                  <span className="text-[9.5px] text-tripo-gray-500">
                    ~{((availableTextureModels.find((m: any) => m.id === materialModel)?.low_vram_required_mb || 0) / 1024).toFixed(1)} GB min
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
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-tripo-white-5 space-y-2.5 bg-tripo-gray-2/60">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[11px] font-medium text-tripo-gray-300">
            <label>Material Prompt</label>
            <button
              onClick={handleRandomPrompt}
              className="text-tripo-yellow-1 hover:brightness-110 flex items-center gap-1 text-[10px] font-medium cursor-pointer"
            >
              <RefreshCw size={9} />
              Shuffle
            </button>
          </div>
          <textarea
            value={texturePrompt}
            onChange={(e) => setTexturePrompt(e.target.value)}
            placeholder="Polished obsidian, gold filigree trim, heavy weathering..."
            rows={3}
            className="w-full bg-tripo-gray-3 border border-tripo-white-5 rounded-lg p-2 text-xs text-white placeholder:text-tripo-gray-500 focus:outline-none focus:border-tripo-yellow-1 transition-all resize-none leading-normal"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-tripo-gray-400">Resolution</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="w-full bg-tripo-gray-3 border border-tripo-white-5 rounded-lg px-2 py-1 text-xs font-medium text-tripo-gray-200 cursor-pointer focus:outline-none focus:border-tripo-yellow-1"
            >
              <option value="4096">4K Ultra</option>
              <option value="2048">2K High</option>
              <option value="1024">1K Standard</option>
              <option value="512">512px Draft</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-tripo-gray-400">Style</label>
            <select
              value={themeStyle}
              onChange={(e) => setThemeStyle(e.target.value)}
              className="w-full bg-tripo-gray-3 border border-tripo-white-5 rounded-lg px-2 py-1 text-xs font-medium text-tripo-gray-200 cursor-pointer focus:outline-none focus:border-tripo-yellow-1"
            >
              <option value="photorealistic">Realistic</option>
              <option value="stylized-handpainted">Handpainted</option>
              <option value="anime">Anime/Cel</option>
              <option value="cyberpunk">Cyberpunk</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 pt-1">
          {[
            { label: 'Weathering', value: weathering, setter: setWeathering },
            { label: 'Metalness', value: metalnessBias, setter: setMetalnessBias },
            { label: 'Roughness', value: roughnessBias, setter: setRoughnessBias },
          ].map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <div className="flex justify-between items-center text-[10px] font-medium text-tripo-gray-400">
                <span>{s.label}</span>
                <span className="text-tripo-gray-200 font-mono text-[10px]">{Math.round(s.value * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={s.value}
                onChange={(e) => s.setter(parseFloat(e.target.value))}
                className="w-full h-1 cursor-pointer transition-all accent-tripo-yellow-1"
              />
            </div>
          ))}
        </div>

        <button
          onClick={handleTextureGen}
          disabled={isProcessing || !texturePrompt}
          className="w-full bg-tripo-yellow-1 hover:bg-yellow-400 text-black font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 cursor-pointer mt-1"
          id="trigger-texture-btn"
        >
          {isProcessing ? (
            <>
              <Sparkles size={13} className="animate-spin" />
              Baking PBR...
            </>
          ) : (
            <>
              <Palette size={13} />
              Generate Textures
            </>
          )}
        </button>
      </div>
    </aside>
  );

  if (controlsOnly) {
    return leftPanel;
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-0 bg-tripo-gray-3 overflow-hidden" id="texture-tab-panel">
      {leftPanel}

      <div className="flex-1 bg-tripo-gray-3 flex flex-col relative overflow-hidden" id="texture-right-stage">
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
                <Palette size={32} className="absolute inset-0 m-auto text-tripo-yellow-1 animate-pulse" />
              </div>
              <h3 className="text-xl font-medium text-tripo-gray-100 mt-8">Baking PBR materials</h3>
              <p className="text-3 text-tripo-gray-300 mt-1">{statusMessage}</p>

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
                <h3 className="text-3 font-medium text-tripo-gray-300">
                  Surface Analysis Pipeline
                </h3>
              </div>
              <p className="text-3 text-tripo-gray-300 max-w-2xl leading-relaxed">
                Analyze and review AI-generated surface attributes. The Studio automatically applies Albedo, Normal, and Roughness maps to the active workspace.
              </p>
            </div>

            {successResult ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                <div className="col-span-full bg-tripo-gray-4 border border-tripo-white-5 rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-tripo-yellow-1/10 flex items-center justify-center text-tripo-gray-300">
                    <CheckCircle size={24} />
                  </div>
                  <div>
                    <span className="text-3.5 font-medium text-tripo-gray-100">Material synthesis success</span>
                    <p className="text-2.5 text-tripo-gray-300">Full PBR stack generated in {resolution}px</p>
                  </div>
                </div>

                <div className="bg-tripo-gray-4 p-4 rounded-xl border border-tripo-white-5 flex flex-col gap-4">
                  <span className="text-2.5 font-medium text-tripo-gray-300 border-b border-tripo-white-5 pb-2">Material info</span>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <span className="text-2.5 text-tripo-gray-300">Bake resolution</span>
                      <span className="text-3 font-medium text-tripo-gray-100">{resolution}px</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-2.5 text-tripo-gray-300">Shader model</span>
                      <span className="text-3 font-medium text-tripo-yellow-1">{themeStyle}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-tripo-gray-4 p-4 rounded-xl border border-tripo-white-5 flex flex-col gap-4">
                  <span className="text-2.5 font-medium text-tripo-gray-300 border-b border-tripo-white-5 pb-2">AI Interpretation</span>
                  <p className="text-3 text-tripo-gray-100 leading-relaxed">
                    {successResult.texturesDescription}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-[400px] flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-tripo-white-5 rounded-3xl bg-tripo-gray-4/50">
                <div className="w-20 h-20 rounded-full bg-tripo-gray-4 flex items-center justify-center text-tripo-white-5 mb-6">
                  <Palette size={40} className="animate-pulse opacity-20" />
                </div>
                <h4 className="text-3 font-medium text-tripo-gray-300">Awaiting surface projection</h4>
                <p className="text-2.5 text-tripo-gray-300 max-w-sm mt-2 leading-relaxed">
                  Describe your material and click "Generate Textures" to begin the AI texture generation process.
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
              <span className="text-2.5 font-medium text-tripo-gray-300">Studio engine notice</span>
              <p className="text-2.5 text-tripo-gray-300 leading-relaxed">
                Generated textures are applied as temporary overrides. Use the "Commit" button in the primary workspace to bake them permanently into your asset history.
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
