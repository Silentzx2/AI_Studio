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
  Box, Eye, Move, RotateCw, ZoomIn, Grid3X3, Sun, Focus, Terminal,
  Sliders, Shield, Cpu, RefreshCw, FolderOpen, Info, Lock, ArrowRight,
  Activity, SlidersHorizontal, Settings, CheckSquare, X, ListFilter, Trash2
} from 'lucide-react';

import { useGenerationStore } from '@/stores/useGenerationStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGeneration } from '@/hooks/useGeneration';
import { useGenerationStatus, useAvailableModels } from '@/hooks/useBackendData';
import { HistoryItem } from '@/types/new-ui';
import { Skeleton } from '@/components/ux';
import { toast } from 'sonner';

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
    }
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
    }
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
    return <meshStandardMaterial color="#27272A" roughness={0.2} metalness={0.8} wireframe={wireframe} />;
  }, [shading, wireframe]);

  const accentMat = useMemo(() => {
    if (shading === 'Clay') {
      return <meshStandardMaterial color="#D4D4D8" roughness={0.6} metalness={0.15} wireframe={wireframe} />;
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
            <meshStandardMaterial color="#14141A" roughness={0.1} metalness={0.9} wireframe={wireframe} />
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
  const { prompt, setPrompt, uploadedImage, setUploadedImage, mode, setMode } = useGenerationStore();
  const { generate, cancel, isGenerating, currentJob } = useGeneration();
  const { status: jobStatus } = useGenerationStatus(currentJob?.id || null);
  const { models: backendModels, loading: isLoadingBackendModels } = useAvailableModels();

  // Combine local spec matrix with loaded models from backend (including pipeline models)
  const modelsList = useMemo(() => {
    if (!backendModels || backendModels.length === 0) {
      return LOCAL_MODELS;
    }
    // Start with LOCAL_MODELS enriched by matching backend data
    const merged = LOCAL_MODELS.map(local => {
      const match = backendModels.find((b: any) => b.id?.toLowerCase() === local.id || b.name?.toLowerCase() === local.name?.toLowerCase());
      if (match) {
        return {
          ...local,
          id: match.id,
          name: match.label || match.name || local.name,
          installed: match.installed ?? (match.status === 'ready' || local.installed),
          status: match.status || local.status,
          vram_required_mb: match.vram_required_mb || match.manifest?.recommended_vram_mb || local.vram_required_mb,
          supports: {
            ...local.supports,
            ...(match.supports || {})
          }
        };
      }
      return local;
    });
    // Also include backend-only models (from pipelines) not in LOCAL_MODELS
    const localIds = new Set(LOCAL_MODELS.map(m => m.id.toLowerCase()));
    for (const b of backendModels) {
      const bid = (b.id || '').toLowerCase();
      if (bid && !localIds.has(bid) && (b.supports_text_to_3d || b.supports_image_to_3d || b.supports?.text_to_3d || b.supports?.image_to_3d)) {
        const bSupports = b.supports || {};
        merged.push({
          id: b.id,
          name: b.label || b.name || b.id,
          label: b.label || b.name || b.id,
          installed: b.installed ?? false,
          status: b.status || (b.installed ? 'ready' : 'not_installed'),
          vram_required_mb: b.vram_required_mb || 0,
          speed_seconds: 0,
          supports: {
            text_to_3d: bSupports.text_to_3d ?? b.supports_text_to_3d ?? false,
            image_to_3d: bSupports.image_to_3d ?? b.supports_image_to_3d ?? false,
            texture_generation: bSupports.texture_generation ?? false,
            rigging_animation: bSupports.rigging_animation ?? false,
            detail_enhancement: bSupports.detail_enhancement ?? false,
            part_separation: bSupports.part_separation ?? false,
          },
          stats: {
            triangles: '0',
            vertices: '0',
            objects: '0',
            materials: '0',
            size: '0 MB',
          },
        });
      }
    }
    return merged;
  }, [backendModels]);

  // Set selected model id
  const [selectedModelId, setSelectedModelId] = useState('triposr');

  // Find active model details
  const activeModel = useMemo(() => {
    return modelsList.find(m => m.id === selectedModelId) || modelsList[0];
  }, [modelsList, selectedModelId]);

  // Sync back to workspace page container when active model details changes
  useEffect(() => {
    if (activeModel && onUpdateModel) {
      // Avoid infinite cycles by only updating when name or specs differ
      if (parentActiveModel?.id !== activeModel.id) {
        onUpdateModel({
          ...activeModel,
          accentColor: activeModel.id === 'triposr' ? 'hsl(var(--primary))' : '#3B82F6'
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
  const [isRigging, setIsRigging] = useState(false);
  const [isPartitioning, setIsPartitioning] = useState(false);

  const [viewMode, setViewMode] = useState<'Mesh' | 'Wireframe' | 'Texture' | 'Rigging' | 'UV' | 'Parts' | 'Animation'>('Mesh');
  const [shading, setShading] = useState<'PBR' | 'Clay'>('PBR');
  const [exportFormat, setExportFormat] = useState<'GLB' | 'FBX' | 'OBJ' | 'USDZ' | 'STL'>('GLB');
  const [activeBottomTab, setActiveBottomTab] = useState<'GENERATION PIPELINE' | 'GENERATED ASSETS' | 'CONSOLE / LOGS'>('GENERATION PIPELINE');
  const [showGrid, setShowGrid] = useState(true);
  const [showWireframe, setShowWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const handleRigging = async () => {
    if (!currentJob?.result?.modelUrl && !uploadedModel) {
      toast.error('Generate or upload a model first before rigging');
      return;
    }
    setIsRigging(true);
    try {
      const modelUrl = (currentJob?.result as any)?.modelUrl || uploadedModelUrl;
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt || 'Auto rig model',
          mode: 'rigging',
          reference_image_url: modelUrl,
          quality: 'standard',
          auto_rig: true,
        }),
      });
      const data = await res.json();
      if (data.data?.job_id) {
        toast.info('Rigging job submitted');
        const jobId = data.data.job_id;
        const poll = setInterval(async () => {
          try {
            const sRes = await fetch(`/api/v1/generation/${jobId}/status`);
            const sData = await sRes.json();
            if (sData.data?.status === 'completed') {
              clearInterval(poll);
              setIsRigging(false);
              toast.success('Rigging complete!');
            } else if (sData.data?.status === 'failed') {
              clearInterval(poll);
              setIsRigging(false);
              toast.error('Rigging failed');
            }
          } catch { clearInterval(poll); setIsRigging(false); }
        }, 2000);
      } else {
        setIsRigging(false);
        toast.error('Failed to submit rigging job');
      }
    } catch (err: any) {
      setIsRigging(false);
      toast.error('Rigging failed: ' + err.message);
    }
  };

  const handleMeshPartition = async () => {
    if (!currentJob?.result && !uploadedModelUrl) {
      toast.error('Generate or upload a model first');
      return;
    }
    setIsPartitioning(true);
    try {
      const modelUrl = (currentJob?.result as any)?.modelUrl || uploadedModelUrl;
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Partition mesh into semantic parts',
          mode: 'partition',
          reference_image_url: modelUrl,
          quality: 'standard',
        }),
      });
      const data = await res.json();
      if (data.data?.job_id) {
        toast.info('Mesh partition job submitted');
        const jobId = data.data.job_id;
        const poll = setInterval(async () => {
          try {
            const sRes = await fetch(`/api/v1/generation/${jobId}/status`);
            const sData = await sRes.json();
            if (sData.data?.status === 'completed') {
              clearInterval(poll);
              setIsPartitioning(false);
              toast.success('Mesh partition complete!');
            } else if (sData.data?.status === 'failed') {
              clearInterval(poll);
              setIsPartitioning(false);
              toast.error('Mesh partition failed');
            }
          } catch { clearInterval(poll); setIsPartitioning(false); }
        }, 2000);
      } else {
        setIsPartitioning(false);
        toast.error('Failed to submit partition job');
      }
    } catch (err: any) {
      setIsPartitioning(false);
      toast.error('Partition failed: ' + err.message);
    }
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

  // Pipeline step switches local state matching Left Sidebar "PIPELINE STEPS"
  const [stepsConfig, setStepsConfig] = useState({
    baseMesh: true,
    remesh: true,
    texture: true,
    partSeparation: true,
    rigging: true,
    animation: false,
    optimization: true,
    export: true
  });

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

  // Generate logs content list
  const activeLogs = useMemo(() => {
    return jobStatus?.logs ?? currentJob?.logs?.map((l: any) => l.message) ?? [];
  }, [jobStatus?.logs, currentJob?.logs]);

  // Derived active node in the "GENERATION PIPELINE" graph
  const activePipelineIndex = useMemo(() => {
    if (!isGenerating) {
      return currentJob?.status === 'completed' ? 8 : -1;
    }
    if (derivedProgress < 12) return 0; // Prompt
    if (derivedProgress < 25) return 1; // Base Mesh
    if (derivedProgress < 38) return 2; // Remesh
    if (derivedProgress < 50) return 3; // Texture
    if (derivedProgress < 65) return 4; // Part Separation
    if (derivedProgress < 75) return 5; // Rigging
    if (derivedProgress < 85) return 6; // Animation
    if (derivedProgress < 95) return 7; // Optimization
    return 8; // Export
  }, [isGenerating, derivedProgress, currentJob?.status]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-[hsl(var(--surface-0))] text-[#FAFAFA] relative" id="ai-3d-studio-workspace">
      
      {/* FIX: Mobile sidebar overlay backdrops */}
      {mobileLeftOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileLeftOpen(false)} aria-hidden="true" />
      )}
      {mobileRightOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileRightOpen(false)} aria-hidden="true" />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. LEFT SIDEBAR: GENERATION SETUP */}
      {/* FIX: On mobile (< lg), hidden off-screen by default, slides in as overlay when toggled */}
      {/* ───────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[300px] max-w-[85vw] bg-[#0D0D11] border-r border-[#1C1C24] flex flex-col shrink-0 overflow-y-auto transition-transform duration-200 lg:static lg:inset-auto lg:z-auto lg:w-[280px] lg:max-w-none lg:translate-x-0 lg:transition-none ${
          mobileLeftOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        id="generation-setup-sidebar"
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-[#1C1C24] flex items-center justify-between bg-[#0A0A0E]">
          <span className="text-xs font-black uppercase tracking-widest text-white">GENERATION SETUP</span>
          <button onClick={() => setMobileLeftOpen(false)} className="lg:hidden p-1 rounded hover:bg-[#1C1C24] text-[hsl(var(--muted-foreground))] hover:text-white" aria-label="Close sidebar">
            <X size={14} />
          </button>
          <ChevronUp size={14} className="text-[hsl(var(--muted-foreground))] cursor-pointer hover:text-white hidden lg:block" />
        </div>

        {/* Setup Options Form */}
        <div className="p-4 flex flex-col gap-5">
          {/* Model Selector */}
          <div className="flex flex-col gap-1.5" id="model-select-field">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Model</label>
              {activeModel?.installed ? (
                <span className="text-[9px] font-bold text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded-full border border-[#10B981]/20">Installed</span>
              ) : (
                <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Not Installed</span>
              )}
            </div>
            
            <div className="relative">
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full bg-[#14141A] border border-[#242430] rounded-xl pl-3 pr-8 py-2.5 text-xs font-semibold text-white cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))] transition-all appearance-none"
              >
                {modelsList.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {!m.installed ? '(Available)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3.5 text-[hsl(var(--muted-foreground))] pointer-events-none" />
            </div>
          </div>

          {/* Supports Checklist (Gated based on model capability) */}
          <div className="flex flex-col gap-2 p-3 bg-[#14141A] rounded-xl border border-[#242430]" id="capabilities-checklist">
            <span className="text-[9px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Supports</span>
            <div className="grid grid-cols-2 gap-y-2 gap-x-1.5 text-[10px] font-semibold text-[#E4E4E7]">
              <div 
                onClick={() => activeModel.supports.text_to_3d && setMode('text-to-3d')}
                className={`flex items-center gap-1.5 p-1 rounded transition-all cursor-pointer ${
                  !activeModel.supports.text_to_3d ? 'opacity-30 cursor-not-allowed' : mode === 'text-to-3d' ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/30' : 'hover:bg-white/5'
                }`}
              >
                <Check size={11} className={activeModel.supports.text_to_3d ? "text-[#10B981]" : "text-[hsl(var(--muted-foreground))]"} />
                <span>Text to 3D</span>
              </div>
              <div 
                onClick={() => activeModel.supports.image_to_3d && setMode('image-to-3d')}
                className={`flex items-center gap-1.5 p-1 rounded transition-all cursor-pointer ${
                  !activeModel.supports.image_to_3d ? 'opacity-30 cursor-not-allowed' : mode === 'image-to-3d' ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]/30' : 'hover:bg-white/5'
                }`}
              >
                <Check size={11} className={activeModel.supports.image_to_3d ? "text-[#10B981]" : "text-[hsl(var(--muted-foreground))]"} />
                <span>Image to 3D</span>
              </div>
              <div className={`flex items-center gap-1.5 ${!activeModel.supports.texture_generation && 'opacity-30'}`}>
                <Check size={11} className={activeModel.supports.texture_generation ? "text-[#10B981]" : "text-[hsl(var(--muted-foreground))]"} />
                <span>Texture Gen</span>
              </div>
              <div className={`flex items-center gap-1.5 ${!activeModel.supports.rigging_animation && 'opacity-30'}`}>
                <Check size={11} className={activeModel.supports.rigging_animation ? "text-[#10B981]" : "text-[hsl(var(--muted-foreground))]"} />
                <span>Rigging / Anim</span>
              </div>
              <div className={`flex items-center gap-1.5 ${!activeModel.supports.part_separation && 'opacity-30'}`}>
                <Check size={11} className={activeModel.supports.part_separation ? "text-[#10B981]" : "text-[hsl(var(--muted-foreground))]"} />
                <span>Part Separation</span>
              </div>
              <div className={`flex items-center gap-1.5 ${!activeModel.supports.detail_enhancement && 'opacity-30'}`}>
                <Check size={11} className={activeModel.supports.detail_enhancement ? "text-[#10B981]" : "text-[hsl(var(--muted-foreground))]"} />
                <span>Detail Enhance</span>
              </div>
            </div>
          </div>

          <div className="border-t border-[#1C1C24] my-1" />

          {/* INPUT SECTION */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))] -mb-1">INPUT</span>
            
            {/* Prompt input with character count (disabled if text-to-3d is unsupported) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">Prompt</label>
              {!activeModel.supports.text_to_3d ? (
                <div className="bg-[#14141A]/50 border border-[#242430]/60 p-3 rounded-xl text-[11px] text-[hsl(var(--muted-foreground))] font-medium flex gap-2">
                  <Lock size={12} className="shrink-0 mt-0.5" />
                  <span>Prompt disabled for {activeModel.name} (Image-to-3D only).</span>
                </div>
              ) : (
                <div className="relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
                    placeholder="Describe your 3D humanoid, mecha or asset in detail..."
                    className="w-full bg-[#14141A] border border-[#242430] rounded-xl p-3 text-xs text-white placeholder-[hsl(var(--muted-foreground))] min-h-[85px] max-h-[140px] focus:outline-none focus:border-[hsl(var(--primary))] transition-all resize-none leading-relaxed font-semibold"
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
                <div className="bg-[#14141A]/50 border border-[#242430]/60 p-3 rounded-xl text-[11px] text-[hsl(var(--muted-foreground))] font-medium flex gap-2">
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
                        ? 'border-[#10B981]/30 bg-[#10B981]/5'
                        : 'border-[#242430] bg-[#14141A]/55 hover:bg-[#14141A] hover:border-[hsl(var(--primary))]/50'
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
                      <img src={uploadedImage.preview} alt="Reference Preview" className="w-full h-20 object-contain rounded-lg border border-[#242430]" referrerPolicy="no-referrer" />
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-[#10B981] flex items-center gap-1">
                          <CheckCircle2 size={11} /> Ready
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); clearImage(); }} className="text-[10px] font-black text-rose-500 hover:text-rose-400 p-0.5 bg-rose-500/10 rounded">
                          Remove
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload size={18} className={isDragOver ? 'text-[hsl(var(--primary))] animate-bounce' : 'text-[hsl(var(--muted-foreground))]'} />
                      <span className="text-[11px] font-bold text-white">
                        Drag & drop or click to upload
                      </span>
                      <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">PNG, JPG, WEBP up to 10MB</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[#1C1C24] my-1" />

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
                  ? 'border-[#10B981]/30 bg-[#10B981]/5'
                  : isDragOver
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                    : 'border-[#242430] bg-[#14141A]/55 hover:bg-[#14141A] hover:border-[hsl(var(--primary))]/50'
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
                  <Layers size={16} className="text-[#10B981]" />
                  <span className="text-[10px] font-bold text-[#10B981] truncate max-w-full">{uploadedModelName}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setUploadedModel(null); setUploadedModelUrl(null); setUploadedModelName(''); toast.info('Model removed'); }}
                    className="text-[9px] font-bold text-rose-500 hover:text-rose-400 mt-0.5"
                  >Remove</button>
                </>
              ) : (
                <>
                  <FolderOpen size={16} className="text-[hsl(var(--muted-foreground))]" />
                  <span className="text-[10px] font-bold text-[#8E8E93]">Drop GLB/GLTF or click</span>
                  <span className="text-[8px] text-[hsl(var(--muted-foreground))] font-mono">Import to viewer or remesh</span>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-[#1C1C24] my-1" />

          {/* PIPELINE STEPS TOGGLES */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">PIPELINE STEPS</span>
            <div className="flex flex-col gap-2">
              {[
                { key: 'baseMesh', label: 'Generate Base Mesh', required: true, gated: false },
                { key: 'remesh', label: 'Remesh', required: false, gated: false },
                { key: 'texture', label: 'Texture (PBR)', required: false, gated: !activeModel.supports.texture_generation },
                { key: 'partSeparation', label: 'Part Separation (HoloPart)', required: false, gated: false, alwaysAvailable: true },
                { key: 'rigging', label: 'Rigging (UniRig)', required: false, gated: false, alwaysAvailable: true },
                { key: 'animation', label: 'Animation (Optional)', required: false, gated: !activeModel.supports.rigging_animation },
                { key: 'optimization', label: 'Optimization (LOD)', required: false, gated: false },
                { key: 'export', label: 'Export', required: true, gated: false },
              ].map((step) => (
                <div key={step.key} className="flex items-center justify-between py-0.5">
                  <span className={`text-xs font-semibold ${step.gated ? 'text-[hsl(var(--muted-foreground))]' : 'text-[#E4E4E7]'}`}>
                    {step.label}{' '}{(step as any).alwaysAvailable && <span className="text-[8px] text-[hsl(var(--primary))] font-mono ml-1">(ALWAYS)</span>}
                  </span>
                  
                  {step.gated ? (
                    <div className="text-[hsl(var(--muted-foreground))]" title="Unsupported by selected Model">
                      <Lock size={12} />
                    </div>
                  ) : step.required ? (
                    <span className="text-[10px] font-bold text-[#10B981] bg-[#10B981]/10 px-2 py-0.5 rounded border border-[#10B981]/10">Required</span>
                  ) : (
                    <button
                      onClick={() => setStepsConfig(prev => ({
                        ...prev,
                        [step.key]: !prev[step.key as keyof typeof prev]
                      }))}
                      className={`w-8 h-4.5 rounded-full p-0.5 transition-all cursor-pointer ${
                        stepsConfig[step.key as keyof typeof stepsConfig] ? 'bg-[hsl(var(--primary))]' : 'bg-[#242430]'
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full bg-black transition-all ${
                        stepsConfig[step.key as keyof typeof stepsConfig] ? 'translate-x-3.5 bg-white' : 'translate-x-0'
                      }`} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Advanced Settings */}
          <div 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between py-2.5 border-t border-[#1C1C24] cursor-pointer text-[#8E8E93] hover:text-white transition-colors"
          >
            <span className="text-xs font-bold flex items-center gap-1.5">
              <SlidersHorizontal size={13} className={showAdvanced ? 'text-[hsl(var(--primary))]' : ''} />
              Advanced Settings
            </span>
            <ChevronRight size={13} className={`transition-transform duration-200 ${showAdvanced ? 'rotate-90 text-[hsl(var(--primary))]' : ''}`} />
          </div>

          {showAdvanced && (
            <div className="flex flex-col gap-3.5 bg-[#141419]/50 border border-[#1C1C24] rounded-xl p-3.5 mb-2 animate-fadeIn text-xs">
              {/* Geometry Resolution */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-mono font-bold">Geometry Quality</label>
                <div className="grid grid-cols-3 gap-1">
                  {['Standard', 'High', 'Ultra'].map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toast.success(`Quality set to ${q}`); }}
                      className="py-1 px-2 text-[10px] font-bold rounded bg-[#0D0D11] border border-[#1C1C24] hover:border-[hsl(var(--primary))] hover:text-white transition-all text-center"
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
                      className="py-1 px-2 text-[10px] font-bold rounded bg-[#0D0D11] border border-[#1C1C24] hover:border-[hsl(var(--primary))] hover:text-white transition-all text-center"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Generate 3D Model Button */}
          <button
            onClick={isGenerating ? cancel : generate}
            className={`w-full font-black py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-[0_4px_24px_rgba(245,166,35,0.15)] ${
              isGenerating
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-[0_4px_24px_rgba(225,29,72,0.15)]'
                : 'bg-[hsl(var(--primary))] hover:brightness-110 text-black active:scale-[0.98]'
            }`}
            id="workspace-trigger-generation-btn"
          >
            <Sparkles size={14} className={isGenerating ? "" : "fill-current"} />
            {isGenerating ? 'Cancel Generation' : 'Generate 3D Model'}
          </button>
        </div>
      </aside>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. CENTER STAGE AND BOTTOM DOCKS */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[hsl(var(--surface-0))] relative min-h-[200px] lg:min-h-0" id="workspace-center-section">
        
        {/* Top Control bar */}
        <div className="h-14 bg-[#0D0D11] border-b border-[#1C1C24] px-2 sm:px-4 flex items-center justify-between shrink-0 overflow-x-auto gap-2" id="viewer-header-control-bar">
          
          {/* FIX: Mobile sidebar toggle buttons */}
          <div className="flex items-center gap-1 lg:hidden shrink-0">
            <button onClick={() => { setMobileLeftOpen(true); setMobileRightOpen(false); }} className="p-2 rounded-lg hover:bg-[#1C1C24] text-[hsl(var(--muted-foreground))] hover:text-white active:scale-95" title="Open Settings">
              <Settings size={16} />
            </button>
            <button onClick={() => { setMobileRightOpen(true); setMobileLeftOpen(false); }} className="p-2 rounded-lg hover:bg-[#1C1C24] text-[hsl(var(--muted-foreground))] hover:text-white active:scale-95" title="Open Progress">
              <Activity size={16} />
            </button>
          </div>

          {/* View Mode segmented control */}
          <div className="flex items-center gap-1.5 bg-[#14141A] p-1 rounded-xl border border-[#242430]">
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
                    ? 'bg-[hsl(var(--primary))] text-black shadow-sm font-bold'
                    : 'text-[#8E8E93] hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
            <button
              onClick={() => handleRigging()}
              disabled={isRigging}
              className={`px-3 py-1.5 text-[11px] font-black tracking-wide rounded-lg transition-all ${
                isRigging
                  ? 'bg-emerald-500/20 text-emerald-400 animate-pulse'
                  : viewMode === 'Rigging'
                    ? 'bg-[hsl(var(--primary))] text-black shadow-sm font-bold'
                    : 'text-[#8E8E93] hover:text-white'
              }`}
            >
              {isRigging ? 'Rigging...' : 'Rigging'}
            </button>
            {(['UV'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setViewMode(m); setShowWireframe(false); }}
                className={`px-3 py-1.5 text-[11px] font-black tracking-wide rounded-lg transition-all ${
                  viewMode === m
                    ? 'bg-[hsl(var(--primary))] text-black shadow-sm font-bold'
                    : 'text-[#8E8E93] hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
            <button
              onClick={() => handleMeshPartition()}
              disabled={isPartitioning}
              className={`px-3 py-1.5 text-[11px] font-black tracking-wide rounded-lg transition-all ${
                isPartitioning
                  ? 'bg-emerald-500/20 text-emerald-400 animate-pulse'
                  : viewMode === 'Parts'
                    ? 'bg-[hsl(var(--primary))] text-black shadow-sm font-bold'
                    : 'text-[#8E8E93] hover:text-white'
              }`}
            >
              {isPartitioning ? 'Parting...' : 'Parts'}
            </button>
            {(['Animation'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setViewMode(m); setShowWireframe(false); }}
                className={`px-3 py-1.5 text-[11px] font-black tracking-wide rounded-lg transition-all ${
                  viewMode === m
                    ? 'bg-[hsl(var(--primary))] text-black shadow-sm font-bold'
                    : 'text-[#8E8E93] hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            {/* Shading options */}
            <div className="flex items-center gap-1 bg-[#14141A] p-1 rounded-xl border border-[#242430]">
              {(['PBR', 'Clay'] as const).map((shade) => (
                <button
                  key={shade}
                  onClick={() => setShading(shade)}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    shading === shade
                      ? 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/30 font-extrabold'
                      : 'text-[#8E8E93] border border-transparent hover:text-white'
                  }`}
                >
                  {shade}
                </button>
              ))}
            </div>

            {/* Custom toolbar buttons on the right */}
            <div className="flex items-center gap-1 border-l border-[#1C1C24] pl-4 text-[hsl(var(--muted-foreground))]">
              <button onClick={() => setShowGrid(!showGrid)} className={`p-2 rounded hover:bg-[#1E1E28] hover:text-white transition-all ${showGrid ? 'text-[hsl(var(--primary))]' : ''}`} title="Toggle grid floor">
                <Grid3X3 size={14} />
              </button>
              <button className="p-2 rounded hover:bg-[#1E1E28] hover:text-white transition-all" title="Full screen">
                <Maximize2 size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* 3D Viewer Space — constrained height so it doesn't consume full viewport */}
        <div className="flex-1 relative bg-gradient-to-b from-[#141419] via-[hsl(var(--surface-0))] to-[#040406] overflow-hidden max-h-[55vh] lg:max-h-[60vh]" id="canvas-workspace">
          
          {/* Floating left toolbar — hidden on very small screens for space */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 hidden sm:flex flex-col gap-1.5 bg-[#0D0D11]/90 backdrop-blur-md border border-[#1C1C24] p-1.5 rounded-xl text-[hsl(var(--muted-foreground))]">
            <button className="p-2 rounded-lg hover:bg-[#1C1C24] text-[hsl(var(--primary))]" title="Pointer Mode">
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
              className={`p-2 rounded-lg hover:bg-[#1C1C24] transition-all ${autoRotate ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 border border-[hsl(var(--primary))]/10' : 'hover:text-white'}`} 
              title="Toggle Auto Rotation"
            >
              <RotateCw size={14} className={autoRotate ? 'animate-spin' : ''} />
            </button>
            <button className="p-2 rounded-lg hover:bg-[#1C1C24] hover:text-white" title="Pan Camera">
              <Move size={14} className="rotate-45" />
            </button>
            <button className="p-2 rounded-lg hover:bg-[#1C1C24] hover:text-white" title="Zoom Camera">
              <ZoomIn size={14} />
            </button>
            <button className="p-2 rounded-lg hover:bg-[#1C1C24] hover:text-white" title="Show Bounding Box">
              <Box size={14} />
            </button>
            <button className="p-2 rounded-lg hover:bg-[#1C1C24] hover:text-white" title="Reset View">
              <Focus size={14} />
            </button>
          </div>

          {/* Orientation Axis Widget in top-right */}
          <div className="absolute right-4 top-4 z-10 bg-[#0D0D11]/90 backdrop-blur-md border border-[#1C1C24] px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-[10px] font-mono font-black" id="orientation-indicator">
            <span className="text-red-500">X</span>
            <span className="text-[#10B981]">Y</span>
            <span className="text-sky-500">Z</span>
            <div className="w-4 h-4 border border-[#242430] rounded flex items-center justify-center text-[8px] text-[hsl(var(--muted-foreground))]">U</div>
          </div>

          {/* Interactive ThreeD Canvas */}
          <div className="w-full h-full relative" id="standing-model-rendering-view">
            <Suspense fallback={
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm z-10 gap-2">
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
                    cellColor="#242430" 
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
            <div className="absolute bottom-4 left-4 z-10 bg-[#0D0D11]/70 backdrop-blur-sm border border-[#1C1C24] px-3 py-1.5 rounded-lg text-[10px] font-bold text-[hsl(var(--muted-foreground))] hidden sm:block">
              3D Viewport • <span className="text-[hsl(var(--primary))]">Interactivity Active</span>
            </div>
          </div>

          {/* Bottom-right stats overlay matching high-fidelity mock — hidden on mobile for space */}
          <div className="absolute bottom-4 right-4 z-10 bg-[#0D0D11]/95 backdrop-blur-md border border-[#1C1C24] rounded-xl p-3 flex-col gap-1.5 min-w-[130px] hidden sm:flex" id="viewport-stats-overlay">
            <span className="text-[9px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))] border-b border-[#1C1C24] pb-1 mb-0.5">Asset Spec</span>
            <div className="grid grid-cols-2 gap-y-1 gap-x-3 text-[10px] font-mono">
              <span className="text-[hsl(var(--muted-foreground))] font-sans">Faces</span>
              <span className="font-extrabold text-right text-white">{activeModel?.stats?.triangles || '2.4M'}</span>
              <span className="text-[hsl(var(--muted-foreground))] font-sans">Vertices</span>
              <span className="font-extrabold text-right text-white">{activeModel?.stats?.vertices || '1.8M'}</span>
              <span className="text-[hsl(var(--muted-foreground))] font-sans">Objects</span>
              <span className="font-extrabold text-right text-white">{activeModel?.stats?.objects || '12'}</span>
              <span className="text-[hsl(var(--muted-foreground))] font-sans">Materials</span>
              <span className="font-extrabold text-right text-white">{activeModel?.stats?.materials || '8'}</span>
            </div>
          </div>
        </div>

        {/* Bottom Dock Control Panel containing "GENERATION PIPELINE", "GENERATED ASSETS", "CONSOLE / LOGS" */}
        <div className="h-[150px] sm:h-[200px] bg-[#0D0D11] border-t border-[#1C1C24] flex flex-col shrink-0" id="generation-bottom-panel">
          {/* Panel Tabs */}
          <div className="flex items-center justify-between px-4 border-b border-[#1C1C24] bg-[#0A0A0E] shrink-0">
            <div className="flex gap-6">
              {(['GENERATION PIPELINE', 'GENERATED ASSETS', 'CONSOLE / LOGS'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveBottomTab(tab)}
                  className={`py-3 text-[11px] font-black tracking-widest transition-all border-b-2 ${
                    activeBottomTab === tab
                      ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))] font-bold'
                      : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {activeBottomTab === 'GENERATED ASSETS' && (
              <span className="text-[10px] font-black text-[hsl(var(--primary))] hover:underline cursor-pointer">View All</span>
            )}
          </div>

          {/* Tab Content Panels */}
          <div className="flex-1 p-4 overflow-y-auto min-h-0 bg-[#07070A]">
            
            {/* TAB 1: GENERATION PIPELINE FLOW */}
            {activeBottomTab === 'GENERATION PIPELINE' && (
              <div className="h-full flex items-center justify-center" id="pipeline-diagram-tab">
                <div className="flex items-center gap-2 overflow-x-auto max-w-full py-2 px-4 scrollbar-thin">
                  {[
                    { label: 'Prompt', desc: mode === 'text-to-3d' ? 'Prompt Text' : 'Image Ref', icon: <Terminal size={14} />, gate: false },
                    { label: 'Base Mesh', desc: 'Geometry Base', icon: <Box size={14} />, gate: false },
                    { label: 'Remesh', desc: 'Retopology', icon: <Layers size={14} />, gate: false },
                    { label: 'Texture (PBR)', desc: '4K Texturing', icon: <Cpu size={14} />, gate: !activeModel.supports.texture_generation },
                    { label: 'Part Separation', desc: 'HoloPart Separ.', icon: <Sliders size={14} />, gate: false },
                    { label: 'Rigging', desc: 'Armature Bones', icon: <Activity size={14} />, gate: false },
                    { label: 'Animation', desc: 'Clips Loop', icon: <Play size={14} />, gate: !activeModel.supports.rigging_animation },
                    { label: 'Optimization', desc: 'LOD Mesh', icon: <SlidersHorizontal size={14} />, gate: false },
                    { label: 'Export', desc: 'Packaging', icon: <Download size={14} />, gate: false },
                  ].map((node, index) => {
                    const isCompleted = index < activePipelineIndex;
                    const isActive = index === activePipelineIndex && isGenerating;
                    const isFuture = index > activePipelineIndex;

                    return (
                      <React.Fragment key={node.label}>
                        {/* Connected Dashed Line Arrow */}
                        {index > 0 && (
                          <div className={`w-6 flex items-center justify-center shrink-0 ${isFuture ? 'text-zinc-800' : isCompleted ? 'text-[#10B981]' : 'text-amber-500 animate-pulse'}`}>
                            <span className="font-mono text-xs">➔</span>
                          </div>
                        )}

                        {/* Pipeline Node */}
                        <div 
                          className={`w-32 rounded-xl p-2.5 flex flex-col items-center text-center border transition-all duration-300 shrink-0 ${
                            node.gate 
                              ? 'bg-[#14141A]/30 border-[#242430]/30 opacity-25'
                              : isActive
                                ? 'bg-[hsl(var(--primary))]/10 border-[hsl(var(--primary))] shadow-[0_0_15px_rgba(245,166,35,0.15)] ring-1 ring-[hsl(var(--primary))]'
                                : isCompleted
                                  ? 'bg-[#10B981]/5 border-[#10B981]/40 text-[#10B981]'
                                  : 'bg-[#0E0E12] border-[#1C1C24] text-[hsl(var(--muted-foreground))]'
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center mb-1.5 ${
                            node.gate
                              ? 'bg-zinc-900 text-[hsl(var(--muted-foreground))]'
                              : isActive
                                ? 'bg-[hsl(var(--primary))] text-black animate-spin'
                                : isCompleted
                                  ? 'bg-[#10B981] text-black'
                                  : 'bg-[#18181C] text-[hsl(var(--muted-foreground))]'
                          }`}>
                            {node.gate ? <Lock size={12} /> : isCompleted ? <Check size={12} className="stroke-[3]" /> : node.icon}
                          </div>
                          <span className="text-[10px] font-black tracking-wide truncate max-w-full text-white">{node.label}</span>
                          <span className="text-[8px] font-mono font-medium text-[hsl(var(--muted-foreground))] mt-0.5 truncate max-w-full">{node.desc}</span>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: GENERATED ASSETS GRID */}
            {activeBottomTab === 'GENERATED ASSETS' && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3" id="generated-assets-tab-grid">
                {[
                  { name: 'Mesh (GLB)', size: activeModel?.stats?.size || '128 MB', desc: 'Core 3D mesh model with materials', active: true, format: 'GLB' },
                  { name: 'Texture (PBR)', size: '4K Res', desc: 'Roughness, metallic, normals, ambient occlusion maps', active: activeModel.supports.texture_generation, format: 'PNG' },
                  { name: 'Parts (12)', size: 'OBJ Layout', desc: 'Separated object elements hierarchy layout', active: true, format: 'OBJ' },
                  { name: 'Rig', size: 'FBX Bone', desc: 'Armature bones joint structures hierarchy', active: true, format: 'FBX' },
                  { name: 'Preview Render', size: '1080p Image', desc: 'Cinematic layout high quality preview image', active: true, format: 'PNG' },
                ].map((asset) => (
                  <div 
                    key={asset.name}
                    className={`bg-[#0D0D11] border rounded-xl p-3 flex flex-col gap-1.5 transition-all relative group ${
                      !asset.active 
                        ? 'opacity-35 border-[#242430]/40' 
                        : 'border-[#242430] hover:border-[hsl(var(--primary))]/60 hover:shadow-lg'
                    }`}
                  >
                    {!asset.active && (
                      <div className="absolute top-2 right-2 text-[hsl(var(--muted-foreground))]">
                        <Lock size={11} />
                      </div>
                    )}
                    <div className="flex-1 bg-[#14141A] rounded-lg p-2.5 flex flex-col items-center justify-center relative min-h-[55px]">
                      <Box size={20} className={asset.active ? "text-[hsl(var(--primary))]" : "text-zinc-600"} />
                      <span className="absolute bottom-1 right-1 text-[8px] font-mono bg-black/70 text-[hsl(var(--muted-foreground))] px-1 rounded font-black">{asset.format}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-white truncate">{asset.name}</span>
                      <span className="text-[8px] font-mono text-[hsl(var(--muted-foreground))]">{asset.size}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB 3: CONSOLE / LOGS */}
            {activeBottomTab === 'CONSOLE / LOGS' && (
              <div className="h-full bg-black/40 border border-[#1C1C24] rounded-xl p-3 flex flex-col gap-1.5 font-mono text-[10px] overflow-y-auto text-[hsl(var(--muted-foreground))]" id="logs-panel-area">
                <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))] pb-1 border-b border-[#181820] shrink-0">
                  <Terminal size={11} className="text-[hsl(var(--primary))]" />
                  <span className="font-black text-white text-[8px] uppercase tracking-widest">LIVE PIPELINE STREAM</span>
                </div>
                <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
                  {activeLogs.length > 0 ? (
                    activeLogs.map((log: any, i: number) => (
                      <div key={i} className="leading-normal">
                        <span className="text-[hsl(var(--primary))] font-bold mr-1.5">&gt;&gt;</span>
                        <span>{log}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[hsl(var(--muted-foreground))] flex flex-col items-center justify-center h-full gap-1">
                      <Terminal size={14} />
                      <span>Waiting for generation trigger to initialize logger stream...</span>
                    </div>
                  )}
                  {isGenerating && (
                    <div className="text-amber-400 font-semibold animate-pulse flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      <span>{activeStageLabel} ({derivedProgress}%)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. RIGHT SIDEBAR: PROGRESS AND SPECS */}
      {/* FIX: On mobile (< lg), hidden off-screen by default, slides in as overlay when toggled */}
      {/* ───────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-[280px] max-w-[85vw] bg-[#0D0D11] border-l border-[#1C1C24] flex flex-col shrink-0 overflow-y-auto transition-transform duration-200 lg:static lg:inset-auto lg:z-auto lg:w-[260px] lg:max-w-none lg:translate-x-0 lg:transition-none p-4 gap-4 ${
          mobileRightOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
        id="specs-and-progress-sidebar"
      >
        {/* FIX: Mobile close button for right sidebar */}
        <div className="flex items-center justify-between lg:hidden mb-2">
          <span className="text-xs font-black uppercase tracking-widest text-white">PROGRESS & SPECS</span>
          <button onClick={() => setMobileRightOpen(false)} className="p-1 rounded hover:bg-[#1C1C24] text-[hsl(var(--muted-foreground))] hover:text-white" aria-label="Close sidebar">
            <X size={14} />
          </button>
        </div>
        
        {/* CARD 1: GENERATION PROGRESS */}
        <div className="bg-[#14141A] border border-[#242430] rounded-2xl p-4 flex flex-col gap-3" id="progress-container">
          <div className="flex items-center justify-between border-b border-[#242430] pb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-white">GENERATION PROGRESS</span>
            <ChevronUp size={13} className="text-[hsl(var(--muted-foreground))]" />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs">
              <span className="font-extrabold text-[hsl(var(--primary))] text-[11px] uppercase tracking-wider">{activeStageLabel}</span>
              <span className="font-mono font-black text-[hsl(var(--primary))]">{derivedProgress}%</span>
            </div>
            {/* Progress Bar Fill */}
            <div className="w-full h-2 bg-[#1C1C24] rounded-full overflow-hidden border border-[#242430]">
              <div 
                className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[#FF8A00] rounded-full shadow-[0_0_12px_rgba(245,166,35,0.4)] transition-all duration-300" 
                style={{ width: `${derivedProgress}%` }} 
              />
            </div>
          </div>

          {/* Timeline steps with timestamps matching screenshot */}
          <div className="flex flex-col gap-2.5 pt-2.5 font-mono text-[10px] border-t border-[#1C1C24]/60">
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
                  <div key={step.label} className="flex items-center justify-between text-[#10B981]">
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
                      <span className="w-1 h-1 rounded-full bg-zinc-700" />
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
        <div className="bg-[#14141A] border border-[#242430] rounded-2xl p-4 flex flex-col gap-3" id="model-info-container">
          <div className="flex items-center justify-between border-b border-[#242430] pb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-white">MODEL INFORMATION</span>
            <ChevronUp size={13} className="text-[hsl(var(--muted-foreground))]" />
          </div>

          <div className="flex flex-col gap-2.5 text-xs font-semibold">
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">Model</span>
              <span className="font-extrabold text-white font-mono">{activeModel?.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">VRAM Usage</span>
              <span className="font-extrabold text-white font-mono">
                {activeModel?.id === 'triposr' ? '5.2 / 8 GB' : activeModel?.id === 'hunyuan3d-2' ? '7.0 / 8 GB' : '4.0 / 8 GB'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">Triangles</span>
              <span className="font-extrabold text-white font-mono">{activeModel?.stats?.triangles}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">Vertices</span>
              <span className="font-extrabold text-white font-mono">{activeModel?.stats?.vertices}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">Materials</span>
              <span className="font-extrabold text-white font-mono">{activeModel?.stats?.materials}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">Texture Res.</span>
              <span className="font-extrabold text-white font-mono">{activeModel?.id === 'triposr' || activeModel?.id === 'hunyuan3d-2' ? '4K (PBR)' : '--'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[hsl(var(--muted-foreground))]">File Size (Est.)</span>
              <span className="font-extrabold text-[hsl(var(--primary))] font-mono">{activeModel?.stats?.size}</span>
            </div>
          </div>
        </div>

        {/* CARD 3: EXPORT OPTIONS */}
        <div className="bg-[#14141A] border border-[#242430] rounded-2xl p-4 flex flex-col gap-3" id="export-container">
          <span className="text-[10px] font-black uppercase tracking-widest text-white border-b border-[#242430] pb-2">EXPORT OPTIONS</span>

          {/* Formats row */}
          <div className="grid grid-cols-5 gap-1 bg-[#1A1A22] p-1 rounded-xl border border-[#242430]">
            {(['GLB', 'FBX', 'OBJ', 'USDZ', 'STL'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setExportFormat(fmt)}
                className={`py-1.5 text-[10px] font-black rounded-lg transition-all ${
                  exportFormat === fmt
                    ? 'bg-[hsl(var(--primary))] text-black shadow-sm'
                    : 'text-[#8E8E93] hover:text-white'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>

          {/* Trigger Export Button */}
          <button
            onClick={() => {
              const urls = currentJob?.result?.downloadUrls;
              const url = urls?.[exportFormat.toLowerCase() as keyof typeof urls] || urls?.['glb'];
              if (!url) {
                toast.warning('No generated assets found in this session. Generate a model first.');
                return;
              }
              const link = document.createElement('a');
              link.href = url;
              link.download = `model_export.${exportFormat.toLowerCase()}`;
              link.target = '_blank';
              link.rel = 'noopener noreferrer';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              toast.success(`Exporting model as ${exportFormat}...`);
            }}
            className={`w-full font-black py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all ${
              currentJob?.status === 'completed' || currentJob?.result?.downloadUrls
                ? 'bg-[hsl(var(--primary))] hover:brightness-110 text-black cursor-pointer shadow-[0_4px_16px_rgba(245,166,35,0.2)]'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50'
            }`}
          >
            <Download size={13} className="stroke-[3]" />
            Export Model
          </button>
        </div>

        {/* CARD 4: RECENT PROJECTS / HISTORY */}
        <div className="bg-[#14141A] border border-[#242430] rounded-2xl p-4 flex flex-col gap-3" id="history-container">
          <div className="flex justify-between items-center border-b border-[#242430] pb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-white">HISTORY</span>
            <span className="text-[9px] font-black text-[hsl(var(--primary))] hover:underline cursor-pointer">View All</span>
          </div>

          <div className="flex flex-col gap-2">
            {history && history.slice(0, 4).map((item, idx) => (
              <div
                key={item.id || idx}
                onClick={() => onLoadProject && onLoadProject(item)}
                className="flex items-center gap-3 p-2 rounded-xl bg-[#1A1A22] hover:bg-[#22222D] border border-[#242430] cursor-pointer transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-[#242430] flex items-center justify-center text-[hsl(var(--primary))] shrink-0 border border-[#242430]">
                  <Box size={16} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-bold text-white truncate">{item.name}</span>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono">{item.timestamp}</span>
                </div>
                <ChevronRight size={12} className="text-[hsl(var(--muted-foreground))]" />
              </div>
            ))}
            {history === null ? (
              <>
{Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-[#1A1A22] border border-[#242430]">
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

    </div>
  );
}
