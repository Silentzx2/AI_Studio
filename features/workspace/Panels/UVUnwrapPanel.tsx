'use client';

import React, { useState } from 'react';
import {
  Box,
  Layers,
  Upload,
  FolderOpen,
  X,
  Sliders,
  Sparkles,
  Check,
  ChevronDown,
  Settings2,
  Info,
  Maximize2,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { createUploadedMeshAsset } from '../types';
import { toast } from 'sonner';

export const UVUnwrapPanel: React.FC = () => {
  const {
    currentAsset,
    setCurrentAsset,
    assets,
    isExecuting,
    activeTask,
    runUVUnwrapGeneration,
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<'unwrap' | 'optimize' | 'advanced'>('unwrap');

  // Tab 1: Unwrap Settings
  const [unwrapModel, setUnwrapModel] = useState('partuv');
  const [packMethod, setPackMethod] = useState('blender');
  const [resolution, setResolution] = useState(2048);
  const [distortionThreshold, setDistortionThreshold] = useState(1.25);
  const [removeExistingUVs, setRemoveExistingUVs] = useState(true);
  const [saveIndividualParts, setSaveIndividualParts] = useState(false);
  const [generateUVPreview, setGenerateUVPreview] = useState(true);
  const [keepUDIMLayout, setKeepUDIMLayout] = useState(false);
  const [outputFormat, setOutputFormat] = useState('glb');
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  // Tab 2: Optimization Settings
  const [seamAngleThreshold, setSeamAngleThreshold] = useState(66);
  const [islandMargin, setIslandMargin] = useState(0.010);
  const [relaxationIterations, setRelaxationIterations] = useState(20);
  const [packingRotation, setPackingRotation] = useState<'free' | '90deg' | 'card'>('free');
  const [preventOverlaps, setPreventOverlaps] = useState(true);
  const [fillHoles, setFillHoles] = useState(true);

  // Tab 3: Advanced Settings
  const [udimLayout, setUdimLayout] = useState<'1001' | '2x2' | '4x1'>('1001');
  const [atlasAspect, setAtlasAspect] = useState<'1:1' | '2:1'>('1:1');
  const [curvatureWeight, setCurvatureWeight] = useState(0.65);
  const [gutterSpacing, setGutterSpacing] = useState(4);
  const [pinBoundaryVertices, setPinBoundaryVertices] = useState(false);
  const [mirrorSymmetry, setMirrorSymmetry] = useState(false);
  const [texelDensity, setTexelDensity] = useState(1024);

  const isRunning = isExecuting && (activeTask?.type === 'remesh' || activeTask?.type === 'uv');

  const handleStartUnwrap = async () => {
    await runUVUnwrapGeneration({
      distortionThreshold,
      packMethod,
      outputFormat,
      saveIndividualParts,
    });
  };

  const handleOptimizeUVs = async () => {
    toast.info('Applying seam relaxation and island packing...');
    await runUVUnwrapGeneration({
      distortionThreshold,
      packMethod,
      outputFormat,
      saveIndividualParts,
      modelParameters: {
        seam_angle: seamAngleThreshold,
        island_margin: islandMargin,
        iterations: relaxationIterations,
        packing_rotation: packingRotation,
        prevent_overlaps: preventOverlaps,
        fill_holes: fillHoles,
      },
    });
  };

  const handleAdvancedBake = async () => {
    toast.info('Executing advanced UV unwrap with multi-tile UDIM...');
    await runUVUnwrapGeneration({
      distortionThreshold,
      packMethod,
      outputFormat,
      saveIndividualParts,
      modelParameters: {
        udim: udimLayout !== '1001',
        udim_layout: udimLayout,
        aspect_ratio: atlasAspect,
        curvature_weight: curvatureWeight,
        gutter_spacing: gutterSpacing,
        pin_boundary: pinBoundaryVertices,
        mirror_symmetry: mirrorSymmetry,
        texel_density: texelDensity,
      },
    });
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const handleUploadNew = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCurrentAsset(createUploadedMeshAsset(file));
  };

  return (
    <div id="panel-uv-unwrap" className="flex flex-col h-full bg-[hsl(var(--surface-1))] text-white overflow-y-auto scrollbar-thin select-none">
      {/* Top Header Pill Tabs */}
      <div className="p-3 border-b border-white/[0.08] bg-[hsl(var(--surface-1))] flex-shrink-0">
        <div className="flex gap-1 p-1 bg-[hsl(var(--surface-0))] rounded-xl border border-white/[0.08]">
          {(['unwrap', 'optimize', 'advanced'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              id={`tab-uv-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-extrabold capitalize transition-all cursor-pointer ${
                activeTab === tab
                  ? 'bg-primary text-black shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 space-y-4 flex-1">
        {/* ========================================================================= */}
        {/* TAB 1: UNWRAP (Primary Mesh & Standard UV Workflow)                       */}
        {/* ========================================================================= */}
        {activeTab === 'unwrap' && (
          <div className="space-y-4">
            {/* Step 1: Select Input Mesh */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">
                  1
                </span>
                <div>
                  <div className="text-xs font-bold text-white">Select Input Mesh</div>
                  <div className="text-[10px] text-zinc-400">Choose a mesh from your assets or upload a new one</div>
                </div>
              </div>

              {currentAsset ? (
                <div className="p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08] relative group">
                  <button
                    type="button"
                    onClick={() => setCurrentAsset(null as any)}
                    className="absolute top-2 right-2 p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                    title="Remove selected mesh"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-lg bg-[hsl(var(--surface-2))] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                      <Box className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1 pr-6">
                      <div className="text-xs font-bold text-white truncate">{currentAsset.name || 'knight_character.glb'}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        GLB · {currentAsset.fileSize || '12.4 MB'} · {currentAsset.faces ? `${Math.round(currentAsset.faces / 1000)}K` : '248K'} faces
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-white/[0.15] bg-[hsl(var(--surface-0))] text-center space-y-1">
                  <Box className="w-6 h-6 text-zinc-500 mx-auto" />
                  <div className="text-xs font-semibold text-zinc-300">No mesh selected</div>
                  <div className="text-[10px] text-zinc-500">Pick from assets below or upload a GLB/OBJ</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowAssetPicker(!showAssetPicker)}
                  className="py-2 px-2.5 rounded-xl bg-[hsl(var(--surface-0))] hover:bg-[hsl(var(--surface-2))] border border-white/[0.08] text-zinc-300 hover:text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-primary" />
                  <span>From Assets</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".glb,.gltf,.obj,.ply,.stl"
                  onChange={handleUploadNew}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2 px-2.5 rounded-xl bg-[hsl(var(--surface-0))] hover:bg-[hsl(var(--surface-2))] border border-white/[0.08] text-zinc-300 hover:text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-primary" />
                  <span>Upload New</span>
                </button>
              </div>

              {showAssetPicker && (
                <div className="p-2 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.1] max-h-40 overflow-y-auto space-y-1">
                  <div className="text-[10px] font-bold text-zinc-400 px-1">Recent 3D Assets</div>
                  {assets.filter(a => a.category === 'mesh' || a.source?.viewUrl || a.source?.localUrl).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setCurrentAsset(a);
                        setShowAssetPicker(false);
                      }}
                      className="w-full text-left p-1.5 rounded-lg hover:bg-[hsl(var(--surface-2))] flex items-center justify-between text-xs text-zinc-300 hover:text-white cursor-pointer"
                    >
                      <span className="truncate max-w-[160px]">{a.name}</span>
                      <span className="text-[9px] font-mono text-zinc-500">{a.faces ? `${Math.round(a.faces / 1000)}k` : '3D'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Unwrap Settings */}
            <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">
                  2
                </span>
                <div>
                  <div className="text-xs font-bold text-white">Unwrap Settings</div>
                  <div className="text-[10px] text-zinc-400">Configure UV unwrapping parameters</div>
                </div>
              </div>

              {/* Unwrap Model */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-300">Unwrap Model</label>
                <div className="relative">
                  <select
                    value={unwrapModel}
                    onChange={(e) => setUnwrapModel(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08] text-xs font-semibold text-white appearance-none focus:outline-none focus:border-primary"
                  >
                    <option value="partuv">PartUV (Recommended)</option>
                    <option value="blender">Blender Smart UV Project</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <div className="text-[10px] text-zinc-500">High quality UV unwrapping with minimal area distortion</div>
              </div>

              {/* Pack Method */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-300">Pack Method</label>
                <div className="relative">
                  <select
                    value={packMethod}
                    onChange={(e) => setPackMethod(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08] text-xs font-semibold text-white appearance-none focus:outline-none focus:border-primary"
                  >
                    <option value="blender">Blender Pack Islands (Built-in)</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <div className="text-[10px] text-zinc-500">Optimal chart packing for game-ready textured assets</div>
              </div>

              {/* Texture Resolution */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-300">Texture Resolution</label>
                <div className="relative">
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(Number(e.target.value))}
                    className="w-full h-9 px-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08] text-xs font-semibold text-white appearance-none focus:outline-none focus:border-primary"
                  >
                    <option value={1024}>1024 × 1024</option>
                    <option value={2048}>2048 × 2048 (Standard)</option>
                    <option value={4096}>4096 × 4096 (High-Res)</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Distortion Threshold */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-zinc-300">Distortion Threshold</span>
                  <span className="font-mono text-primary font-bold">{distortionThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={1.00}
                  max={3.00}
                  step={0.05}
                  value={distortionThreshold}
                  onChange={(e) => setDistortionThreshold(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-zinc-500">
                  <span>1.00 (Minimal stretch)</span>
                  <span>3.00 (Fewer seams)</span>
                </div>
              </div>

              {/* Toggle Switches */}
              <div className="space-y-2 pt-1">
                {[
                  {
                    id: 'toggle-remove-uv',
                    title: 'Remove Existing UVs',
                    desc: 'Strip existing UV coordinates before fresh unwrapping',
                    checked: removeExistingUVs,
                    setter: setRemoveExistingUVs,
                  },
                  {
                    id: 'toggle-save-parts',
                    title: 'Save Individual Parts',
                    desc: 'Export UVs separated for each semantic part',
                    checked: saveIndividualParts,
                    setter: setSaveIndividualParts,
                  },
                  {
                    id: 'toggle-generate-preview',
                    title: 'Generate UV Preview',
                    desc: 'Render interactive 2D layout in UV Inspector',
                    checked: generateUVPreview,
                    setter: setGenerateUVPreview,
                  },
                  {
                    id: 'toggle-keep-udim',
                    title: 'Keep UDIM Layout',
                    desc: 'Distribute charts across multiple 0..1 UV tiles',
                    checked: keepUDIMLayout,
                    setter: setKeepUDIMLayout,
                  },
                ].map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-white/[0.02]">
                    <div className="min-w-0 pr-2">
                      <div className="text-[11px] font-semibold text-zinc-200">{t.title}</div>
                      <div className="text-[9px] text-zinc-500 leading-tight">{t.desc}</div>
                    </div>
                    <button
                      type="button"
                      id={t.id}
                      onClick={() => t.setter(!t.checked)}
                      className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${
                        t.checked ? 'bg-primary' : 'bg-[hsl(var(--surface-3))]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${
                          t.checked ? 'left-4.5 bg-black' : 'left-0.5 bg-zinc-400'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 3: Output Format */}
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">
                  3
                </span>
                <div>
                  <div className="text-xs font-bold text-white">Output Format</div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="relative">
                  <select
                    value={outputFormat}
                    onChange={(e) => setOutputFormat(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08] text-xs font-semibold text-white appearance-none focus:outline-none focus:border-primary"
                  >
                    <option value="glb">GLB (Binary 3D with embedded UVs)</option>
                    <option value="obj">OBJ (Wavefront with MTL UV mapping)</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                id="btn-start-uv-unwrap"
                onClick={handleStartUnwrap}
                disabled={isRunning || (!currentAsset?.source?.viewUrl && !currentAsset?.source?.localUrl && !currentAsset?.source?.fileId)}
                className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-black/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>{isRunning ? 'Unwrapping Mesh...' : 'Start UV Unwrap'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: OPTIMIZE (Seam Relaxation, Margin, Gutter, Overlap Prevention)     */}
        {/* ========================================================================= */}
        {activeTab === 'optimize' && (
          <div className="space-y-4">
            <div className="p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08] space-y-1">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-white">UV Layout Optimization</span>
              </div>
              <p className="text-[10px] text-zinc-400 leading-relaxed">
                Fine-tune seam placement angles, island padding margins, and boundary relaxation iterations.
              </p>
            </div>

            {/* Seam Angle Threshold */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-200">Seam Cutting Angle</span>
                <span className="font-mono text-primary font-bold">{seamAngleThreshold}°</span>
              </div>
              <input
                type="range"
                min={30}
                max={89}
                step={1}
                value={seamAngleThreshold}
                onChange={(e) => setSeamAngleThreshold(parseInt(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-zinc-500">
                <span>30° (More cuts / Less stretch)</span>
                <span>89° (Fewer seams / Organic)</span>
              </div>
            </div>

            {/* Island Margin / Padding */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-200">Island Margin (Padding)</span>
                <span className="font-mono text-primary font-bold">{(islandMargin * 100).toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min={0.002}
                max={0.050}
                step={0.002}
                value={islandMargin}
                onChange={(e) => setIslandMargin(parseFloat(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="text-[9px] text-zinc-500">
                Spacing buffer between UV charts to eliminate texture bleeding across mipmaps.
              </div>
            </div>

            {/* Stretch Relaxation Iterations */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-200">Relaxation Iterations</span>
                <span className="font-mono text-primary font-bold">{relaxationIterations} passes</span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={relaxationIterations}
                onChange={(e) => setRelaxationIterations(parseInt(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="text-[9px] text-zinc-500">
                Laplacian smoothing iterations to equalize texel density across irregular curved surfaces.
              </div>
            </div>

            {/* Packing Rotation */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <label className="text-[11px] font-semibold text-zinc-200">Island Rotation Strategy</label>
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-[hsl(var(--surface-1))] rounded-lg border border-white/[0.06]">
                {[
                  { id: 'free', label: 'Free (360°)' },
                  { id: '90deg', label: '90° Steps' },
                  { id: 'card', label: 'Card Align' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPackingRotation(opt.id as any)}
                    className={`py-1.5 text-[10px] font-bold rounded transition-all cursor-pointer ${
                      packingRotation === opt.id
                        ? 'bg-primary text-black'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optimization Toggles */}
            <div className="space-y-2 p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold text-zinc-200">Prevent Island Overlaps</div>
                  <div className="text-[9px] text-zinc-500">Strict bounding box collision check</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreventOverlaps(!preventOverlaps)}
                  className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${
                    preventOverlaps ? 'bg-primary' : 'bg-[hsl(var(--surface-3))]'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${preventOverlaps ? 'left-4.5 bg-black' : 'left-0.5 bg-zinc-400'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.04]">
                <div>
                  <div className="text-[11px] font-semibold text-zinc-200">Fill Interior Island Holes</div>
                  <div className="text-[9px] text-zinc-500">Pack smaller charts inside concave donut regions</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFillHoles(!fillHoles)}
                  className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${
                    fillHoles ? 'bg-primary' : 'bg-[hsl(var(--surface-3))]'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${fillHoles ? 'left-4.5 bg-black' : 'left-0.5 bg-zinc-400'}`} />
                </button>
              </div>
            </div>

            {/* Action */}
            <button
              type="button"
              onClick={handleOptimizeUVs}
              disabled={isRunning || (!currentAsset?.source?.viewUrl && !currentAsset?.source?.localUrl && !currentAsset?.source?.fileId)}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-black/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isRunning ? 'Optimizing UVs...' : 'Optimize & Relax UVs'}</span>
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: ADVANCED (UDIM Tiles, Atlas Aspect, Curvature Seams, Texel Density) */}
        {/* ========================================================================= */}
        {activeTab === 'advanced' && (
          <div className="space-y-4">
            <div className="p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08] space-y-1">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-white">Production UV Architecture</span>
              </div>
              <p className="text-[10px] text-zinc-400 leading-relaxed">
                Multi-tile UDIM distribution, texel density equalization, and curvature-weighted boundary pinning.
              </p>
            </div>

            {/* UDIM Multi-Tile Layout */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <label className="text-[11px] font-semibold text-zinc-200">UDIM Layout Architecture</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: '1001', label: 'Single Tile', desc: '1001 (0..1 UV)' },
                  { id: '2x2', label: '2×2 Grid', desc: '1001 - 1004' },
                  { id: '4x1', label: '4×1 Strip', desc: '1001 - 1004 U' },
                ].map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setUdimLayout(u.id as any)}
                    className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                      udimLayout === u.id
                        ? 'bg-[hsl(var(--surface-2))] border-primary text-white'
                        : 'bg-[hsl(var(--surface-1))] border-white/[0.06] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="text-[11px] font-bold">{u.label}</div>
                    <div className="text-[8px] text-zinc-500 mt-0.5">{u.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Texture Atlas Aspect Ratio */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <label className="text-[11px] font-semibold text-zinc-200">Texture Atlas Aspect Ratio</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: '1:1', label: 'Square (1:1)', desc: 'Standard 2048 × 2048' },
                  { id: '2:1', label: 'Wide (2:1)', desc: 'Panoramic 4096 × 2048' },
                ].map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAtlasAspect(a.id as any)}
                    className={`p-2 rounded-lg border text-center transition-all cursor-pointer ${
                      atlasAspect === a.id
                        ? 'bg-[hsl(var(--surface-2))] border-primary text-white'
                        : 'bg-[hsl(var(--surface-1))] border-white/[0.06] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <div className="text-[11px] font-bold">{a.label}</div>
                    <div className="text-[8px] text-zinc-500 mt-0.5">{a.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Curvature Seam Weighting */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-200">Curvature Seam Weighting</span>
                <span className="font-mono text-primary font-bold">{curvatureWeight.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.0}
                max={1.0}
                step={0.05}
                value={curvatureWeight}
                onChange={(e) => setCurvatureWeight(parseFloat(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="text-[9px] text-zinc-500">
                Pushes seams into concave crevices and hidden folds to hide visible texture seams.
              </div>
            </div>

            {/* Texel Density Target */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-200">Target Texel Density</span>
                <span className="font-mono text-primary font-bold">{texelDensity} px/m</span>
              </div>
              <input
                type="range"
                min={256}
                max={2048}
                step={128}
                value={texelDensity}
                onChange={(e) => setTexelDensity(parseInt(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
            </div>

            {/* Advanced Toggles */}
            <div className="space-y-2 p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold text-zinc-200">Mirror Symmetry Unwrapping</div>
                  <div className="text-[9px] text-zinc-500">Overlay identical left/right charts to save texture space</div>
                </div>
                <button
                  type="button"
                  onClick={() => setMirrorSymmetry(!mirrorSymmetry)}
                  className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${
                    mirrorSymmetry ? 'bg-primary' : 'bg-[hsl(var(--surface-3))]'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${mirrorSymmetry ? 'left-4.5 bg-black' : 'left-0.5 bg-zinc-400'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.04]">
                <div>
                  <div className="text-[11px] font-semibold text-zinc-200">Pin Boundary Vertices</div>
                  <div className="text-[9px] text-zinc-500">Prevent border perimeter drift during conformal unwrap</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPinBoundaryVertices(!pinBoundaryVertices)}
                  className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${
                    pinBoundaryVertices ? 'bg-primary' : 'bg-[hsl(var(--surface-3))]'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${pinBoundaryVertices ? 'left-4.5 bg-black' : 'left-0.5 bg-zinc-400'}`} />
                </button>
              </div>
            </div>

            {/* Action */}
            <button
              type="button"
              onClick={handleAdvancedBake}
              disabled={isRunning || (!currentAsset?.source?.viewUrl && !currentAsset?.source?.localUrl && !currentAsset?.source?.fileId)}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-black/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>{isRunning ? 'Processing UDIM Bake...' : 'Execute Advanced UV Bake & Pack'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
