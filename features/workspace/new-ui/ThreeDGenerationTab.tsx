"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, Float } from '@react-three/drei';
import {
  Sparkles, Upload, RotateCcw, ChevronDown, ChevronUp, ChevronRight,
  Maximize2, Play, CheckCircle2, Clock, Check, Download, Layers,
  Box, Eye, Move, RotateCw, ZoomIn, Grid3X3, Sun, Focus,
  Sliders, Shield, Cpu, RefreshCw, FolderOpen, Info, Lock, ArrowRight,
  Activity, SlidersHorizontal, Settings, CheckSquare, X, ListFilter, Trash2,
  AlertTriangle,
} from 'lucide-react';

import { useGenerationStore } from '@/stores/useGenerationStore';
import { useUIStore } from '@/stores/useUIStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useGeneration } from '@/hooks/useGeneration';
import { useGenerationStatus, useWorkspaceModels } from '@/hooks/useBackendData';
import { HistoryItem } from '@/types/new-ui';
import { Skeleton } from '@/components/ux';
import { toast } from 'sonner';
import LayerVisibilityPanel from './LayerVisibilityPanel';
import AssetLayersPanel from './AssetLayersPanel';
import ExportDialog from './ExportDialog';

interface ThreeDGenerationTabProps {
  activeModel: any;
  onUpdateModel: (model: any) => void;
  history: HistoryItem[] | null;
  onLoadProject: (item: HistoryItem) => void;
}

// Model details and capability definitions matching high fidelity UI
const LOCAL_MODELS = [
  {
    id: 'triposr',
    name: 'TripoSR',
    label: 'TripoSR',
    installed: true,
    status: 'ready',
    vram_required_mb: 5324, // 5.2 GB
    speed_seconds: 12,
    supports: {
      text_to_3d: false,
      image_to_3d: true,
      texture_generation: true,
      rigging_animation: true,
      detail_enhancement: true,
      part_separation: true,
    },
    stats: {
      triangles: '2,402,118',
      vertices: '1,801,554',
      objects: '12',
      materials: '8',
      size: '128 MB',
    },
    colab_incompatible: false,
    colab_skip_reason: null,
  },
  {
    id: 'hunyuan3d-2',
    name: 'Hunyuan3D-2',
    label: 'Hunyuan3D-2',
    installed: true,
    status: 'ready',
    vram_required_mb: 7168, // 7 GB
    speed_seconds: 24,
    supports: {
      text_to_3d: true,
      image_to_3d: true,
      texture_generation: true,
      rigging_animation: false,
      detail_enhancement: true,
      part_separation: false,
    },
    stats: {
      triangles: '1,504,233',
      vertices: '1,120,490',
      objects: '1',
      materials: '4',
      size: '72 MB',
    },
    colab_incompatible: false,
    colab_skip_reason: null,
  }
];

// Interactive 3D mecha mesh with pedestal that changes shading on-the-fly
function InteractiveMesh({ activeModel, shading, wireframe }: { activeModel: any; shading: 'PBR' | 'Clay'; wireframe: boolean }) {
  const primaryColor = activeModel?.accentColor || "hsl(var(--primary))";

  // Create PBR metallic shader vs Clay ceramic shader materials
  const bodyMat = useMemo(() => {
    if (shading === 'Clay') {
      return <meshStandardMaterial color="hsl(var(--surface-3))" roughness={0.7} metalness={0.1} wireframe={wireframe} />;
    }
     return <meshStandardMaterial color="hsl(var(--surface-2))" roughness={0.2} metalness={0.8} wireframe={wireframe} />;
  }, [shading, wireframe]);

  const accentMat = useMemo(() => {
    if (shading === 'Clay') {
       return <meshStandardMaterial color="hsl(var(--muted-foreground))" roughness={0.6} metalness={0.15} wireframe={wireframe} />;
    }
    return <meshStandardMaterial color={primaryColor} roughness={0.3} metalness={0.9} wireframe={wireframe} emissive={primaryColor} emissiveIntensity={0.2} />;
  }, [shading, wireframe, primaryColor]);

  const jointMat = useMemo(() => {
    if (shading === 'Clay') {
      return <meshStandardMaterial color="hsl(var(--muted-foreground))" roughness={0.8} metalness={0.0} wireframe={wireframe} />;
    }
    return <meshStandardMaterial color="hsl(var(--surface-0))" roughness={0.5} metalness={0.6} wireframe={wireframe} />;
  }, [shading, wireframe]);

  return (
    <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.2}>
      <group position={[0, -0.3, 0]}>
        {/* Main Pedestal */}
        <mesh position={[0, -0.75, 0]} receiveShadow>
          <cylinderGeometry args={[1.5, 1.6, 0.15, 32]} />
          {shading === 'Clay' ? (
            <meshStandardMaterial color="hsl(var(--muted-foreground))" roughness={0.8} wireframe={wireframe} />
          ) : (
            <meshStandardMaterial color="hsl(var(--surface-0))" roughness={0.1} metalness={0.9} wireframe={wireframe} />
          )}
        </mesh>
        
        {/* Pedestal Inner Glow Ring */}
        {shading === 'PBR' && !wireframe && (
          <mesh position={[0, -0.66, 0]}>
            <torusGeometry args={[1.35, 0.02, 8, 32]} />
            <meshBasicMaterial color={primaryColor} />
          </mesh>
        )}

        {/* Torso */}
        <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 1.0, 0.6]} />
          {bodyMat}
        </mesh>

        {/* Chest Plate Plate */}
        <mesh position={[0, 0.8, 0.31]} castShadow receiveShadow>
          <boxGeometry args={[0.6, 0.4, 0.1]} />
          {accentMat}
        </mesh>

        {/* Left Shoulder Pad */}
        <mesh position={[-0.6, 1.1, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.35, 0.3, 0.45]} />
          {accentMat}
        </mesh>

        {/* Right Shoulder Pad */}
        <mesh position={[0.6, 1.1, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.35, 0.3, 0.45]} />
          {accentMat}
        </mesh>

        {/* Upper Arms */}
        <mesh position={[-0.55, 0.7, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.5, 12]} />
          {jointMat}
        </mesh>
        <mesh position={[0.55, 0.7, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.5, 12]} />
          {jointMat}
        </mesh>

        {/* Forearms */}
        <mesh position={[-0.55, 0.3, 0.15]} rotation={[0.4, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.15, 0.5, 0.15]} />
          {bodyMat}
        </mesh>
        <mesh position={[0.55, 0.3, 0.15]} rotation={[0.4, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.15, 0.5, 0.15]} />
          {bodyMat}
        </mesh>

        {/* Head Base Joint */}
        <mesh position={[0, 1.25, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 0.2, 12]} />
          {jointMat}
        </mesh>

        {/* Head */}
        <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.45, 0.35, 0.45]} />
          {bodyMat}
        </mesh>

        {/* Futuristic Visor/Eyes */}
        <mesh position={[0, 1.52, 0.23]}>
          <planeGeometry args={[0.3, 0.08]} />
          {shading === 'Clay' ? (
            <meshStandardMaterial color="hsl(var(--muted-foreground))" roughness={0.9} wireframe={wireframe} />
          ) : (
            <meshBasicMaterial color={primaryColor} />
          )}
        </mesh>

        {/* Thighs */}
        <mesh position={[-0.25, 0.1, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.15, 0.12, 0.4, 12]} />
          {bodyMat}
        </mesh>
        <mesh position={[0.25, 0.1, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.15, 0.12, 0.4, 12]} />
          {bodyMat}
        </mesh>

        {/* Calves */}
        <mesh position={[-0.25, -0.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.2, 0.5, 0.2]} />
          {accentMat}
        </mesh>
        <mesh position={[0.25, -0.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.2, 0.5, 0.2]} />
          {accentMat}
        </mesh>
      </group>
    </Float>
  );
}

