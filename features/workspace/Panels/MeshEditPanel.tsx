'use client';

import React, { useState } from 'react';
import {
  Box,
  Layers,
  Upload,
  FolderOpen,
  X,
  PlusSquare,
  MinusSquare,
  RefreshCw,
  BoxSelect,
  CircleDot,
  Brush,
  Lasso,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Sliders,
  Image as ImageIcon,
  Zap,
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { createUploadedMeshAsset } from '../types';
import { toast } from 'sonner';

export const MeshEditPanel: React.FC = () => {
  const {
    currentAsset,
    setCurrentAsset,
    assets,
    isExecuting,
    activeTask,
    runMeshEditing,
  } = useWorkspace();

  const [inputTab, setInputTab] = useState<'text' | 'image'>('text');
  const [editMode, setEditMode] = useState<'add' | 'remove' | 'replace'>('add');
  const [selectionTool, setSelectionTool] = useState<'box' | 'sphere' | 'brush' | 'lasso'>('box');
  const [showManipulator, setShowManipulator] = useState(true);

  // Text-guided editing states
  const [sourcePrompt, setSourcePrompt] = useState('A medieval knight with a steel armor');
  const [targetPrompt, setTargetPrompt] = useState('Add a leather cape on the back and detailed shoulder armor with lion emblem');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Image-guided editing states
  const [referenceImage, setReferenceImage] = useState<{ name: string; url: string; base64: string; size: string } | null>(null);
  const [imageStrength, setImageStrength] = useState(0.80);
  const [projectionMode, setProjectionMode] = useState<'front' | 'ortho' | 'perspective'>('front');
  const [preserveOriginalTexture, setPreserveOriginalTexture] = useState(true);
  const [imageSupplementaryPrompt, setImageSupplementaryPrompt] = useState('');

  // Advanced parameters
  const [editStrength, setEditStrength] = useState(0.80);
  const [fidelity, setFidelity] = useState(0.70);
  const [guidanceScale, setGuidanceScale] = useState(7.5);
  const [resolution, setResolution] = useState(512);

  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);

  const isRunning = isExecuting && (activeTask?.type === 'edit');

  const handleStartTextEdit = async () => {
    if (!targetPrompt.trim()) {
      toast.error('Prompt required', { description: 'Please enter a target edit prompt.' });
      return;
    }

    await runMeshEditing({
      mode: 'text',
      sourcePrompt,
      targetPrompt,
      resolution,
      bbox: {
        center: [0.0, 0.45, -0.15],
        dimensions: [0.42, 0.36, 0.50],
      },
    });
  };

  const handleStartImageEdit = async () => {
    if (!referenceImage) {
      toast.error('Image required', { description: 'Please upload a reference image to guide the mesh edit.' });
      return;
    }

    await runMeshEditing({
      mode: 'image',
      targetImageBase64: referenceImage.base64,
      targetPrompt: imageSupplementaryPrompt || 'Modify mesh matching reference image details',
      strength: imageStrength,
      resolution,
      bbox: {
        center: [0.0, 0.45, -0.15],
        dimensions: [0.42, 0.36, 0.50],
      },
    });
  };

  const handleUploadReferenceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] || '';
      const url = URL.createObjectURL(file);
      setReferenceImage({
        name: file.name,
        url,
        base64,
        size: `${(file.size / 1024).toFixed(1)} KB`,
      });
      toast.success('Reference image loaded for guidance');
    };
    reader.readAsDataURL(file);
  };

  const handleUploadNewMesh = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCurrentAsset(createUploadedMeshAsset(file));
  };

  return (
    <div id="panel-mesh-edit" className="flex flex-col h-full bg-[hsl(var(--surface-1))] text-white overflow-y-auto scrollbar-thin select-none">
      {/* Top Header Tabs: Edit with Text / Edit with Image */}
      <div className="p-3 border-b border-white/[0.08] bg-[hsl(var(--surface-1))] flex-shrink-0">
        <div className="flex gap-1 p-1 bg-[hsl(var(--surface-0))] rounded-xl border border-white/[0.08]">
          {(['text', 'image'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              id={`tab-edit-${tab}`}
              onClick={() => setInputTab(tab)}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-extrabold capitalize transition-all cursor-pointer ${
                inputTab === tab
                  ? 'bg-primary text-black shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {tab === 'text' ? 'Edit with Text' : 'Edit with Image'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 space-y-4 flex-1">
        {/* 1. Select Input Mesh */}
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
              onChange={handleUploadNewMesh}
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

        {/* 2. Edit Mode */}
        <div className="space-y-2 pt-2 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">
              2
            </span>
            <div>
              <div className="text-xs font-bold text-white">Edit Mode</div>
              <div className="text-[10px] text-zinc-400">Choose geometry alteration method</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'add', label: 'Add / Modify', desc: 'Add new details or change existing surface geometry', icon: PlusSquare },
              { id: 'remove', label: 'Remove', desc: 'Prune unwanted elements and hollow cavity sections', icon: MinusSquare },
              { id: 'replace', label: 'Replace', desc: 'Swap target region with freshly sculpted geometry', icon: RefreshCw },
            ].map((m) => {
              const Icon = m.icon;
              const isActive = editMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setEditMode(m.id as any)}
                  className={`p-2 rounded-xl border text-left flex flex-col justify-between h-24 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[hsl(var(--surface-2))] border-primary text-white shadow-md'
                      : 'bg-[hsl(var(--surface-0))] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:border-white/[0.12]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-zinc-500'}`} />
                  <div>
                    <div className="text-[11px] font-bold leading-tight">{m.label}</div>
                    <div className="text-[8px] text-zinc-500 line-clamp-2 mt-0.5 leading-snug">{m.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Selection Tools */}
        <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">
              3
            </span>
            <div>
              <div className="text-xs font-bold text-white">Selection Mask</div>
              <div className="text-[10px] text-zinc-400">Define the 3D bounding volume to edit</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 'box', label: 'Box', icon: BoxSelect },
              { id: 'sphere', label: 'Sphere', icon: CircleDot },
              { id: 'brush', label: 'Brush', icon: Brush },
              { id: 'lasso', label: 'Lasso', icon: Lasso },
            ].map((t) => {
              const Icon = t.icon;
              const isActive = selectionTool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectionTool(t.id as any)}
                  className={`py-2 px-1 rounded-xl border text-center flex flex-col items-center gap-1 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[hsl(var(--surface-2))] border-primary text-primary shadow-sm'
                      : 'bg-[hsl(var(--surface-0))] border-white/[0.06] text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[10px] font-bold">{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between p-2 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
            <div>
              <div className="text-xs font-semibold text-white">Show 3D Gizmo Manipulator</div>
              <div className="text-[9px] text-zinc-500">Transform bounding box in viewport</div>
            </div>
            <button
              type="button"
              onClick={() => setShowManipulator(!showManipulator)}
              className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${
                showManipulator ? 'bg-primary' : 'bg-[hsl(var(--surface-3))]'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${
                  showManipulator ? 'left-4.5 bg-black' : 'left-0.5 bg-zinc-400'
                }`}
              />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SUBSECTION: TEXT GUIDED EDITING                                           */}
        {/* ========================================================================= */}
        {inputTab === 'text' && (
          <div className="space-y-3 pt-2 border-t border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">
                4
              </span>
              <div>
                <div className="text-xs font-bold text-white">Sculpt Guidance Prompts</div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Current / Source Description (optional)</label>
              <input
                type="text"
                value={sourcePrompt}
                onChange={(e) => setSourcePrompt(e.target.value)}
                placeholder="e.g. A medieval knight with steel armor"
                className="w-full h-8 px-2.5 rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.08] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <label className="text-zinc-300 font-medium">Target / Edit Prompt</label>
                <span className="font-mono text-zinc-500">{targetPrompt.length}/500</span>
              </div>
              <textarea
                rows={3}
                value={targetPrompt}
                maxLength={500}
                onChange={(e) => setTargetPrompt(e.target.value)}
                placeholder="e.g. Add a leather cape on the back and detailed shoulder armor with lion emblem"
                className="w-full p-2 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary resize-none"
              />
            </div>

            {/* Advanced Settings Accordion */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                className="w-full py-1.5 flex items-center justify-between text-xs font-bold text-zinc-300 hover:text-white cursor-pointer"
              >
                <span>Advanced Parameters</span>
                {isAdvancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {isAdvancedOpen && (
                <div className="space-y-2.5 pt-2">
                  <div className="space-y-1 p-2 rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.06]">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-400">Edit Strength</span>
                      <span className="font-mono text-primary font-bold">{editStrength.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={editStrength}
                      onChange={(e) => setEditStrength(parseFloat(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  <div className="space-y-1 p-2 rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.06]">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-400">Geometry Fidelity</span>
                      <span className="font-mono text-primary font-bold">{fidelity.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.05}
                      value={fidelity}
                      onChange={(e) => setFidelity(parseFloat(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  <div className="space-y-1 p-2 rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.06]">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-400">Guidance Scale</span>
                      <span className="font-mono text-primary font-bold">{guidanceScale.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={1.0}
                      max={20.0}
                      step={0.5}
                      value={guidanceScale}
                      onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Action Button */}
            <div className="pt-2">
              <button
                type="button"
                id="btn-generate-edit"
                onClick={handleStartTextEdit}
                disabled={isRunning || (!currentAsset?.source?.viewUrl && !currentAsset?.source?.localUrl && !currentAsset?.source?.fileId)}
                className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-black/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isRunning ? 'Editing Mesh...' : 'Generate Text-Guided Edit'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBSECTION: IMAGE GUIDED EDITING                                          */}
        {/* ========================================================================= */}
        {inputTab === 'image' && (
          <div className="space-y-3.5 pt-2 border-t border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary text-black font-black text-[11px] flex items-center justify-center">
                4
              </span>
              <div>
                <div className="text-xs font-bold text-white">Reference Image Guidance</div>
                <div className="text-[10px] text-zinc-400">Upload visual reference to guide the sculpt edit</div>
              </div>
            </div>

            {/* Image Dropzone / Preview */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleUploadReferenceImage}
              className="hidden"
            />

            {referenceImage ? (
              <div className="p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08] relative group flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setReferenceImage(null)}
                  className="absolute top-2 right-2 p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                  title="Remove reference image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="w-14 h-14 rounded-lg overflow-hidden border border-white/[0.1] bg-black flex-shrink-0">
                  <img src={referenceImage.url} alt="Reference" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1 pr-6">
                  <div className="text-xs font-bold text-white truncate">{referenceImage.name}</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">{referenceImage.size} · Reference Active</div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="w-full p-4 rounded-xl border border-dashed border-white/[0.15] bg-[hsl(var(--surface-0))] hover:bg-[hsl(var(--surface-2))] text-center space-y-1 transition-colors cursor-pointer block"
              >
                <ImageIcon className="w-6 h-6 text-primary mx-auto" />
                <div className="text-xs font-semibold text-zinc-200">Upload Reference Image</div>
                <div className="text-[10px] text-zinc-500">PNG, JPG or WEBP reference for shape alignment</div>
              </button>
            )}

            {/* Projection Mode */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <label className="text-[11px] font-semibold text-zinc-200">Projection Alignment</label>
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-[hsl(var(--surface-1))] rounded-lg border border-white/[0.06]">
                {[
                  { id: 'front', label: 'Front Ortho' },
                  { id: 'ortho', label: 'Side Align' },
                  { id: 'perspective', label: 'Perspective' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setProjectionMode(mode.id as any)}
                    className={`py-1.5 text-[10px] font-bold rounded transition-all cursor-pointer ${
                      projectionMode === mode.id
                        ? 'bg-primary text-black'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Image Strength */}
            <div className="space-y-1.5 p-2.5 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-200">Image Influence Strength</span>
                <span className="font-mono text-primary font-bold">{(imageStrength * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min={0.10}
                max={1.00}
                step={0.05}
                value={imageStrength}
                onChange={(e) => setImageStrength(parseFloat(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
            </div>

            {/* Supplementary Prompt */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400">Supplementary Guidance (optional)</label>
              <input
                type="text"
                value={imageSupplementaryPrompt}
                onChange={(e) => setImageSupplementaryPrompt(e.target.value)}
                placeholder="e.g. Keep existing armor color, only sculpt lion crest"
                className="w-full h-8 px-2.5 rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.08] text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary"
              />
            </div>

            {/* Preserve Texture Toggle */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-[hsl(var(--surface-0))] border border-white/[0.08]">
              <div>
                <div className="text-[11px] font-semibold text-zinc-200">Preserve Mesh Base Texture</div>
                <div className="text-[9px] text-zinc-500">Retain original albedo and diffuse map colors</div>
              </div>
              <button
                type="button"
                onClick={() => setPreserveOriginalTexture(!preserveOriginalTexture)}
                className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${
                  preserveOriginalTexture ? 'bg-primary' : 'bg-[hsl(var(--surface-3))]'
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${preserveOriginalTexture ? 'left-4.5 bg-black' : 'left-0.5 bg-zinc-400'}`} />
              </button>
            </div>

            {/* Action */}
            <button
              type="button"
              id="btn-generate-image-edit"
              onClick={handleStartImageEdit}
              disabled={isRunning || !referenceImage || (!currentAsset?.source?.viewUrl && !currentAsset?.source?.localUrl && !currentAsset?.source?.fileId)}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-black/40 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isRunning ? 'Editing Mesh with Image...' : 'Generate Image-Guided Edit'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
