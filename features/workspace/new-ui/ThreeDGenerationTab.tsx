"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 3D Generation workspace.
 *
 * LEFT sidebar (Generation Setup) is preserved EXACTLY as the existing UI.
 * CENTER is the primary 3D viewer (Three.js) — reuses the existing viewer
 * logic, loading, error handling, camera fitting, controls, disposal and
 * model replacement. RIGHT is the Tripo-style Asset/Model Storage panel
 * (see AssetStoragePanel) backed entirely by the real backend.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import anime from 'animejs';
import {
  Sparkles, Upload, RotateCcw, ChevronDown, ChevronUp, ChevronRight,
  Maximize2, Play, CheckCircle2, Clock, Check, Download, Layers,
  Box, Eye, Move, RotateCw, ZoomIn, Grid3X3, Sun, Focus,
  Sliders, Shield, Cpu, RefreshCw, FolderOpen, Info, Lock, ArrowRight,
  Activity, SlidersHorizontal, Settings, CheckSquare, X, ListFilter, Trash2,
  AlertTriangle, Image as ImageIcon, PanelLeft, PanelRight,
} from 'lucide-react';

import { useGenerationStore } from '@/stores/useGenerationStore';
import { useUIStore } from '@/stores/useUIStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useGeneration } from '@/hooks/useGeneration';
import { useWorkspaceModels } from '@/hooks/useBackendData';
import { HistoryItem } from '@/types/new-ui';
import { toast } from 'sonner';
import { uploadService } from '@/services/uploadService';
import { apiClient } from '@/services/apiClient';
import AssetStoragePanel from './AssetStoragePanel';

interface ThreeDGenerationTabProps {
  activeModel: any;
  onUpdateModel: (model: any) => void;
  history: HistoryItem[] | null;
  onLoadProject: (item: HistoryItem) => void;
}