export default function ThreeDGenerationTab({
  activeModel: parentActiveModel,
  onUpdateModel,
  history,
  onLoadProject,
}: ThreeDGenerationTabProps) {
  const { prompt, setPrompt, uploadedImage, setUploadedImage, mode, setMode, selectedModel, setSelectedModel } = useGenerationStore();
  const { generate, cancel, isGenerating, currentJob } = useGeneration();
  const { status: jobStatus } = useGenerationStatus(currentJob?.id || null);
  // Only models declared compatible with the mesh-generation workspace
  const {
    models: workspaceModels,
    loading: isLoadingWorkspaceModels,
    error: workspaceModelsError,
  } = useWorkspaceModels('mesh-generation');

  // Build the selectable list from the workspace-compatible pipelines,
  // enriched by the local spec matrix. Falls back to LOCAL_MODELS offline.
  const modelsList = useMemo(() => {
    if (workspaceModelsError || !workspaceModels || workspaceModels.length === 0) {
      return LOCAL_MODELS;
    }
    return workspaceModels.map((m: any) => {
      const mid = String(m.id ?? '');
      const label = m.label || m.name || mid;
      const local = LOCAL_MODELS.find(
        l => l.id === mid.toLowerCase() || l.name.toLowerCase() === String(label).toLowerCase()
      );
      const supports = m.supports || {};
      return {
        id: mid,
        name: label,
        label,
        installed: m.installed ?? m.status === 'ready',
        status: m.status || (m.installed ? 'ready' : 'not_installed'),
        vram_required_mb: m.vram_required_mb ?? local?.vram_required_mb ?? 0,
        speed_seconds: local?.speed_seconds ?? 0,
        supports: {
          text_to_3d: supports.text_to_3d ?? local?.supports.text_to_3d ?? false,
          image_to_3d: supports.image_to_3d ?? local?.supports.image_to_3d ?? false,
          texture_generation: supports.texture_generation ?? local?.supports.texture_generation ?? false,
          rigging_animation: supports.rigging_animation ?? local?.supports.rigging_animation ?? false,
          detail_enhancement: supports.detail_enhancement ?? local?.supports.detail_enhancement ?? false,
          part_separation: supports.part_separation ?? local?.supports.part_separation ?? false,
        },
        stats: local?.stats ?? {
          triangles: '0',
          vertices: '0',
          objects: '0',
          materials: '0',
          size: '0 MB',
        },
        colab_incompatible: m.colab_incompatible ?? local?.colab_incompatible ?? false,
        colab_skip_reason: m.colab_skip_reason ?? local?.colab_skip_reason ?? null,
      };
    });
  }, [workspaceModels, workspaceModelsError]);

  // Use the store's selectedModel as the single source of truth so this tab's
  // dropdown stays in sync with the rich ModelSelector (GeneratePanel/LeftSidebar)
  // and other tabs. ponytail: previously a local selectedModelId defaulted to
  // 'triposr' and never synced back, so selecting a model elsewhere left this
  // dropdown displaying the wrong model.
  const activeModel = useMemo(() => {
    return modelsList.find((m) => m.id === selectedModel) || modelsList[0];
  }, [modelsList, selectedModel]);

  // Ensure a default is selected so generation always has a provider.
  useEffect(() => {
    if (!selectedModel && modelsList.length > 0) {
      setSelectedModel(modelsList[0].id);
    }
  }, [selectedModel, modelsList, setSelectedModel]);

  // Sync back to workspace page container when active model details changes
  useEffect(() => {
    if (activeModel && onUpdateModel) {
      // Avoid infinite cycles by only updating when name or specs differ
      if (parentActiveModel?.id !== activeModel.id) {
        onUpdateModel({
          ...activeModel,
          accentColor: activeModel.id === 'triposr' ? 'hsl(var(--primary))' : 'hsl(var(--neon-blue))'
        });
      }
    }
  }, [activeModel, onUpdateModel, parentActiveModel]);

  // Handle active mode when model is selected (some models only support image-to-3d or text-to-3d)
  useEffect(() => {
    if (activeModel) {
      const supportsText = activeModel.supports.text_to_3d;
      const supportsImage = activeModel.supports.image_to_3d;
      if (!supportsText && mode === 'text-to-3d' && supportsImage) {
        setMode('image-to-3d');
      } else if (!supportsImage && mode === 'image-to-3d' && supportsText) {
        setMode('text-to-3d');
      }
    }
  }, [activeModel, mode, setMode]);

  // Update stats dynamically once job is completed (Bug 3 fix)
  useEffect(() => {
    if (currentJob?.status === 'completed' && currentJob.result && onUpdateModel) {
      const r = currentJob.result as any;
      onUpdateModel((prev: any) => ({
        ...prev,
        stats: {
          triangles: r.polygonCount ? r.polygonCount.toLocaleString() : prev?.stats?.triangles || '2,402,118',
          vertices: r.vertexCount ? r.vertexCount.toLocaleString() : prev?.stats?.vertices || '1,801,554',
          objects: r.objectCount ? r.objectCount.toLocaleString() : prev?.stats?.objects || '12',
          materials: r.textureResolution ? r.textureResolution : prev?.stats?.materials || '8',
          size: r.fileSize ? (r.fileSize / (1024 * 1024)).toFixed(2) + ' MB' : prev?.stats?.size || '128 MB',
        }
      }));
    }
  }, [currentJob?.status, currentJob?.result, onUpdateModel]);

  // Default prompt setup
  useEffect(() => {
    if (!prompt) {
      setPrompt('Futuristic mecha robot, highly detailed, PBR, cinematic lighting');
    }
  }, [prompt, setPrompt]);

  // Local Config states matching image
  // FIX: Mobile sidebar toggle state — sidebars collapsed by default on mobile
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);

  const [uploadedModel, setUploadedModel] = useState<File | null>(null);
  const [uploadedModelUrl, setUploadedModelUrl] = useState<string | null>(null);
  const [uploadedModelName, setUploadedModelName] = useState<string>('');

  const [viewMode, setViewMode] = useState<'Mesh' | 'Wireframe' | 'Texture'>('Mesh');
  const [shading, setShading] = useState<'PBR' | 'Clay'>('PBR');
  const [exportFormat, setExportFormat] = useState<'GLB' | 'FBX' | 'OBJ' | 'USDZ' | 'STL'>('GLB');

  const [showGrid, setShowGrid] = useState(true);
  const [showWireframe, setShowWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  const isColabIncompatible = Boolean(activeModel?.colab_incompatible);

  // Drag-and-drop reference image local overlay states
  const [isDragOver, setIsDragOver] = useState(false);

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(glb|gltf)$/i)) {
      toast.error('Please upload a .glb or .gltf file');
      return;
    }
    setUploadedModel(file);
    setUploadedModelName(file.name);
    const url = URL.createObjectURL(file);
    setUploadedModelUrl(url);
    toast.success(`Model loaded: ${file.name}`);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.size <= 10 * 1024 * 1024) { // 10MB limit
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedImage({
          file,
          preview: reader.result as string,
          width: 512,
          height: 512
        });
      };
      reader.readAsDataURL(file);
      toast.success('Image loaded for Image-to-3D pipeline.');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    
    // Support 3D model files (GLB/GLTF)
    if (file.name.match(/\.(glb|gltf)$/i)) {
      if (file.size > 100 * 1024 * 1024) {
        toast.error('Model file too large. Max 100MB.');
        return;
      }
      setUploadedModel(file);
      setUploadedModelName(file.name);
      const url = URL.createObjectURL(file);
      setUploadedModelUrl(url);
      toast.success(`3D Model imported: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }
    
    // Support image files for reference
    if (file.size <= 10 * 1024 * 1024 && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedImage({
          file,
          preview: reader.result as string,
          width: 512,
          height: 512
        });
      };
      reader.readAsDataURL(file);
      toast.success('Reference image dropped and loaded successfully.');
    }
  };

  const clearImage = () => {
    setUploadedImage(null);
  };

  // Derived progress percentage & active step description
  const derivedProgress = useMemo(() => {
    if (isGenerating) {
      return jobStatus?.progress ?? currentJob?.progress ?? 15;
    }
    return currentJob?.status === 'completed' ? 100 : 0;
  }, [isGenerating, jobStatus?.progress, currentJob?.progress, currentJob?.status]);

  const activeStageLabel = useMemo(() => {
    if (isGenerating) {
      return jobStatus?.stage || (currentJob as any)?.stage || 'Initializing Pipeline...';
    }
    if (currentJob?.status === 'completed') return 'Finished';
    if (currentJob?.status === 'failed') return 'Pipeline Failed';
    return 'Ready to Generate';
  }, [isGenerating, jobStatus?.stage, currentJob]);

  const { currentProject, setProject, addLayer } = useProjectStore();

  // Sync activeModel to project store when a generation completes
  useEffect(() => {
    if (currentJob?.status === 'completed' && currentJob?.result) {
      const r = currentJob.result as any;
      setProject({
        id: currentJob.id,
        name: activeModel?.name || 'Generated Model',
        modelUrl: r.modelUrl || r.downloadUrls?.glb || null,
        modelData: r,
        layers: [],
        metadata: {
          prompt: prompt || '',
          model: selectedModel || activeModel?.id,
          quality: 'standard',
          createdAt: new Date(),
        },
      });
    }
  }, [currentJob?.status, currentJob?.result]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-[hsl(var(--surface-0))] text-[hsl(var(--foreground))] relative" id="ai-3d-studio-workspace">
      
      {/* FIX: Mobile sidebar overlay backdrops */}
      {mobileLeftOpen && (
        <div className="fixed inset-0 z-30 bg-[hsl(var(--surface-0))/0.4] lg:hidden" onClick={() => setMobileLeftOpen(false)} aria-hidden="true" />
      )}
      {mobileRightOpen && (
        <div className="fixed inset-0 z-30 bg-[hsl(var(--surface-0))/0.4] lg:hidden" onClick={() => setMobileRightOpen(false)} aria-hidden="true" />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. LEFT SIDEBAR: GENERATION SETUP */}
      {/* FIX: On mobile (< lg), hidden off-screen by default, slides in as overlay when toggled */}
      {/* ───────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[300px] max-w-[85vw] bg-[hsl(var(--surface-0))] border-r border-[hsl(var(--border))] flex flex-col shrink-0 overflow-y-auto transition-transform duration-200 lg:static lg:inset-auto lg:z-auto lg:w-[280px] lg:max-w-none lg:translate-x-0 lg:transition-none ${
          mobileLeftOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        id="generation-setup-sidebar"
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between bg-[hsl(var(--surface-0))]">
          <span className="text-xs font-black uppercase tracking-widest text-[hsl(var(--foreground))]">GENERATION SETUP</span>
          <button onClick={() => setMobileLeftOpen(false)} className="lg:hidden p-1 rounded hover:bg-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" aria-label="Close sidebar">
            <X size={14} />
          </button>
          <ChevronUp size={14} className="text-[hsl(var(--muted-foreground))] cursor-pointer hover:text-[hsl(var(--foreground))] hidden lg:block" />
        </div>

        {/* Setup Options Form */}
        <div className="p-4 flex flex-col gap-5">
          {/* Model Selector */}
          <div className="flex flex-col gap-1.5" id="model-select-field">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Model</label>
              {isLoadingWorkspaceModels ? (
                <span className="text-[9px] font-bold text-[hsl(var(--muted-foreground))] font-mono">Loading models…</span>
              ) : activeModel?.installed ? (
                <span className="text-[9px] font-bold text-[hsl(var(--neon-green))] bg-[hsl(var(--neon-green))]/10 px-2 py-0.5 rounded-full border border-[hsl(var(--neon-green))]/20">Installed</span>
              ) : (
                <span className="text-[9px] font-bold text-[hsl(var(--neon-amber))] bg-[hsl(var(--neon-amber)/0.1)] px-2 py-0.5 rounded-full border border-amber-500/20">Not Installed</span>
              )}
            </div>
            
            <div className="relative">
                <select
                  value={activeModel?.id ?? ''}
                  onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isLoadingWorkspaceModels}
                className="w-full bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-xl pl-3 pr-8 py-2.5 text-xs font-semibold text-[hsl(var(--foreground))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))] transition-all appearance-none disabled:opacity-60 disabled:cursor-wait"
              >
                {modelsList.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}{!m.installed ? ' — not installed' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))] pointer-events-none" />
            </div>
          </div>

          {/* Supports Checklist (Gated based on model capability) */}
          <div className="flex flex-col gap-2 p-3 bg-[hsl(var(--surface-1))] rounded-xl border border-[hsl(var(--surface-3))]" id="capabilities-checklist">
            <span className="text-[9px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Supports</span>
            <div className="grid grid-cols-2 gap-y-2 gap-x-1.5 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">
              <div 
                onClick={() => activeModel.supports.text_to_3d && setMode('text-to-3d')}
                className={`flex items-center gap-1.5 p-1 rounded transition-all cursor-pointer ${
                  !activeModel.supports.text_to_3d ? 'opacity-30 cursor-not-allowed' : mode === 'text-to-3d' ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/30' : 'hover:bg-white/5'
                }`}
              >
                <Check size={11} className={activeModel.supports.text_to_3d ? "text-[hsl(var(--neon-green))]" : "text-[hsl(var(--muted-foreground))]"} />
                <span>Text to 3D</span>
              </div>
              <div 
                onClick={() => activeModel.supports.image_to_3d && setMode('image-to-3d')}
                className={`flex items-center gap-1.5 p-1 rounded transition-all cursor-pointer ${
                  !activeModel.supports.image_to_3d ? 'opacity-30 cursor-not-allowed' : mode === 'image-to-3d' ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/30' : 'hover:bg-white/5'
                }`}
              >
                <Check size={11} className={activeModel.supports.image_to_3d ? "text-[hsl(var(--neon-green))]" : "text-[hsl(var(--muted-foreground))]"} />
                <span>Image to 3D</span>
              </div>
              <div className={`flex items-center gap-1.5 ${!activeModel.supports.texture_generation && 'opacity-30'}`}>
                <Check size={11} className={activeModel.supports.texture_generation ? "text-[hsl(var(--neon-green))]" : "text-[hsl(var(--muted-foreground))]"} />
                <span>Texture Gen</span>
              </div>
              <div className={`flex items-center gap-1.5 ${!activeModel.supports.rigging_animation && 'opacity-30'}`}>
                <Check size={11} className={activeModel.supports.rigging_animation ? "text-[hsl(var(--neon-green))]" : "text-[hsl(var(--muted-foreground))]"} />
                <span>Rigging / Anim</span>
              </div>
              <div className={`flex items-center gap-1.5 ${!activeModel.supports.part_separation && 'opacity-30'}`}>
                <Check size={11} className={activeModel.supports.part_separation ? "text-[hsl(var(--neon-green))]" : "text-[hsl(var(--muted-foreground))]"} />
                <span>Part Separation</span>
              </div>
              <div className={`flex items-center gap-1.5 ${!activeModel.supports.detail_enhancement && 'opacity-30'}`}>
                <Check size={11} className={activeModel.supports.detail_enhancement ? "text-[hsl(var(--neon-green))]" : "text-[hsl(var(--muted-foreground))]"} />
                <span>Detail Enhance</span>
              </div>
            </div>
          </div>

          <div className="border-t border-[hsl(var(--border))] my-1" />

          {/* INPUT SECTION */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))] -mb-1">INPUT</span>
            
            {/* Prompt input with character count (disabled if text-to-3d is unsupported) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">Prompt</label>
              {!activeModel.supports.text_to_3d ? (
                <div className="bg-[hsl(var(--surface-1))]/50 border border-[hsl(var(--surface-3))]/60 p-3 rounded-xl text-[11px] text-[hsl(var(--muted-foreground))] font-medium flex gap-2">
                  <Lock size={12} className="shrink-0 mt-0.5" />
                  <span>Prompt disabled for {activeModel.name} (Image-to-3D only).</span>
                </div>
              ) : (
                <div className="relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
                    placeholder="Describe your 3D humanoid, mecha or asset in detail..."
                    className="w-full bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-xl p-3 text-xs text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] min-h-[85px] max-h-[140px] focus:outline-none focus:border-[hsl(var(--primary))] transition-all resize-none leading-relaxed font-semibold"
                    id="setup-prompt"
                  />
                  <span className="absolute bottom-2.5 right-2.5 text-[9px] font-mono font-bold text-[hsl(var(--muted-foreground))]">
                    {prompt.length} / 500
                  </span>
                </div>
              )}
            </div>

            {/* Reference Image Optional Drag & Drop Upload Zone (disabled if image-to-3d is unsupported) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">Reference Image (Optional)</label>
              {!activeModel.supports.image_to_3d ? (
                <div className="bg-[hsl(var(--surface-1))]/50 border border-[hsl(var(--surface-3))]/60 p-3 rounded-xl text-[11px] text-[hsl(var(--muted-foreground))] font-medium flex gap-2">
                  <Lock size={12} className="shrink-0 mt-0.5" />
                  <span>Image reference disabled for {activeModel.name}.</span>
                </div>
              ) : (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('image-uploader-btn')?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all text-center ${
                    isDragOver
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                      : uploadedImage
                        ? 'border-[hsl(var(--neon-green))]/30 bg-[hsl(var(--neon-green))]/5'
                        : 'border-[hsl(var(--surface-3))] bg-[hsl(var(--surface-1))]/55 hover:bg-[hsl(var(--surface-1))] hover:border-[hsl(var(--primary))]/50'
                  }`}
                >
                  <input
                    id="image-uploader-btn"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  {uploadedImage ? (
                    <>
                      <img src={uploadedImage.preview} alt="Reference Preview" className="w-full h-20 object-contain rounded-lg border border-[hsl(var(--surface-3))]" referrerPolicy="no-referrer" />
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-[hsl(var(--neon-green))] flex items-center gap-1">
                          <CheckCircle2 size={11} /> Ready
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); clearImage(); }} className="text-[10px] font-black text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] p-0.5 bg-rose-500/10 rounded">
                          Remove
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload size={18} className={isDragOver ? 'text-[hsl(var(--primary))] animate-bounce' : 'text-[hsl(var(--muted-foreground))]'} />
                      <span className="text-[11px] font-bold text-[hsl(var(--foreground))]">
                        Drag & drop or click to upload
                      </span>
                      <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">PNG, JPG, WEBP up to 10MB</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[hsl(var(--border))] my-1" />

          {/* 3D MODEL IMPORT — Drag & Drop or Click */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">IMPORT 3D MODEL</span>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('model-import-btn')?.click()}
              className={`border-2 border-dashed rounded-xl p-3 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all text-center ${
                uploadedModelUrl
                  ? 'border-[hsl(var(--neon-green))]/30 bg-[hsl(var(--neon-green))]/5'
                  : isDragOver
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                    : 'border-[hsl(var(--surface-3))] bg-[hsl(var(--surface-1))]/55 hover:bg-[hsl(var(--surface-1))] hover:border-[hsl(var(--primary))]/50'
              }`}
            >
              <input
                id="model-import-btn"
                type="file"
                accept=".glb,.gltf"
                onChange={handleModelUpload}
                className="hidden"
              />
              {uploadedModelUrl ? (
                <>
                  <Layers size={16} className="text-[hsl(var(--neon-green))]" />
                  <span className="text-[10px] font-bold text-[hsl(var(--neon-green))] truncate max-w-full">{uploadedModelName}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setUploadedModel(null); setUploadedModelUrl(null); setUploadedModelName(''); toast.info('Model removed'); }}
                    className="text-[9px] font-bold text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] mt-0.5"
                  >Remove</button>
                </>
              ) : (
                <>
                  <FolderOpen size={16} className="text-[hsl(var(--muted-foreground))]" />
                  <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">Drop GLB/GLTF or click</span>
                  <span className="text-[8px] text-[hsl(var(--muted-foreground))] font-mono">Import to viewer or remesh</span>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-[hsl(var(--border))] my-1" />

          {/* Advanced Settings */}
          <div 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between py-2.5 border-t border-[hsl(var(--border))] cursor-pointer text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            <span className="text-xs font-bold flex items-center gap-1.5">
              <SlidersHorizontal size={13} className={showAdvanced ? 'text-[hsl(var(--primary))]' : ''} />
              Advanced Settings
            </span>
            <ChevronRight size={13} className={`transition-transform duration-200 ${showAdvanced ? 'rotate-90 text-[hsl(var(--primary))]' : ''}`} />
          </div>

          {showAdvanced && (
            <div className="flex flex-col gap-3.5 bg-[hsl(var(--surface-1))]/50 border border-[hsl(var(--border))] rounded-xl p-3.5 mb-2 animate-fadeIn text-xs">
              {/* Geometry Resolution */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Geometry Quality</label>
                <div className="grid grid-cols-3 gap-1">
                  {['Standard', 'High', 'Ultra'].map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toast.success(`Quality set to ${q}`); }}
                      className="py-1 px-2 text-[10px] font-bold rounded bg-[hsl(var(--surface-0))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))] transition-all text-center"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Decimation Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">
                  <span>Mesh Decimation</span>
                  <span className="text-[hsl(var(--primary))]">30%</span>
                </div>
                <input 
                  type="range" 
                  min={0} 
                  max={90} 
                  defaultValue={30}
                  className="w-full accent-[hsl(var(--primary))] cursor-pointer h-1" 
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => { e.stopPropagation(); }}
                />
              </div>

              {/* Symmetry Switch */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Enforce Symmetry</span>
                <input 
                  type="checkbox" 
                  defaultChecked 
                  className="accent-[hsl(var(--primary))] h-3.5 w-3.5 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Texture Resolution */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Texture Resolution</label>
                <div className="grid grid-cols-3 gap-1">
                  {['1K', '2K', '4K'].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toast.success(`Texture set to ${r}`); }}
                      className="py-1 px-2 text-[10px] font-bold rounded bg-[hsl(var(--surface-0))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--foreground))] transition-all text-center"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Generate 3D Model Button */}
          {isColabIncompatible && (
            <div className="w-full flex items-center gap-2 p-3 rounded-xl bg-[hsl(var(--neon-amber)/0.1)] border border-[hsl(var(--neon-amber)/0.3)] text-[11px] text-[hsl(var(--neon-amber))]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                This model requires more VRAM than the current Google Colab runtime is designed to provide.
                Running it may cause GPU OOM, process termination, or runtime crash.
              </span>
            </div>
          )}
          <button
            onClick={isGenerating ? cancel : generate}
            className={`w-full font-black py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-[0_4px_24px_rgba(245,166,35,0.15)] ${
              isGenerating
                 ? 'bg-[hsl(var(--neon-pink))] hover:brightness-110 text-[hsl(var(--foreground))] shadow-[0_4px_24px_rgba(225,29,72,0.15)]'
                : isColabIncompatible
                  ? 'bg-[hsl(var(--surface-1))] text-[hsl(var(--muted-foreground))] cursor-not-allowed border border-[hsl(var(--border))/0.5]'
                : 'bg-[hsl(var(--primary))] hover:brightness-110 text-[hsl(var(--surface-0))] active:scale-[0.98]'
            }`}
            id="workspace-trigger-generation-btn"
            disabled={isColabIncompatible}
          >
            <Sparkles size={14} className={isGenerating ? "" : "fill-current"} />
            {isGenerating ? 'Cancel Generation' : isColabIncompatible ? 'Model Unavailable on Colab' : 'Generate 3D Model'}
          </button>
        </div>
      </aside>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. CENTER STAGE AND BOTTOM DOCKS */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[hsl(var(--surface-0))] relative min-h-[200px] lg:min-h-0" id="workspace-center-section">
        
        {/* Top Control bar */}
        <div className="h-14 bg-[hsl(var(--surface-0))] border-b border-[hsl(var(--border))] px-2 sm:px-4 flex items-center justify-between shrink-0 overflow-x-auto gap-2" id="viewer-header-control-bar">
          
          {/* FIX: Mobile sidebar toggle buttons */}
          <div className="flex items-center gap-1 lg:hidden shrink-0">
            <button onClick={() => { setMobileLeftOpen(true); setMobileRightOpen(false); }} className="p-2 rounded-lg hover:bg-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] active:scale-95" title="Open Settings">
              <Settings size={16} />
            </button>
            <button onClick={() => { setMobileRightOpen(true); setMobileLeftOpen(false); }} className="p-2 rounded-lg hover:bg-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] active:scale-95" title="Open Progress">
              <Activity size={16} />
            </button>
          </div>

          {/* View Mode segmented control */}
          <div className="flex items-center gap-1.5 bg-[hsl(var(--surface-1))] p-1 rounded-xl border border-[hsl(var(--surface-3))]">
            {(['Mesh', 'Wireframe', 'Texture'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setViewMode(m);
                  if (m === 'Wireframe') setShowWireframe(true);
                  else setShowWireframe(false);
                }}
                className={`px-3 py-1.5 text-[11px] font-black tracking-wide rounded-lg transition-all ${
                  viewMode === m
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-0))] shadow-sm font-bold'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            {/* Shading options */}
            <div className="flex items-center gap-1 bg-[hsl(var(--surface-1))] p-1 rounded-xl border border-[hsl(var(--surface-3))]">
              {(['PBR', 'Clay'] as const).map((shade) => (
                <button
                  key={shade}
                  onClick={() => setShading(shade)}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    shading === shade
                      ? 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/30 font-extrabold'
                      : 'text-[hsl(var(--muted-foreground))] border border-transparent hover:text-[hsl(var(--foreground))]'
                  }`}
                >
                  {shade}
                </button>
              ))}
            </div>

            {/* Custom toolbar buttons on the right */}
            <div className="flex items-center gap-1 border-l border-[hsl(var(--border))] pl-4 text-[hsl(var(--muted-foreground))]">
              <button onClick={() => setShowGrid(!showGrid)} className={`p-2 rounded hover:bg-[hsl(var(--surface-0))] hover:text-[hsl(var(--foreground))] transition-all ${showGrid ? 'text-[hsl(var(--primary))]' : ''}`} title="Toggle grid floor">
                <Grid3X3 size={14} />
              </button>
              <button className="p-2 rounded hover:bg-[hsl(var(--surface-0))] hover:text-[hsl(var(--foreground))] transition-all" title="Full screen">
                <Maximize2 size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* 3D Viewer Space — constrained height so it doesn't consume full viewport */}
        <div className="flex-1 relative bg-gradient-to-b from-[hsl(var(--surface-1))] via-[hsl(var(--surface-0))] to-[hsl(var(--surface-0))] overflow-hidden max-h-[55vh] lg:max-h-[60vh]" id="canvas-workspace">
          
          {/* Floating left toolbar — hidden on very small screens for space */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 hidden sm:flex flex-col gap-1.5 bg-[hsl(var(--surface-0))]/90 backdrop-blur-md border border-[hsl(var(--border))] p-1.5 rounded-xl text-[hsl(var(--muted-foreground))]">
            <button className="p-2 rounded-lg hover:bg-[hsl(var(--border))] text-[hsl(var(--primary))]" title="Pointer Mode">
              <Move size={14} />
            </button>
            <button 
              onClick={() => {
                const nextRotate = !autoRotate;
                setAutoRotate(nextRotate);
                toast.success(nextRotate ? 'Auto-rotation enabled' : 'Auto-rotation disabled', {
                  description: nextRotate ? 'The model will now rotate automatically.' : 'Automatic rotation paused.'
                });
              }}
              className={`p-2 rounded-lg hover:bg-[hsl(var(--border))] transition-all ${autoRotate ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 border border-[hsl(var(--primary))]/10' : 'hover:text-[hsl(var(--foreground))]'}`} 
              title="Toggle Auto Rotation"
            >
              <RotateCw size={14} className={autoRotate ? 'animate-spin' : ''} />
            </button>
            <button className="p-2 rounded-lg hover:bg-[hsl(var(--border))] hover:text-[hsl(var(--foreground))]" title="Pan Camera">
              <Move size={14} className="rotate-45" />
            </button>
            <button className="p-2 rounded-lg hover:bg-[hsl(var(--border))] hover:text-[hsl(var(--foreground))]" title="Zoom Camera">
              <ZoomIn size={14} />
            </button>
            <button className="p-2 rounded-lg hover:bg-[hsl(var(--border))] hover:text-[hsl(var(--foreground))]" title="Show Bounding Box">
              <Box size={14} />
            </button>
            <button className="p-2 rounded-lg hover:bg-[hsl(var(--border))] hover:text-[hsl(var(--foreground))]" title="Reset View">
              <Focus size={14} />
            </button>
          </div>

          {/* Orientation Axis Widget in top-right */}
          <div className="absolute right-4 top-4 z-10 bg-[hsl(var(--surface-0))]/90 backdrop-blur-md border border-[hsl(var(--border))] px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-[10px] font-mono font-black" id="orientation-indicator">
            <span className="text-[hsl(var(--destructive))]">X</span>
            <span className="text-[hsl(var(--neon-green))]">Y</span>
            <span className="text-[hsl(var(--neon-cyan))]">Z</span>
            <div className="w-4 h-4 border border-[hsl(var(--surface-3))] rounded flex items-center justify-center text-[8px] text-[hsl(var(--muted-foreground))]">U</div>
          </div>

          {/* Interactive ThreeD Canvas */}
          <div className="w-full h-full relative" id="standing-model-rendering-view">
            <Suspense fallback={
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[hsl(var(--surface-0))/0.5] backdrop-blur-sm z-10 gap-2">
                <RefreshCw size={24} className="text-[hsl(var(--primary))] animate-spin" />
                <span className="text-xs font-mono font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Compiling shaders...</span>
              </div>
            }>
              <Canvas shadows camera={{ position: [0, 1.8, 5.5], fov: 40, zoom: 0.7 }} className="w-full h-full">
                <ambientLight intensity={1.5} />
                <Environment preset="studio" />
                <directionalLight position={[10, 20, 10]} intensity={2.5} castShadow />
                <directionalLight position={[-10, -5, -10]} intensity={1.0} color="hsl(var(--primary))" />
                
                <InteractiveMesh 
                  activeModel={activeModel} 
                  shading={shading} 
                  wireframe={showWireframe} 
                />
                
                {showGrid && (
                  <Grid 
                    infiniteGrid 
                    fadeDistance={30} 
                     cellColor="hsl(var(--surface-0))"
                    sectionColor="hsl(var(--primary))" 
                    cellThickness={0.5} 
                    sectionThickness={1.0} 
                    position={[0, -1.05, 0]}
                  />
                )}
                <OrbitControls makeDefault enablePan enableZoom minDistance={1} maxDistance={15} autoRotate={autoRotate} autoRotateSpeed={1.5} />
              </Canvas>
            </Suspense>

            {/* Added Soon Placeholder overlays to respect previous truncation instruction of "Added soon" */}
            <div className="absolute bottom-4 left-4 z-10 bg-[hsl(var(--surface-0))]/70 backdrop-blur-sm border border-[hsl(var(--border))] px-3 py-1.5 rounded-lg text-[10px] font-bold text-[hsl(var(--muted-foreground))] hidden sm:block">
              3D Viewport • <span className="text-[hsl(var(--primary))]">Interactivity Active</span>
            </div>
          </div>

          {/* Bottom-right stats overlay matching high-fidelity mock — hidden on mobile for space */}
          <div className="absolute bottom-4 right-4 z-10 bg-[hsl(var(--surface-0))]/95 backdrop-blur-md border border-[hsl(var(--border))] rounded-xl p-3 flex-col gap-1.5 min-w-[130px] hidden sm:flex" id="viewport-stats-overlay">
            <span className="text-[9px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))] border-b border-[hsl(var(--border))] pb-1 mb-0.5">Asset Spec</span>
            <div className="grid grid-cols-2 gap-y-1 gap-x-3 text-[10px] font-mono">
              <span className="text-[hsl(var(--muted-foreground))] font-sans">Faces</span>
              <span className="font-extrabold text-right text-[hsl(var(--foreground))]">{activeModel?.stats?.triangles || '2.4M'}</span>
              <span className="text-[hsl(var(--muted-foreground))] font-sans">Vertices</span>
              <span className="font-extrabold text-right text-[hsl(var(--foreground))]">{activeModel?.stats?.vertices || '1.8M'}</span>
              <span className="text-[hsl(var(--muted-foreground))] font-sans">Objects</span>
              <span className="font-extrabold text-right text-[hsl(var(--foreground))]">{activeModel?.stats?.objects || '12'}</span>
              <span className="text-[hsl(var(--muted-foreground))] font-sans">Materials</span>
              <span className="font-extrabold text-right text-[hsl(var(--foreground))]">{activeModel?.stats?.materials || '8'}</span>
            </div>
          </div>

        {/* Layer Visibility Panel */}
        <LayerVisibilityPanel />

        {/* Asset Layers Panel */}
        <AssetLayersPanel />
      </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. RIGHT SIDEBAR: PROGRESS AND SPECS */}
      {/* FIX: On mobile (< lg), hidden off-screen by default, slides in as overlay when toggled */}
      {/* ───────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-[280px] max-w-[85vw] bg-[hsl(var(--surface-0))] border-l border-[hsl(var(--border))] flex flex-col shrink-0 overflow-y-auto transition-transform duration-200 lg:static lg:inset-auto lg:z-auto lg:w-[260px] lg:max-w-none lg:translate-x-0 lg:transition-none p-4 gap-4 ${
          mobileRightOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
        id="specs-and-progress-sidebar"
      >
        {/* FIX: Mobile close button for right sidebar */}
        <div className="flex items-center justify-between lg:hidden mb-2">
          <span className="text-xs font-black uppercase tracking-widest text-[hsl(var(--foreground))]">PROGRESS & SPECS</span>
          <button onClick={() => setMobileRightOpen(false)} className="p-1 rounded hover:bg-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" aria-label="Close sidebar">
            <X size={14} />
          </button>
        </div>
        
        {/* CARD 1: GENERATION PROGRESS */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-2xl p-4 flex flex-col gap-3" id="progress-container">
          <div className="flex items-center justify-between border-b border-[hsl(var(--surface-3))] pb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--foreground))]">GENERATION PROGRESS</span>
            <ChevronUp size={13} className="text-[hsl(var(--muted-foreground))]" />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs">
              <span className="font-extrabold text-[hsl(var(--primary))] text-[11px] uppercase tracking-wider">{activeStageLabel}</span>
              <span className="font-mono font-black text-[hsl(var(--primary))]">{derivedProgress}%</span>
            </div>
            {/* Progress Bar Fill */}
            <div className="w-full h-2 bg-[hsl(var(--border))] rounded-full overflow-hidden border border-[hsl(var(--surface-3))]">
              <div 
                className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] rounded-full shadow-[0_0_12px_rgba(245,166,35,0.4)] transition-all duration-300" 
                style={{ width: `${derivedProgress}%` }} 
              />
            </div>
          </div>

          {/* Timeline steps with timestamps matching screenshot */}
          <div className="flex flex-col gap-2.5 pt-2.5 font-mono text-[10px] border-t border-[hsl(var(--border))]/60">
            {[
              { label: 'Preparing', threshold: 10, duration: '00:12' },
              { label: 'Loading Model', threshold: 25, duration: '00:18' },
              { label: 'Generating Base Mesh', threshold: 38, duration: '01:24' },
              { label: 'Remeshing', threshold: 50, duration: '00:35' },
              { label: 'Generating Texture', threshold: 65, duration: '01:02' },
              { label: 'Part Separation', threshold: 75, duration: '00:48' },
              { label: 'Rigging', threshold: 85, duration: 'Pending' },
              { label: 'Optimization (LOD)', threshold: 95, duration: 'Pending' },
              { label: 'Exporting', threshold: 100, duration: 'Pending' },
            ].map((step, idx) => {
              const isDone = derivedProgress >= step.threshold || (currentJob?.status === 'completed');
              const isCurrent = derivedProgress < step.threshold && (idx === 0 || derivedProgress >= (idx > 0 ? [10, 25, 38, 50, 65, 75, 85, 95][idx - 1] : 0));

              if (isDone) {
                return (
                  <div key={step.label} className="flex items-center justify-between text-[hsl(var(--neon-green))]">
                    <div className="flex items-center gap-2">
                      <Check size={11} className="stroke-[3]" />
                      <span className="font-semibold">{step.label}</span>
                    </div>
                    <span className="text-zinc-600 font-bold">{step.duration !== 'Pending' ? step.duration : '00:15'}</span>
                  </div>
                );
              } else if (isCurrent && isGenerating) {
                return (
                  <div key={step.label} className="flex items-center justify-between text-[hsl(var(--primary))] font-extrabold animate-pulse">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))] animate-ping shrink-0" />
                      <span>{step.label}</span>
                    </div>
                    <span className="font-bold">In Progress</span>
                  </div>
                );
              } else {
                return (
                  <div key={step.label} className="flex items-center justify-between text-[hsl(var(--muted-foreground))]">
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-[hsl(var(--surface-2))]" />
                      <span>{step.label}</span>
                    </div>
                    <span>{step.duration}</span>
                  </div>
                );
              }
            })}
          </div>
        </div>

        {/* CARD 2: MODEL INFORMATION */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-2xl p-4 flex flex-col gap-3" id="model-info-container">
          <div className="flex items-center justify-between border-b border-[hsl(var(--surface-3))] pb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--foreground))]">MODEL INFORMATION</span>
            <ChevronUp size={13} className="text-[hsl(var(--muted-foreground))]" />
          </div>

          <div className="flex flex-col gap-2.5 text-xs font-semibold">
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">Model</span>
              <span className="font-extrabold text-[hsl(var(--foreground))] font-mono">{activeModel?.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">VRAM Usage</span>
              <span className="font-extrabold text-[hsl(var(--foreground))] font-mono">
                {activeModel?.id === 'triposr' ? '5.2 / 8 GB' : activeModel?.id === 'hunyuan3d-2' ? '7.0 / 8 GB' : '4.0 / 8 GB'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">Triangles</span>
              <span className="font-extrabold text-[hsl(var(--foreground))] font-mono">{activeModel?.stats?.triangles}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">Vertices</span>
              <span className="font-extrabold text-[hsl(var(--foreground))] font-mono">{activeModel?.stats?.vertices}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">Materials</span>
              <span className="font-extrabold text-[hsl(var(--foreground))] font-mono">{activeModel?.stats?.materials}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">Texture Res.</span>
              <span className="font-extrabold text-[hsl(var(--foreground))] font-mono">{activeModel?.id === 'triposr' || activeModel?.id === 'hunyuan3d-2' ? '4K (PBR)' : '--'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">File Size (Est.)</span>
              <span className="font-extrabold text-[hsl(var(--primary))] font-mono">{activeModel?.stats?.size}</span>
            </div>
          </div>
        </div>

        {/* CARD 3: EXPORT OPTIONS */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-2xl p-4 flex flex-col gap-3" id="export-container">
          <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--foreground))] border-b border-[hsl(var(--surface-3))] pb-2">EXPORT OPTIONS</span>

          {/* Formats row */}
          <div className="grid grid-cols-5 gap-1 bg-[hsl(var(--surface-2))] p-1 rounded-xl border border-[hsl(var(--surface-3))]">
            {(['GLB', 'FBX', 'OBJ', 'USDZ', 'STL'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setExportFormat(fmt)}
                className={`py-1.5 text-[10px] font-black rounded-lg transition-all ${
                  exportFormat === fmt
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-0))] shadow-sm'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>

          {/* Trigger Export Button */}
          <button
            onClick={() => setShowExportDialog(true)}
            className={`w-full font-black py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-[0_4px_16px_rgba(245,166,35,0.2)] ${
              currentJob?.status === 'completed' || currentJob?.result?.downloadUrls
                ? 'bg-[hsl(var(--primary))] hover:brightness-110 text-[hsl(var(--surface-0))] cursor-pointer'
                : 'bg-[hsl(var(--surface-1))] text-[hsl(var(--muted-foreground))] cursor-not-allowed border border-[hsl(var(--border))/0.5]'
            }`}
          >
            <Download size={13} className="stroke-[3]" />
            Export Project
          </button>
        </div>

        {/* CARD 4: RECENT PROJECTS / HISTORY */}
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-2xl p-4 flex flex-col gap-3" id="history-container">
          <div className="flex justify-between items-center border-b border-[hsl(var(--surface-3))] pb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--foreground))]">HISTORY</span>
            <span className="text-[9px] font-black text-[hsl(var(--primary))] hover:underline cursor-pointer">View All</span>
          </div>

          <div className="flex flex-col gap-2">
            {history && history.slice(0, 4).map((item, idx) => (
              <div
                key={item.id || idx}
                onClick={() => onLoadProject && onLoadProject(item)}
                className="flex items-center gap-3 p-2 rounded-xl bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] border border-[hsl(var(--surface-3))] cursor-pointer transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-[hsl(var(--surface-3))] flex items-center justify-center text-[hsl(var(--primary))] shrink-0 border border-[hsl(var(--surface-3))]">
                  <Box size={16} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-bold text-[hsl(var(--foreground))] truncate">{item.name}</span>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">{item.timestamp}</span>
                </div>
                <ChevronRight size={12} className="text-[hsl(var(--muted-foreground))]" />
              </div>
            ))}
            {history === null ? (
              <>
{Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--surface-3))]">
                  <Skeleton className="w-9 h-9 rounded-lg" />
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Skeleton className="h-3 w-2/3 rounded" />
                    <Skeleton className="h-2 w-1/3 rounded" />
                  </div>
                </div>
              ))}
</>
            ) : history.length === 0 ? (
              <div className="text-[11px] text-[hsl(var(--muted-foreground))] text-center py-4 font-mono">No project history yet.</div>
            ) : null}
          </div>
        </div>

      </aside>

      {/* Export Dialog */}
      {showExportDialog && (
        <ExportDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
        />
      )}

    </div>
  );
}
