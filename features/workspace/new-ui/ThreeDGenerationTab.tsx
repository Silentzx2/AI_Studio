"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, useRef, useMemo } from 'react';
import anime from 'animejs';
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
import { uploadService } from '@/services/uploadService';
import LayerVisibilityPanel from './LayerVisibilityPanel';
import AssetLayersPanel from './AssetLayersPanel';
import ExportDialog from './ExportDialog';
import { ThreeDViewer } from '@/features/workspace/viewer/ThreeDViewer';

interface ThreeDGenerationTabProps {
  activeModel: any;
  onUpdateModel: (model: any) => void;
  history: HistoryItem[] | null;
  onLoadProject: (item: HistoryItem) => void;
}

// Model details and capability definitions matching high fidelity UI
const LOCAL_MODELS = [
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
  // 'hunyuan3d-2' and never synced back, so selecting a model elsewhere left this
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
          accentColor: 'hsl(var(--neon-blue))'
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

  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [modelUploadProgress, setModelUploadProgress] = useState(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);

  const [viewMode, setViewMode] = useState<'Mesh' | 'Wireframe' | 'Texture'>('Mesh');
  useEffect(() => {
    // Comprehensive entrance animations for the workspace
    anime({
      targets: '#three-d-gen-left-sidebar > div',
      opacity: [0, 1],
      translateX: [-20, 0],
      delay: anime.stagger(40),
      easing: 'easeOutQuad',
      duration: 500
    });

    anime({
      targets: '#specs-and-progress-sidebar > div',
      opacity: [0, 1],
      translateX: [20, 0],
      delay: anime.stagger(40),
      easing: 'easeOutQuad',
      duration: 500
    });
  }, []);

  const [shading, setShading] = useState<'PBR' | 'Clay'>('PBR');
  const [exportFormat, setExportFormat] = useState<'GLB' | 'FBX' | 'OBJ' | 'USDZ' | 'STL'>('GLB');

  const [showWireframe, setShowWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  const isColabIncompatible = Boolean(activeModel?.colab_incompatible);

  // Drag-and-drop reference image local overlay states
  const [isDragOver, setIsDragOver] = useState(false);

  const handleModelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(glb|gltf)$/i)) {
      toast.error('Please upload a .glb or .gltf file');
      return;
    }
    setIsUploadingModel(true);
    setModelUploadProgress(0);
    try {
      const { url } = await uploadService.uploadWithProgress(file, (progress) => {
        setModelUploadProgress(progress.percent);
      }, '/api/v1/upload/model');
      const blobUrl = URL.createObjectURL(file);
      setUploadedModel(file);
      setUploadedModelName(file.name);
      setUploadedModelUrl(blobUrl);

      // Immediate local preview — don't wait for backend round-trip
      window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: blobUrl } }));

      // AnimeJS animation for successful load
      anime({
        targets: '#model-import-container',
        scale: [1.02, 1],
        boxShadow: ['0 0 20px hsl(var(--primary)/0.5)', '0 0 0px hsl(var(--primary)/0)'],
        duration: 800,
        easing: 'easeOutElastic(1, .8)'
      });

      toast.success(`Model loaded: ${file.name}`);
    } catch (err) {
      toast.error('Failed to upload model');
    } finally {
      setIsUploadingModel(false);
      setModelUploadProgress(0);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.size <= 10 * 1024 * 1024) { // 10MB limit
      setIsUploadingImage(true);
      setImageUploadProgress(0);
      try {
        const { url, width, height } = await uploadService.uploadWithProgress(file, (progress) => {
          setImageUploadProgress(progress.percent);
        }, '/api/v1/upload/image');
        setUploadedImage({
          file,
          preview: url,
          width: width || 512,
          height: height || 512
        });
        setMode('image-to-3d');
        toast.success('Image loaded for Image-to-3D pipeline.');
      } catch (err) {
        toast.error('Failed to upload image');
      } finally {
        setIsUploadingImage(false);
        setImageUploadProgress(0);
      }
    } else if (file) {
      toast.error('File size must be under 10MB');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) {
      setIsDragOver(true);
      const targetId = (e.currentTarget as HTMLElement).id;
      if (targetId) {
        anime({
          targets: `#${targetId}`,
          scale: 1.05,
          boxShadow: '0 0 15px hsl(var(--primary)/0.3)',
          duration: 300,
          easing: 'easeOutQuad'
        });
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const targetId = (e.currentTarget as HTMLElement).id;
    if (targetId) {
      anime({
        targets: `#${targetId}`,
        scale: 1,
        boxShadow: '0 0 0px hsl(var(--primary)/0)',
        duration: 300,
        easing: 'easeOutQuad'
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const targetId = (e.currentTarget as HTMLElement).id;
    if (targetId) {
      anime({
        targets: `#${targetId}`,
        scale: 1,
        boxShadow: '0 0 0px hsl(var(--primary)/0)',
        duration: 300,
        easing: 'easeOutQuad'
      });
    }
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
      window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url } }));
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
        <div className="flex flex-col gap-6" id="three-d-gen-sidebar-content">
          
          {/* SECTION: ENGINE CONFIGURATION */}
          <div className="flex flex-col gap-4 animate-slide-in">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Engine Config</span>
              <Cpu size={12} className="text-[hsl(var(--primary))]" />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[10px] font-bold">
                  <span className="text-[hsl(var(--muted-foreground))]">Model</span>
                  {activeModel?.installed ? (
                    <span className="text-[hsl(var(--neon-green))] flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-green))] animate-pulse" />
                      Active
                    </span>
                  ) : (
                    <span className="text-[hsl(var(--neon-amber))]">Not Ready</span>
                  )}
                </div>
                <div className="relative group">
                  <select
                    value={activeModel?.id ?? ''}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={isLoadingWorkspaceModels}
                    className="w-full bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-xl pl-3 pr-8 py-2.5 text-[11px] font-black text-[hsl(var(--foreground))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))] transition-all appearance-none disabled:opacity-60 disabled:cursor-wait shadow-sm group-hover:border-[hsl(var(--primary))/0.3]"
                  >
                    {modelsList.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}{!m.installed ? ' (Offline)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))] pointer-events-none group-hover:text-[hsl(var(--primary))] transition-colors" />
                </div>
              </div>

              {/* Mode Selection Chips */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">Processing Mode</span>
                <div className="flex gap-1.5 bg-[hsl(var(--surface-1))] p-1 rounded-xl border border-[hsl(var(--surface-3))]">
                  <button 
                    onClick={() => activeModel.supports.text_to_3d && setMode('text-to-3d')}
                    disabled={!activeModel.supports.text_to_3d}
                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                      mode === 'text-to-3d' 
                        ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-0))] shadow-md' 
                        : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] disabled:opacity-30'
                    }`}
                  >
                    Text-to-3D
                  </button>
                  <button 
                    onClick={() => activeModel.supports.image_to_3d && setMode('image-to-3d')}
                    disabled={!activeModel.supports.image_to_3d}
                    className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                      mode === 'image-to-3d' 
                        ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-0))] shadow-md' 
                        : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--surface-2))] disabled:opacity-30'
                    }`}
                  >
                    Image-to-3D
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION: INPUT SOURCE */}
          <div className="flex flex-col gap-4 animate-slide-in">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Input Source</span>
              <Sparkles size={12} className="text-[hsl(var(--primary))]" />
            </div>

            <div className="flex flex-col gap-4">
              {/* Conditional Prompt Area */}
              {activeModel.supports.text_to_3d && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[10px] font-bold text-[hsl(var(--muted-foreground))]">
                    <label>Description</label>
                    <span className="font-mono text-[9px]">{prompt.length}/500</span>
                  </div>
                  <div className="relative group">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
                      placeholder="High-fidelity mech sentinel with matte carbon finish..."
                      className="w-full bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-xl p-3 text-[11px] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))/0.5] min-h-[100px] max-h-[140px] focus:outline-none focus:border-[hsl(var(--primary))] transition-all resize-none font-bold leading-relaxed shadow-inner"
                    />
                    <div className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setPrompt('Futuristic cybernetic avatar with bioluminescent plating, high-detail mechanical internal structure')}
                        className="p-1.5 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] shadow-sm"
                        title="Auto-fill Example"
                      >
                        <RefreshCw size={10} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Enhanced Upload Zone */}
              {activeModel.supports.image_to_3d && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">Visual Reference</label>
                  <div
                    id="image-import-container"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('image-uploader-btn')?.click()}
                    className={`border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all text-center relative overflow-hidden group ${
                      isDragOver
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 scale-[0.98]'
                        : uploadedImage
                          ? 'border-[hsl(var(--neon-green))]/40 bg-[hsl(var(--neon-green))]/5'
                          : 'border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] hover:border-[hsl(var(--primary))]/50 hover:bg-[hsl(var(--surface-2))]'
                    }`}
                  >
                    <input id="image-uploader-btn" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    
                    {isUploadingImage ? (
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw size={20} className="text-[hsl(var(--primary))] animate-spin" />
                        <span className="text-[10px] font-black text-[hsl(var(--primary))] uppercase">{imageUploadProgress}% Loaded</span>
                      </div>
                    ) : uploadedImage ? (
                      <div className="relative w-full group">
                        <img src={uploadedImage.preview} alt="Ref" className="w-full h-24 object-cover rounded-xl border border-[hsl(var(--border))]" />
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl backdrop-blur-[2px]">
                          <button 
                            onClick={(e) => { e.stopPropagation(); clearImage(); }}
                            className="bg-[hsl(var(--destructive))] text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"
                          >
                            <Trash2 size={10} /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center mb-1 group-hover:scale-110 group-hover:bg-[hsl(var(--surface-3))] transition-all">
                          <Upload size={18} className="text-[hsl(var(--muted-foreground))]" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-black text-[hsl(var(--foreground))]">Drop reference</span>
                          <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tighter">PNG, JPG up to 10MB</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[hsl(var(--border))] my-1" />

          {/* 3D MODEL IMPORT — Drag & Drop or Click */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">IMPORT 3D MODEL</span>
            <div
              id="model-import-container"
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
              {isUploadingModel ? (
                <div className="w-full flex flex-col items-center gap-2 py-2">
                  <div className="w-4 h-4 border-2 border-[hsl(var(--primary)/0.3)] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Uploading... {modelUploadProgress}%</span>
                  <div className="w-full h-1 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
                    <div className="h-full bg-[hsl(var(--primary))] transition-all duration-200" style={{ width: `${modelUploadProgress}%` }} />
                  </div>
                </div>
              ) : uploadedModelUrl ? (
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
            onClick={async () => {
              anime({
                targets: '#workspace-trigger-generation-btn',
                scale: [0.95, 1],
                duration: 400,
                easing: 'easeOutElastic(1, .8)'
              });
              isGenerating ? cancel() : generate();
            }}
            className={`w-full font-black py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-[0_4px_24px_rgba(245,166,35,0.15)] ${
              isGenerating
                 ? 'bg-[hsl(var(--neon-pink))] hover:brightness-110 text-[hsl(var(--foreground))] shadow-[0_4px_24px_rgba(225,29,72,0.15)]'
                : isColabIncompatible
                  ? 'bg-[hsl(var(--surface-1))] text-[hsl(var(--muted-foreground))] cursor-not-allowed border border-[hsl(var(--border))/0.5]'
                : 'bg-[hsl(var(--primary))] hover:brightness-110 text-[hsl(var(--surface-0))]'
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
        
        {/* 3D Viewer Space — expanded vertically */}
        <div className="flex-1 relative bg-[hsl(var(--surface-0))] overflow-hidden" id="canvas-workspace">
          
           {/* Floating HUD Control bar removed: controls targeted the old InteractiveMesh demo. ThreeDViewer has its own toolbar. */}
          
           {/* Left toolbar removed: buttons targeted the old InteractiveMesh demo. ThreeDViewer has its own controls. */}

          {/* Orientation Axis Widget in top-right */}
          <div className="absolute right-4 top-4 z-10 bg-[hsl(var(--surface-0))]/90 backdrop-blur-md border border-[hsl(var(--border))] px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-[10px] font-mono font-black" id="orientation-indicator">
            <span className="text-[hsl(var(--destructive))]">X</span>
            <span className="text-[hsl(var(--neon-green))]">Y</span>
            <span className="text-[hsl(var(--neon-cyan))]">Z</span>
            <div className="w-4 h-4 border border-[hsl(var(--surface-3))] rounded flex items-center justify-center text-[8px] text-[hsl(var(--muted-foreground))]">U</div>
          </div>

          {/* Interactive ThreeD Canvas */}
          <div className="w-full h-full relative" id="standing-model-rendering-view">
            <ThreeDViewer />
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
                {activeModel?.id === 'hunyuan3d-2' ? '7.0 / 8 GB' : '4.0 / 8 GB'}
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
              <span className="font-extrabold text-[hsl(var(--foreground))] font-mono">{activeModel?.id === 'hunyuan3d-2' ? '4K (PBR)' : '--'}</span>
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