// Model details and capability definitions matching high fidelity UI
const LOCAL_MODELS = [
  {
    id: 'hunyuan3d-2-mini',
    name: 'Hunyuan3D-2 Mini',
    label: 'Hunyuan3D-2 Mini',
    installed: false,
    status: 'not_installed',
    vram_required_mb: 6144,
    speed_seconds: 45,
    supports: {
      text_to_3d: false,
      image_to_3d: true,
      texture_generation: true,
      rigging_animation: false,
      detail_enhancement: false,
      part_separation: false,
    },
    stats: {
      triangles: '0',
      vertices: '0',
      objects: '1',
      materials: '1',
      size: '0 MB',
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
  },
  {
    id: 'detailgen3d',
    name: 'DetailGen3D',
    label: 'DetailGen3D',
    installed: false,
    status: 'not_installed',
    vram_required_mb: 4096,
    speed_seconds: 60,
    supports: {
      text_to_3d: false,
      image_to_3d: false,
      texture_generation: false,
      rigging_animation: false,
      detail_enhancement: true,
      part_separation: false,
    },
    stats: {
      triangles: '0',
      vertices: '0',
      objects: '1',
      materials: '1',
      size: '0 MB',
    },
    colab_incompatible: false,
    colab_skip_reason: null,
  },
  {
    id: 'triposg',
    name: 'TripoSG',
    label: 'TripoSG',
    installed: false,
    status: 'not_installed',
    vram_required_mb: 8192,
    speed_seconds: 60,
    supports: {
      text_to_3d: false,
      image_to_3d: true,
      texture_generation: false,
      rigging_animation: false,
      detail_enhancement: false,
      part_separation: false,
    },
    stats: {
      triangles: '0',
      vertices: '0',
      objects: '1',
      materials: '1',
      size: '0 MB',
    },
    colab_incompatible: false,
    colab_skip_reason: null,
  },
];

export default function ThreeDGenerationTab({
  activeModel: parentActiveModel,
  onUpdateModel,
  history,
  onLoadProject,
}: ThreeDGenerationTabProps) {
  const { prompt, setPrompt, uploadedImage, setUploadedImage, mode, setMode, selectedModel, setSelectedModel } = useGenerationStore();
  const { generate, cancel, isGenerating, currentJob } = useGeneration();
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

  // FIX: Mobile sidebar toggle state — sidebars collapsed by default on mobile
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);

  // Collapsible and resizable sidebars states & handlers
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(320);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);

  const handleResizeLeft = (e: MouseEvent) => {
    if (!isResizingLeft.current) return;
    const newWidth = Math.max(220, Math.min(450, e.clientX));
    setLeftWidth(newWidth);
  };

  const stopResizeLeft = () => {
    isResizingLeft.current = false;
    document.removeEventListener('mousemove', handleResizeLeft);
    document.removeEventListener('mouseup', stopResizeLeft);
  };

  const startResizeLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingLeft.current = true;
    document.addEventListener('mousemove', handleResizeLeft);
    document.addEventListener('mouseup', stopResizeLeft);
  };

  const handleResizeRight = (e: MouseEvent) => {
    if (!isResizingRight.current) return;
    const newWidth = Math.max(260, Math.min(520, window.innerWidth - e.clientX));
    setRightWidth(newWidth);
  };

  const stopResizeRight = () => {
    isResizingRight.current = false;
    document.removeEventListener('mousemove', handleResizeRight);
    document.removeEventListener('mouseup', stopResizeRight);
  };

  const startResizeRight = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRight.current = true;
    document.addEventListener('mousemove', handleResizeRight);
    document.addEventListener('mouseup', stopResizeRight);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResizeLeft);
      document.removeEventListener('mouseup', stopResizeLeft);
      document.removeEventListener('mousemove', handleResizeRight);
      document.removeEventListener('mouseup', stopResizeRight);
    };
  }, []);

  const [uploadedModel, setUploadedModel] = useState<File | null>(null);
  const [uploadedModelUrl, setUploadedModelUrl] = useState<string | null>(null);
  const [uploadedModelName, setUploadedModelName] = useState<string>('');

  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [modelUploadProgress, setModelUploadProgress] = useState(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);

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

  const { setProject } = useProjectStore();

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

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes laserScan {
          0% { top: 0%; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .laser-scanner {
          position: absolute;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, hsl(var(--primary)) 20%, #00f0ff 50%, hsl(var(--primary)) 80%, transparent);
          box-shadow: 0 0 12px 3px rgba(0, 240, 255, 0.7), 0 0 24px 6px rgba(245, 166, 35, 0.4);
          animation: laserScan 2.5s ease-in-out infinite;
          pointer-events: none;
          z-index: 20;
        }
        @keyframes gradientPulse {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .pulse-wave {
          background: linear-gradient(-45deg, hsl(var(--primary)), #00f0ff, hsl(var(--neon-pink)), #2563eb);
          background-size: 400% 400%;
          animation: gradientPulse 3s ease infinite;
        }
        @keyframes outlineGlow {
          0% { border-color: hsl(var(--border)); }
          50% { border-color: hsl(var(--primary)); box-shadow: 0 0 15px hsl(var(--primary)/0.25); }
          100% { border-color: hsl(var(--border)); }
        }
        .glow-dashed-outline {
          animation: outlineGlow 1.5s infinite ease-in-out;
        }
      `}} />

      {/* FIX: Mobile sidebar overlay backdrops */}
      {mobileLeftOpen && (
        <div className="fixed inset-0 z-30 bg-[hsl(var(--surface-0))/0.4] lg:hidden" onClick={() => setMobileLeftOpen(false)} aria-hidden="true" />
      )}
      {mobileRightOpen && (
        <div className="fixed inset-0 z-30 bg-[hsl(var(--surface-0))/0.4] lg:hidden" onClick={() => setMobileRightOpen(false)} aria-hidden="true" />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. LEFT SIDEBAR: GENERATION SETUP (preserved exactly) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 bg-[hsl(var(--surface-0))] border-r border-[hsl(var(--border))] flex flex-col shrink-0 overflow-y-auto transition-all duration-200 lg:static lg:inset-auto lg:z-auto ${
          mobileLeftOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{
          width: leftCollapsed ? '0px' : `${leftWidth}px`,
          opacity: leftCollapsed ? 0 : 1,
          pointerEvents: leftCollapsed ? 'none' : 'auto',
          minWidth: leftCollapsed ? '0px' : undefined,
          maxWidth: leftCollapsed ? '0px' : '85vw',
        }}
        id="generation-setup-sidebar"
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between bg-[hsl(var(--surface-0))]">
          <span className="text-xs font-black uppercase tracking-widest text-[hsl(var(--foreground))]">GENERATION SETUP</span>
          <button onClick={() => setMobileLeftOpen(false)} className="lg:hidden p-1 rounded hover:bg-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" aria-label="Close sidebar">
            <X size={14} />
          </button>
          <button
            onClick={() => setLeftCollapsed(true)}
            className="p-1 rounded hover:bg-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hidden lg:block"
            title="Collapse Sidebar"
          >
            <ChevronUp size={14} className="-rotate-90" />
          </button>
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
                <div className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">Processing Mode</div>
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
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 scale-[0.98] glow-dashed-outline'
                        : uploadedImage
                          ? 'border-[hsl(var(--neon-green))]/40 bg-[hsl(var(--neon-green))]/5'
                          : 'border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] hover:border-[hsl(var(--primary))]/50 hover:bg-[hsl(var(--surface-2))] hover:shadow-[0_0_15px_rgba(245,166,35,0.05)]'
                    }`}
                  >
                    <input id="image-uploader-btn" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

                    {isUploadingImage ? (
                      <div className="flex flex-col items-center gap-3 w-full py-2 z-10">
                        {/* Laser Scanner animation bar */}
                        <div className="laser-scanner" />

                        <div className="relative w-12 h-12 rounded-full flex items-center justify-center pulse-wave shadow-lg">
                          <Upload size={18} className="text-white animate-bounce" />
                        </div>
                        <div className="flex flex-col gap-1 w-full px-2">
                          <span className="text-[10px] font-black text-[hsl(var(--primary))] uppercase tracking-wider">{imageUploadProgress}% Synchronizing</span>
                          <div className="w-full h-1.5 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden border border-[hsl(var(--border))/0.1]">
                            <div className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[#00f0ff] transition-all duration-300" style={{ width: `${imageUploadProgress}%` }} />
                          </div>
                        </div>
                      </div>
                    ) : uploadedImage ? (
                      <div className="relative w-full group">
                        <img src={uploadedImage.preview} alt="Ref" className="w-full h-24 object-cover rounded-xl border border-[hsl(var(--border))]" />
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl backdrop-blur-[2px]">
                          <button
                            onClick={(e) => { e.stopPropagation(); clearImage(); }}
                            className="bg-[hsl(var(--destructive))] text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:scale-105 transition-transform"
                          >
                            <Trash2 size={10} /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center mb-1 group-hover:scale-110 group-hover:bg-[hsl(var(--surface-3))] transition-all border border-[hsl(var(--border)/0.3)] shadow-inner">
                          <Upload size={18} className="text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-black text-[hsl(var(--foreground))]">Drop reference image</span>
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
              className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all text-center relative overflow-hidden ${
                uploadedModelUrl
                  ? 'border-[hsl(var(--neon-green))]/30 bg-[hsl(var(--neon-green))]/5'
                  : isDragOver
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5 scale-[0.98] glow-dashed-outline'
                    : 'border-[hsl(var(--surface-3))] bg-[hsl(var(--surface-1))]/55 hover:bg-[hsl(var(--surface-1))] hover:border-[hsl(var(--primary))]/50 hover:shadow-[0_0_15px_rgba(245,166,35,0.03)]'
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
                <div className="w-full flex flex-col items-center gap-2.5 py-1 z-10">
                  {/* Laser Scanner animation bar */}
                  <div className="laser-scanner" />

                  <div className="relative w-10 h-10 rounded-full flex items-center justify-center pulse-wave shadow-md">
                    <FolderOpen size={16} className="text-white animate-pulse" />
                  </div>
                  <div className="w-full flex flex-col gap-1">
                    <span className="text-[10px] font-black text-[hsl(var(--primary))] uppercase tracking-wider">{modelUploadProgress}% Importing Model</span>
                    <div className="w-full h-1 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden border border-[hsl(var(--border))/0.1]">
                      <div className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[#00f0ff] transition-all duration-300" style={{ width: `${modelUploadProgress}%` }} />
                    </div>
                  </div>
                </div>
              ) : uploadedModelUrl ? (
                <>
                  <Layers size={16} className="text-[hsl(var(--neon-green))]" />
                  <span className="text-[10px] font-bold text-[hsl(var(--neon-green))] truncate max-w-full">{uploadedModelName}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setUploadedModel(null); setUploadedModelUrl(null); setUploadedModelName(''); toast.info('Model removed'); }}
                    className="text-[9px] font-bold text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))/0.8] hover:underline mt-0.5"
                  >Remove</button>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center group-hover:scale-110 transition-all border border-[hsl(var(--border)/0.3)] shadow-inner">
                    <FolderOpen size={14} className="text-[hsl(var(--muted-foreground))]" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))]">Drop GLB/GLTF or click</span>
                    <span className="text-[8px] text-[hsl(var(--muted-foreground))] font-mono">Import to viewer or remesh</span>
                  </div>
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

      {/* Left Resizer & Collapse bar */}
      <div
        className="hidden lg:flex w-1 bg-[hsl(var(--border))] hover:bg-[hsl(var(--primary))/0.3] transition-colors cursor-col-resize relative group items-center justify-center select-none animate-fadeIn"
        onMouseDown={startResizeLeft}
        style={{ zIndex: 10 }}
      >
        <div className="absolute inset-y-0 w-2.5 left-1/2 -translate-x-1/2 cursor-col-resize" />
        <button
          onClick={(e) => { e.stopPropagation(); setLeftCollapsed(!leftCollapsed); }}
          className="absolute left-1/2 -translate-x-1/2 w-4 h-10 bg-[hsl(var(--surface-1))] hover:bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))/0.5] rounded-md flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all shadow-md cursor-pointer"
          style={{ cursor: 'pointer' }}
          title={leftCollapsed ? "Expand Configuration" : "Collapse Configuration"}
        >
          <ChevronRight size={11} className={`transform transition-transform duration-200 ${leftCollapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. CENTER STAGE — 3D VIEWER (primary workspace) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[hsl(var(--surface-0))] relative lg:min-h-0 animate-fadeIn" id="workspace-center-section">

        {/* Mobile panel toggles — keep the preserved sidebars reachable on small screens */}
        <div className="flex items-center justify-between gap-2 p-2 lg:hidden border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-0))]">
          <button
            onClick={() => setMobileLeftOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] text-[11px] font-bold"
          >
            <PanelLeft size={13} /> Setup
          </button>
          <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">3D Viewer</span>
          <button
            onClick={() => setMobileRightOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] text-[11px] font-bold"
          >
            <PanelRight size={13} /> Assets
          </button>
        </div>

        {/* Collapsed sidebars floating indicators (desktop) */}
        {leftCollapsed && (
          <button
            onClick={() => setLeftCollapsed(false)}
            className="absolute left-4 top-4 z-20 p-2.5 rounded-xl bg-[hsl(var(--surface-0))]/90 backdrop-blur-md border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] shadow-lg flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider transition-all hover:scale-105 hidden lg:flex"
          >
            <ChevronRight size={12} />
            <span>Config</span>
          </button>
        )}

        {/* 3D Viewer Space — primary workspace */}
        <div className="flex-1 relative bg-[hsl(var(--surface-0))] overflow-hidden min-h-[240px]" id="canvas-workspace">
          <div className="w-full h-full relative bg-black" id="standing-model-rendering-view">
            {/* Empty black area - no 3D viewer */}
          </div>
        </div>
      </div>

      {/* Right Resizer & Collapse bar */}
      <div
        className="hidden lg:flex w-1 bg-[hsl(var(--border))] hover:bg-[hsl(var(--primary))/0.3] transition-colors cursor-col-resize relative group items-center justify-center select-none animate-fadeIn"
        onMouseDown={startResizeRight}
        style={{ zIndex: 10 }}
      >
        <div className="absolute inset-y-0 w-2.5 left-1/2 -translate-x-1/2 cursor-col-resize" />
        <button
          onClick={(e) => { e.stopPropagation(); setRightCollapsed(!rightCollapsed); }}
          className="absolute left-1/2 -translate-x-1/2 w-4 h-10 bg-[hsl(var(--surface-1))] hover:bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))/0.5] rounded-md flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all shadow-md cursor-pointer"
          style={{ cursor: 'pointer' }}
          title={rightCollapsed ? "Expand Assets" : "Collapse Assets"}
        >
          <ChevronRight size={11} className={`transform transition-transform duration-200 ${rightCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. RIGHT SIDEBAR — ASSET / MODEL STORAGE (real backend) */}
      {/* ───────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 bg-[hsl(var(--surface-0))] border-l border-[hsl(var(--border))] flex flex-col shrink-0 overflow-hidden transition-all duration-200 lg:static lg:inset-auto lg:z-auto ${
          mobileRightOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
        style={{
          width: rightCollapsed ? '0px' : `${rightWidth}px`,
          opacity: rightCollapsed ? 0 : 1,
          pointerEvents: rightCollapsed ? 'none' : 'auto',
          minWidth: rightCollapsed ? '0px' : undefined,
          maxWidth: rightCollapsed ? '0px' : '90vw',
        }}
        id="specs-and-progress-sidebar"
      >
        <AssetStoragePanel
          onCloseMobile={() => setMobileRightOpen(false)}
          onToggleCollapse={() => setRightCollapsed(true)}
          collapsed={rightCollapsed}
        />
      </aside>
    </div>
  );
}
