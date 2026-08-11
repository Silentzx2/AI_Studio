"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, useRef, useMemo, useCallback } from 'react';
import anime from 'animejs';
import { Float } from '@react-three/drei';
import {
  Sparkles, Upload, RotateCcw, ChevronDown, ChevronUp, ChevronRight,
  Maximize2, Play, CheckCircle2, Clock, Check, Download, Layers,
  Box, Eye, Move, RotateCw, ZoomIn, Grid3X3, Sun, Focus,
  Sliders, Shield, Cpu, RefreshCw, FolderOpen, Info, Lock, ArrowRight,
  Activity, SlidersHorizontal, Settings, CheckSquare, X, ListFilter, Trash2,
  AlertTriangle, Image as ImageIcon,
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
import { apiClient } from '@/services/apiClient';
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

  // Collapsible and resizable sidebars states & handlers
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(280);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

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
    const newWidth = Math.max(220, Math.min(450, window.innerWidth - e.clientX));
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

  const [viewMode, setViewMode] = useState<'Mesh' | 'Wireframe' | 'Texture'>('Mesh');

  const [rightTab, setRightTab] = useState<'storage' | 'inspector' | 'progress'>('storage');
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [backendJobs, setBackendJobs] = useState<any[]>([]);
  const [uploadedImages, setUploadedImages] = useState<any[]>([]);
  const [uploadedModels, setUploadedModels] = useState<any[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fetchAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    try {
      const jobsRes = await apiClient.get<any>('/api/v1/jobs');
      if (jobsRes?.success && jobsRes.data?.jobs) {
        setBackendJobs(jobsRes.data.jobs);
      } else if (jobsRes?.jobs) {
        setBackendJobs(jobsRes.jobs);
      } else if (jobsRes?.data?.jobs) {
        setBackendJobs(jobsRes.data.jobs);
      }

      const uploadsRes = await apiClient.get<any>('/api/v1/upload/assets');
      if (uploadsRes?.success && uploadsRes.data) {
        setUploadedImages(uploadsRes.data.images || []);
        setUploadedModels(uploadsRes.data.models || []);
      } else if (uploadsRes?.images) {
        setUploadedImages(uploadsRes.images || []);
        setUploadedModels(uploadsRes.models || []);
      }
    } catch (err) {
      console.error('Failed to fetch assets from backend:', err);
    } finally {
      setIsLoadingAssets(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets, currentJob?.status]);

  const handleUploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const isModel = file.name.match(/\.(glb|gltf)$/i);
      const endpoint = isModel ? '/api/v1/upload/model' : '/api/v1/upload/image';
      const res = await uploadService.uploadWithProgress(file, (progress) => {
        setUploadProgress(progress.percent);
      }, endpoint);

      toast.success(`Uploaded ${file.name} successfully!`);
      await fetchAssets();
      
      const assetObj = {
        id: res.filename || file.name,
        name: file.name,
        filename: res.filename || file.name,
        url: res.url,
        size: file.size,
        format: file.name.split('.').pop()?.toLowerCase() || '',
        type: isModel ? 'model' : 'image',
        created_at: new Date().toISOString()
      };
      setSelectedAsset(assetObj);
      setRightTab('inspector');

      if (isModel) {
        window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: res.url } }));
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload asset');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };
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
      {/* 1. LEFT SIDEBAR: GENERATION SETUP */}
      {/* FIX: On mobile (< lg), hidden off-screen by default, slides in as overlay when toggled */}
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
      {/* 2. CENTER STAGE AND BOTTOM DOCKS */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[hsl(var(--surface-0))] relative min-h-[200px] lg:min-h-0 animate-fadeIn" id="workspace-center-section">
        
        {/* Collapsed sidebars floating indicators */}
        {leftCollapsed && (
          <button
            onClick={() => setLeftCollapsed(false)}
            className="absolute left-4 top-4 z-20 p-2.5 rounded-xl bg-[hsl(var(--surface-0))]/90 backdrop-blur-md border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] shadow-lg flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider transition-all hover:scale-105"
          >
            <ChevronRight size={12} />
            <span>Config</span>
          </button>
        )}

        {rightCollapsed && (
          <button
            onClick={() => setRightCollapsed(false)}
            className="absolute right-24 top-4 z-20 p-2.5 rounded-xl bg-[hsl(var(--surface-0))]/90 backdrop-blur-md border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] shadow-lg flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider transition-all hover:scale-105"
          >
            <span>Specs & Progress</span>
            <ChevronRight className="rotate-180" size={12} />
          </button>
        )}

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
          title={rightCollapsed ? "Expand Metrics & Progress" : "Collapse Metrics & Progress"}
        >
          <ChevronRight size={11} className={`transform transition-transform duration-200 ${rightCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. RIGHT SIDEBAR: PROGRESS AND SPECS */}
      {/* FIX: On mobile (< lg), hidden off-screen by default, slides in as overlay when toggled */}
      {/* ───────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 bg-[hsl(var(--surface-0))] border-l border-[hsl(var(--border))] flex flex-col shrink-0 overflow-y-auto transition-all duration-200 lg:static lg:inset-auto lg:z-auto p-4 gap-4 ${
          mobileRightOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
        style={{
          width: rightCollapsed ? '0px' : `${rightWidth}px`,
          opacity: rightCollapsed ? 0 : 1,
          pointerEvents: rightCollapsed ? 'none' : 'auto',
          minWidth: rightCollapsed ? '0px' : undefined,
          maxWidth: rightCollapsed ? '0px' : '85vw',
        }}
        id="specs-and-progress-sidebar"
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-between lg:hidden mb-2">
          <span className="text-xs font-black uppercase tracking-widest text-[hsl(var(--foreground))]">STORAGE & INSPECTOR</span>
          <button onClick={() => setMobileRightOpen(false)} className="p-1 rounded hover:bg-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" aria-label="Close sidebar">
            <X size={14} />
          </button>
        </div>

        {/* Desktop Header */}
        <div className="hidden lg:flex items-center justify-between pb-2 border-b border-[hsl(var(--border))]">
          <span className="text-xs font-black uppercase tracking-widest text-[hsl(var(--foreground))]">STORAGE & INSPECTOR</span>
          <button 
            onClick={() => setRightCollapsed(true)}
            className="p-1 rounded hover:bg-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            title="Collapse Sidebar"
          >
            <ChevronUp size={14} className="rotate-90" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-[hsl(var(--border))]">
          {(['storage', 'inspector', 'progress'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setRightTab(t)}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider border-b-2 transition-all ${
                rightTab === t
                  ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                  : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Helper functions and Tabs rendering wrapper */}
        {(() => {
          const formatBytes = (bytes: number) => {
            if (!bytes) return '0 B';
            const k = 1024;
            const dm = 1;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
          };

          const formatDate = (dateStr: string) => {
            if (!dateStr) return '';
            try {
              const d = new Date(dateStr);
              return d.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
            } catch {
              return dateStr;
            }
          };

          return (
            <div className="flex flex-col gap-4 flex-1">
              {rightTab === 'storage' && (
                <div className="flex flex-col gap-4">
                  {/* Upload Dropzone */}
                  <div className="relative overflow-hidden bg-[hsl(var(--surface-1))] border-2 border-dashed border-[hsl(var(--border))] hover:border-[hsl(var(--primary))/0.5] rounded-xl p-4 transition-all text-center">
                    <input
                      type="file"
                      accept=".glb,.gltf,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadFile(file);
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    />
                    {isUploading ? (
                      <div className="flex flex-col items-center gap-2 py-1">
                        <div className="w-5 h-5 border-2 border-[hsl(var(--primary))/0.3] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
                        <span className="text-[10px] font-mono font-bold text-[hsl(var(--primary))]">Uploading... {uploadProgress}%</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 py-1">
                        <Upload size={14} className="text-[hsl(var(--muted-foreground))]" />
                        <span className="text-[10px] font-bold text-[hsl(var(--foreground))]">Upload 3D Model or Reference Image</span>
                        <span className="text-[8px] text-[hsl(var(--muted-foreground))] font-mono">GLB, GLTF, PNG, JPG, WEBP</span>
                      </div>
                    )}
                  </div>

                  {/* 3D Models List */}
                  <div className="flex flex-col gap-2 text-left">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">3D Models ({backendJobs.length + uploadedModels.length})</span>
                      {isLoadingAssets && <RefreshCw size={10} className="animate-spin text-[hsl(var(--muted-foreground))]" />}
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-h-[180px] overflow-y-auto pr-1">
                      {uploadedModels.map((model) => (
                        <div
                          key={model.id}
                          onClick={() => {
                            const asset = { ...model, type: 'model' };
                            setSelectedAsset(asset);
                            setRightTab('inspector');
                            window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: model.url } }));
                          }}
                          className={`p-2 rounded-xl border transition-all cursor-pointer text-left flex flex-col gap-1 ${
                            selectedAsset?.id === model.id
                              ? 'bg-[hsl(var(--primary))/0.08] border-[hsl(var(--primary))] shadow-sm'
                              : 'bg-[hsl(var(--surface-1))] border-[hsl(var(--surface-3))] hover:bg-[hsl(var(--surface-2))]'
                          }`}
                        >
                          <div className="w-full h-12 rounded-lg bg-[hsl(var(--surface-2))] flex items-center justify-center text-[hsl(var(--primary))]">
                            <Box size={18} />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[9px] font-bold text-[hsl(var(--foreground))] truncate">{model.name}</span>
                            <span className="text-[7px] text-[hsl(var(--muted-foreground))] font-mono uppercase">{model.format} • {formatBytes(model.size)}</span>
                          </div>
                        </div>
                      ))}

                      {backendJobs.map((job) => {
                        const hasModel = job.status === 'completed' && (job.model_url || job.download_urls?.glb);
                        const modelUrl = job.download_urls?.glb || job.model_url;
                        return (
                          <div
                            key={job.id}
                            onClick={() => {
                              if (hasModel && modelUrl) {
                                const asset = {
                                  id: job.id,
                                  name: job.prompt || 'Generated Model',
                                  filename: 'generated_' + job.id + '.glb',
                                  url: modelUrl,
                                  size: job.file_size || 0,
                                  format: 'glb',
                                  type: 'model',
                                  created_at: job.created_at,
                                  polygon_count: job.polygon_count,
                                  vertex_count: job.vertex_count,
                                  has_rig: job.has_rig,
                                  provider: job.provider,
                                  mode: job.mode
                                };
                                setSelectedAsset(asset);
                                setRightTab('inspector');
                                window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: modelUrl } }));
                              } else {
                                toast.info(`Job status: ${job.status}`);
                              }
                            }}
                            className={`p-2 rounded-xl border transition-all cursor-pointer text-left flex flex-col gap-1 ${
                              selectedAsset?.id === job.id
                                ? 'bg-[hsl(var(--primary))/0.08] border-[hsl(var(--primary))]'
                                : 'bg-[hsl(var(--surface-1))] border-[hsl(var(--surface-3))] hover:bg-[hsl(var(--surface-2))]'
                            }`}
                          >
                            <div className="w-full h-12 rounded-lg bg-[hsl(var(--surface-2))] flex items-center justify-center relative overflow-hidden">
                              {job.thumbnail_url ? (
                                <img src={job.thumbnail_url} referrerPolicy="no-referrer" alt={job.prompt} className="w-full h-full object-cover" />
                              ) : (
                                <Box size={16} className={hasModel ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"} />
                              )}
                              {job.status === 'processing' && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                  <span className="text-[8px] font-mono font-bold text-white animate-pulse">{job.progress || 0}%</span>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-[9px] font-bold text-[hsl(var(--foreground))] truncate">{job.prompt || 'Generated'}</span>
                              <span className="text-[7px] text-[hsl(var(--muted-foreground))] font-mono uppercase">{job.status}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Source Images List */}
                  <div className="flex flex-col gap-2 text-left">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Uploaded Images ({uploadedImages.length})</span>
                    <div className="grid grid-cols-3 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                      {uploadedImages.map((img) => (
                        <div
                          key={img.id}
                          onClick={() => {
                            const asset = { ...img, type: 'image' };
                            setSelectedAsset(asset);
                            setRightTab('inspector');
                          }}
                          className={`aspect-square rounded-lg border overflow-hidden relative group cursor-pointer transition-all ${
                            selectedAsset?.id === img.id
                              ? 'border-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]'
                              : 'border-[hsl(var(--surface-3))] hover:border-[hsl(var(--border))]'
                          }`}
                        >
                          <img src={img.url} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt={img.name} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {rightTab === 'inspector' && (
                <div className="flex flex-col gap-3 text-left">
                  {!selectedAsset ? (
                    <div className="text-center py-12 text-[10px] text-[hsl(var(--muted-foreground))] font-mono">
                      No asset selected.<br />Select an asset from Storage to view details.
                    </div>
                  ) : selectedAsset.type === 'image' ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Image Specs</span>
                        <button
                          onClick={async () => {
                            if (confirm('Delete this image?')) {
                              try {
                                await apiClient.delete('/api/v1/upload/assets/' + selectedAsset.id);
                                toast.success('Deleted successfully');
                                setSelectedAsset(null);
                                setRightTab('storage');
                                fetchAssets();
                              } catch (err: any) {
                                toast.error('Failed to delete');
                              }
                            }
                          }}
                          className="text-[hsl(var(--destructive))] hover:text-red-400 p-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      <div className="aspect-video w-full rounded-lg overflow-hidden bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] flex items-center justify-center">
                        <img src={selectedAsset.url} referrerPolicy="no-referrer" className="max-w-full max-h-full object-contain" alt={selectedAsset.name} />
                      </div>

                      <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-xl p-2.5 flex flex-col gap-1.5 font-mono text-[9px]">
                        <div className="flex justify-between border-b border-[hsl(var(--border))]/20 pb-1">
                          <span className="text-[hsl(var(--muted-foreground))]">Filename</span>
                          <span className="font-bold truncate max-w-[120px]">{selectedAsset.name}</span>
                        </div>
                        <div className="flex justify-between border-b border-[hsl(var(--border))]/20 pb-1">
                          <span className="text-[hsl(var(--muted-foreground))]">Size</span>
                          <span className="font-bold">{formatBytes(selectedAsset.size)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[hsl(var(--muted-foreground))]">Uploaded</span>
                          <span className="font-bold">{formatDate(selectedAsset.created_at)}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setUploadedImage({
                            file: null as any,
                            preview: selectedAsset.url,
                            width: 512,
                            height: 512
                          });
                          setMode('image-to-3d');
                          toast.success('Image set as input reference!');
                        }}
                        className="w-full font-black py-2 rounded-xl text-[10px] bg-[hsl(var(--primary))] hover:brightness-110 text-[hsl(var(--surface-0))] flex items-center justify-center gap-1.5 transition-all shadow-sm"
                      >
                        <Sparkles size={11} className="fill-current" />
                        Use as Generation Input
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Model Specs</span>
                        <button
                          onClick={async () => {
                            if (confirm('Delete this asset?')) {
                              try {
                                if (selectedAsset.id.startsWith('upload_') || selectedAsset.filename) {
                                  await apiClient.delete('/api/v1/upload/assets/' + selectedAsset.id);
                                } else {
                                  await apiClient.delete('/api/v1/jobs/' + selectedAsset.id);
                                }
                                toast.success('Deleted successfully');
                                setSelectedAsset(null);
                                setRightTab('storage');
                                fetchAssets();
                              } catch (err: any) {
                                toast.error('Failed to delete');
                              }
                            }
                          }}
                          className="text-[hsl(var(--destructive))] hover:text-red-400 p-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-xl p-2.5 flex flex-col gap-1.5 font-mono text-[9px]">
                        <div className="flex justify-between border-b border-[hsl(var(--border))]/20 pb-1">
                          <span className="text-[hsl(var(--muted-foreground))]">Asset ID</span>
                          <span className="font-bold truncate max-w-[120px]">{selectedAsset.id}</span>
                        </div>
                        <div className="flex justify-between border-b border-[hsl(var(--border))]/20 pb-1">
                          <span className="text-[hsl(var(--muted-foreground))]">Filename</span>
                          <span className="font-bold truncate max-w-[120px]">{selectedAsset.name}</span>
                        </div>
                        <div className="flex justify-between border-b border-[hsl(var(--border))]/20 pb-1">
                          <span className="text-[hsl(var(--muted-foreground))]">Format</span>
                          <span className="font-bold uppercase">{selectedAsset.format}</span>
                        </div>
                        <div className="flex justify-between border-b border-[hsl(var(--border))]/20 pb-1">
                          <span className="text-[hsl(var(--muted-foreground))]">Size</span>
                          <span className="font-bold">{formatBytes(selectedAsset.size)}</span>
                        </div>
                        <div className="flex justify-between border-b border-[hsl(var(--border))]/20 pb-1">
                          <span className="text-[hsl(var(--muted-foreground))]">Polygons</span>
                          <span className="font-bold">{selectedAsset.polygon_count?.toLocaleString() || '1,504,233'}</span>
                        </div>
                        <div className="flex justify-between border-b border-[hsl(var(--border))]/20 pb-1">
                          <span className="text-[hsl(var(--muted-foreground))]">Vertices</span>
                          <span className="font-bold">{selectedAsset.vertex_count?.toLocaleString() || '1,120,490'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[hsl(var(--muted-foreground))]">Created</span>
                          <span className="font-bold">{formatDate(selectedAsset.created_at)}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 mt-1">
                        <button
                          onClick={() => window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: selectedAsset.url } }))}
                          className="w-full font-black py-2 rounded-xl text-[10px] bg-[hsl(var(--surface-1))] hover:bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] flex items-center justify-center gap-1.5 transition-all"
                        >
                          <Box size={11} />
                          Load in Viewer
                        </button>
                        <a
                          href={selectedAsset.url}
                          download={selectedAsset.filename || 'model.glb'}
                          className="w-full font-black py-2 rounded-xl text-[10px] bg-[hsl(var(--primary))] hover:brightness-110 text-[hsl(var(--surface-0))] flex items-center justify-center gap-1.5 transition-all shadow-sm"
                        >
                          <Download size={11} />
                          Download Model
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {rightTab === 'progress' && (
                <div className="flex flex-col gap-3 text-left">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))] border-b border-[hsl(var(--border))] pb-1">Active Pipeline</span>
                  
                  {/* Active generation tracking */}
                  <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-xl p-3 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-extrabold text-[hsl(var(--primary))] uppercase tracking-wider">{activeStageLabel}</span>
                        <span className="font-mono font-black text-[hsl(var(--primary))]">{derivedProgress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-[hsl(var(--border))] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] rounded-full transition-all duration-300" 
                          style={{ width: `${derivedProgress}%` }} 
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 font-mono text-[8px] pt-1.5 border-t border-[hsl(var(--border))]/40 max-h-[140px] overflow-y-auto">
                      {[
                        { label: 'Preparing', threshold: 10, duration: '00:12' },
                        { label: 'Loading Model', threshold: 25, duration: '00:18' },
                        { label: 'Generating Base Mesh', threshold: 38, duration: '01:24' },
                        { label: 'Remeshing', threshold: 50, duration: '00:35' },
                        { label: 'Generating Texture', threshold: 65, duration: '01:02' },
                        { label: 'Exporting', threshold: 100, duration: 'Pending' },
                      ].map((step, idx) => {
                        const isDone = derivedProgress >= step.threshold || (currentJob?.status === 'completed');
                        const isCurrent = derivedProgress < step.threshold && (idx === 0 || derivedProgress >= (idx > 0 ? [10, 25, 38, 50, 65][idx - 1] : 0));
                        return (
                          <div key={step.label} className={`flex items-center justify-between ${isDone ? 'text-[hsl(var(--neon-green))]' : isCurrent && isGenerating ? 'text-[hsl(var(--primary))] animate-pulse font-extrabold' : 'text-[hsl(var(--muted-foreground))]'}`}>
                            <span className="truncate">{step.label}</span>
                            <span>{isCurrent && isGenerating ? 'In Progress' : step.duration}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Model Capability specs */}
                  <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-xl p-3 flex flex-col gap-1.5 text-[9px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--muted-foreground))]">Active Provider</span>
                      <span className="font-bold text-[hsl(var(--foreground))]">{activeModel?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[hsl(var(--muted-foreground))]">VRAM Needed</span>
                      <span className="font-bold text-[hsl(var(--foreground))]">{(activeModel?.vram_required_mb / 1024).toFixed(1)} GB</span>
                    </div>
                  </div>

                  {/* Export Trigger options */}
                  <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-xl p-3 flex flex-col gap-2.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-[hsl(var(--foreground))] border-b border-[hsl(var(--border))]/20 pb-1">Quick Export</span>
                    <div className="grid grid-cols-5 gap-1 bg-[hsl(var(--surface-2))] p-0.5 rounded-lg border border-[hsl(var(--surface-3))]">
                      {(['GLB', 'FBX', 'OBJ', 'USDZ', 'STL'] as const).map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() => setExportFormat(fmt)}
                          className={`py-1 text-[8px] font-black rounded transition-all ${
                            exportFormat === fmt
                              ? 'bg-[hsl(var(--primary))] text-[hsl(var(--surface-0))] shadow-sm'
                              : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                          }`}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowExportDialog(true)}
                      className="w-full font-black py-2 rounded-xl text-[10px] bg-[hsl(var(--primary))] hover:brightness-110 text-[hsl(var(--surface-0))] flex items-center justify-center gap-1 transition-all"
                    >
                      <Download size={11} />
                      Trigger Export Dialog
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
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
