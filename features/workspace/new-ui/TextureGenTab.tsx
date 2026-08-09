"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Palette, Sparkles, Sliders, CheckCircle, Zap, Image as ImageIcon, Upload, X, Settings, ChevronDown } from 'lucide-react';
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

  // Set default texture model to the first installed one (preferred: hunyuan3d-2.1)
  useEffect(() => {
    if (availableTextureModels.length > 0) {
      const preferred = availableTextureModels.find((m) => m.id === 'hunyuan3d-2.1' && m.installed)
        || availableTextureModels.find((m) => m.installed)
        || availableTextureModels[0];
      setMaterialModel(preferred.id);
    }
  }, [availableTextureModels]);

  // Cleanup polling on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

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

    // If user uploaded a model, upload it first
    let modelUrl = uploadedModelUrl;
    if (uploadedModel && !modelUrl) {
      setIsProcessing(true);
      setStatusMessage('Uploading model...');
      try {
        const formData = new FormData();
        formData.append('file', uploadedModel);
        const uploadRes = await fetch('/api/v1/upload/model', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const uploadData = await uploadRes.json();
        modelUrl = uploadData?.data?.url || uploadData?.url;
      } catch (err: any) {
        setStatusMessage(`Upload failed: ${err.message}`);
        setIsProcessing(false);
        return;
      }
    }

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
    <div className="flex-1 p-6 flex flex-col lg:flex-row gap-6 animate-fadeIn text-[hsl(var(--foreground))]" id="texture-gen-tab-panel">
      
      {/* Left Input Configuration Panel */}
      <div className="w-full lg:w-[380px] flex flex-col gap-6 flex-shrink-0" id="texture-left-panel">
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-5 flex flex-col gap-5" id="texture-inputs-box">
          <div>
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))] flex items-center gap-2">
              <Palette size={20} className="text-[hsl(var(--primary))]" />
              Material & PBR Painting
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Apply rich, text-described textures and physical surface settings to individual active model components.
            </p>
          </div>

          {/* Model Upload */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Target Model (Optional)</label>
            {uploadedModelUrl ? (
              <div className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--neon-green)/0.2)] rounded-xl p-3 flex items-center gap-3">
                <Palette size={16} className="text-[hsl(var(--neon-green))]" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[hsl(var(--foreground))] truncate">{uploadedModelName}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{((uploadedModel?.size ?? 0) / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={() => { setUploadedModel(null); setUploadedModelUrl(null); setUploadedModelName(''); }} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50 cursor-pointer transition-colors text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]">
                <Upload size={14} />
                <span>Upload GLB/GLTF to Texture</span>
                <input type="file" accept=".glb,.gltf" onChange={handleModelUpload} className="hidden" />
              </label>
            )}
          </div>

          {/* Model Description Input Prompt */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Material Prompt</label>
            <div className="relative">
              <textarea
                value={texturePrompt}
                onChange={(e) => setTexturePrompt(e.target.value)}
                placeholder="Describe PBR materials, finishes, gloss levels, and weathering details..."
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-3 text-xs text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] min-h-[90px] max-h-[140px] focus:outline-none focus:border-[hsl(var(--primary))] transition-all resize-y"
                id="texture-prompt-textarea"
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={handleRandomPrompt}
                className="text-[11px] font-bold text-[hsl(var(--primary))] hover:underline"
                id="random-texture-prompt-btn"
              >
                🎲 Random Theme
              </button>
              <button
                onClick={() => setTexturePrompt('')}
                className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-[hsl(var(--border))] pt-4" id="texture-settings-form">
            {/* Texture Model Selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Texture Model</label>
              <select
                value={materialModel}
                onChange={(e) => setMaterialModel(e.target.value)}
                disabled={isLoadingTextureModels}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-2.5 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] cursor-pointer disabled:opacity-50"
                id="texture-model-select"
              >
                {availableTextureModels.map((m: any) => (
                  <option key={m.id} value={m.id} disabled={m.installed === false}>
                    {m.label}{m.installed === false ? ' — not installed' : ''}
                  </option>
                ))}
              </select>
              {textureModelsError && (
                <p className="text-[10px] text-orange-400">Using fallback model list (backend unavailable)</p>
              )}
            </div>

            {/* Resolution selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Bake Resolution</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-2.5 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] cursor-pointer"
                id="texture-res-select"
              >
                <option value="4096">4K Ultra Detail (4096px) — High Fidelity</option>
                <option value="2048">2K Production Grade (2048px) — Balanced</option>
                <option value="1024">1K Standard (1024px) — Fast</option>
                <option value="512">512px (Low) — Draft</option>
              </select>
            </div>

            {/* Art style preset selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Art Preset Theme</label>
              <select
                value={themeStyle}
                onChange={(e) => setThemeStyle(e.target.value)}
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-xl p-2.5 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] cursor-pointer"
                id="texture-style-select"
              >
                <option value="photorealistic">Photorealistic PBR (Physical Material Models)</option>
                <option value="stylized-handpainted">Stylized Handpainted (Watercolor/Clay)</option>
                <option value="anime">Anime / Cel-Shaded (Bold Outline, Vibrant Gloss)</option>
                <option value="cyberpunk">Cyberpunk Neon (Fluorescent Emissive Shading)</option>
                <option value="procedural">Procedural (Noise / Tileable)</option>
              </select>
            </div>

            {/* Weathering Slider controller */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                <span>Weathering & Wear</span>
                <span className="text-[hsl(var(--primary))]">{Math.round(weathering * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={weathering}
                onChange={(e) => setWeathering(parseFloat(e.target.value))}
                className="w-full accent-[hsl(var(--primary))] cursor-pointer"
              />
            </div>

            {/* Metalness Bias Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                <span>Metalness Bias</span>
                <span className="text-[hsl(var(--primary))]">{Math.round(metalnessBias * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={metalnessBias}
                onChange={(e) => setMetalnessBias(parseFloat(e.target.value))}
                className="w-full accent-[hsl(var(--neon-amber))] cursor-pointer"
              />
            </div>

            {/* Roughness Bias Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                <span>Roughness Bias</span>
                <span className="text-[hsl(var(--primary))]">{Math.round(roughnessBias * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={roughnessBias}
                onChange={(e) => setRoughnessBias(parseFloat(e.target.value))}
                className="w-full accent-[hsl(var(--neon-amber))] cursor-pointer"
              />
            </div>

            {/* Run painting button */}
            <button
              onClick={handleTextureGen}
              disabled={isProcessing || !texturePrompt}
              className="w-full bg-[hsl(var(--primary))] hover:brightness-110 active:scale-[0.98] disabled:opacity-50 text-[hsl(var(--surface-0))] font-extrabold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-[0_4px_15px_rgba(245,166,35,0.2)]"
              id="trigger-texture-btn"
            >
              {isProcessing ? (
                <>
                  <Sparkles size={14} className="animate-spin text-[hsl(var(--surface-0))]" />
                  Baking Textures ({resolution}px)...
                </>
              ) : (
                <>
                  <Palette size={14} />
                  Bake Material & Paint
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Right Result Visualizer Stage */}
      <div className="flex-1 bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-2xl p-6 flex flex-col gap-6 relative overflow-hidden" id="texture-right-stage">
        
        {/* Background Anime Speed Lines/Aura overlay during baking */}
        {isProcessing && (
          <div className="absolute inset-0 bg-[hsl(var(--surface-0)/0.6)] z-20 flex flex-col items-center justify-center text-center p-6 animate-speed-lines">
            <div className="w-24 h-24 rounded-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] animate-energy-pulse flex items-center justify-center text-[hsl(var(--surface-0))] font-extrabold text-xs">
              <Palette size={36} className="animate-bounce text-[hsl(var(--surface-0))]" />
            </div>
            <h3 className="text-lg font-black text-[hsl(var(--primary))] uppercase tracking-widest mt-6 animate-pulse">
              Painting UV PBR Channels...
            </h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2 max-w-sm leading-relaxed font-mono">
              {statusMessage}
            </p>
          </div>
        )}

        <div className="flex-1 flex flex-col justify-between z-10">
          <div>
            <h3 className="text-sm font-bold text-[hsl(var(--foreground))] flex items-center gap-2">
              <Sliders size={16} className="text-[hsl(var(--primary))]" />
              PBR Channel Diagnostics
            </h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Inspect separate baked UV channel layouts. Generating textures applies real physical material values (Metalness, Roughness) instantly.
            </p>
          </div>

          {successResult ? (
            <div className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--neon-green)/0.3)] rounded-xl p-5 flex flex-col gap-4 animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <CheckCircle size={18} className="text-[hsl(var(--neon-green))]" />
                <span className="text-sm font-bold text-[hsl(var(--foreground))] uppercase tracking-wider">Textures Successfully Baked!</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[hsl(var(--surface-1))] p-3 rounded-lg border border-[hsl(var(--border))]">
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Albedo Mapping</p>
                  <p className="text-xs font-bold text-[hsl(var(--muted-foreground))] mt-1">{successResult.albedoStatus}</p>
                </div>
                <div className="bg-[hsl(var(--surface-1))] p-3 rounded-lg border border-[hsl(var(--border))]">
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Baked Maps</p>
                  <p className="text-xs font-bold text-[hsl(var(--primary))] mt-1">{successResult.mapsCount}</p>
                </div>
              </div>
              <div className="bg-[hsl(var(--surface-1))] p-4 rounded-lg border border-[hsl(var(--border))] flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[hsl(var(--muted-foreground))]">Specular Roughness:</span>
                  <span className="font-semibold text-[hsl(var(--foreground))]">{successResult.roughnessStatus}</span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-white/[0.03] pt-2">
                  <span className="text-[hsl(var(--muted-foreground))]">Metalness Channel:</span>
                  <span className="font-semibold text-[hsl(var(--foreground))]">{successResult.metalnessStatus}</span>
                </div>
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed italic bg-[hsl(var(--surface-0)/0.45)] p-3 rounded-lg border border-[hsl(var(--border))]">
                💡 Baked PBR Materials: {successResult.texturesDescription}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-[hsl(var(--border))] rounded-xl flex-1 my-6 bg-[hsl(var(--surface-2))]/40">
              <ImageIcon size={36} className="text-[hsl(var(--border))] mb-3" />
              <h4 className="text-xs font-bold text-[hsl(var(--muted-foreground))]">Awaiting Painting Pipeline Trigger</h4>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] max-w-xs mt-1.5 leading-relaxed">
                Provide a prompt describing the material parameters on the left and click &quot;Bake Material &amp; Paint&quot; to trigger the painting server.
              </p>
            </div>
          )}

          {/* Quick Info Tip */}
          <div className="bg-[hsl(var(--surface-2))] rounded-xl p-4 border border-[hsl(var(--primary))]/10 flex items-start gap-3">
            <Zap size={15} className="text-[hsl(var(--primary))] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="text-[10px] font-bold text-[hsl(var(--primary))] uppercase tracking-wider">Pro Painting Tip</span>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1 leading-relaxed">
                Describe the surface reflectivity using direct physical vocabulary. For example, use words like <code className="bg-[hsl(var(--surface-1))] text-[hsl(var(--muted-foreground))] px-1 rounded font-mono">rough brushed aluminum</code> or <code className="bg-[hsl(var(--surface-1))] text-[hsl(var(--muted-foreground))] px-1 rounded font-mono">mirror-like chrome</code> to produce precise roughness and metalness mapping coefficients.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
