"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * File 1 — Asset + Export UI
 * Handles: asset list, thumbnails, selection, metadata, export/download, history
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, RefreshCw, Download, FileDown, Eye, Trash2,
  Box, Heart, Clock, Hash, Layers,
  CheckCircle2, Lock, Package, Grid3X3, Archive, Upload, Loader2, Image as ImageIcon
} from 'lucide-react';
import { EXPORT_FORMATS } from '@/constants';
import { uploadService } from '@/services/uploadService';
import { apiClient } from '@/services/apiClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { loadModelInViewer } from '@/stores/useViewerStore';
import ExportDialog from '@/features/workspace/new-ui/ExportDialog';
import type { GenerationJob } from '@/types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AssetItem {
  id: string;
  name: string;
  prompt: string;
  format: string;
  timestamp: string;
  thumbnailUrl?: string | null;
  modelUrl?: string | null;
  isFavorite?: boolean;
  job?: GenerationJob;
  type?: 'image' | 'model';
}

interface AssetPanelProps {
  assets: AssetItem[];
  selectedAssetId: string | null;
  onSelectAsset: (asset: AssetItem) => void;
  onToggleFavorite?: (id: string) => void;
  onDeleteAsset?: (id: string) => void;
  onAssetUploaded?: () => void;
  loading?: boolean;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function AssetThumbnail({ asset, isSelected, onClick }: { asset: AssetItem; isSelected: boolean; onClick: () => void }) {
  const handleDragStart = (e: React.DragEvent) => {
    if (asset.type === 'image' && asset.thumbnailUrl) {
      e.dataTransfer.setData('text/plain', asset.thumbnailUrl);
      e.dataTransfer.effectAllowed = 'copy';
    } else if (asset.type === 'model' && asset.modelUrl) {
      e.dataTransfer.setData('text/plain', asset.modelUrl);
      e.dataTransfer.effectAllowed = 'copy';
    }
    e.currentTarget.classList.add('drag-active');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('drag-active');
  };

  return (
    <button
      onClick={onClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      draggable={asset.type === 'image' || asset.type === 'model'}
      className={cn(
        'group relative rounded-lg overflow-hidden border transition-all duration-300 aspect-[4/3]',
        isSelected
          ? 'border-[hsl(var(--primary))] shadow-[0_0_12px_hsl(var(--primary)/0.15)] scale-[0.98]'
          : 'border-[hsl(var(--border))]/[0.12] hover:border-[hsl(var(--border))]/[0.3] bg-[hsl(var(--surface-2))]'
      )}
    >
      {asset.thumbnailUrl ? (
        <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Box size={20} className="text-[hsl(var(--muted-foreground))]/[0.15] group-hover:text-[hsl(var(--muted-foreground))]/[0.3] transition-colors" />
        </div>
      )}
      <div className="absolute bottom-1.5 left-1.5">
        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-black/50 backdrop-blur-sm border border-[hsl(var(--border))]/[0.25] text-[hsl(var(--muted-foreground))]">
          {asset.format}
        </span>
      </div>
      {asset.isFavorite && (
        <div className="absolute top-1.5 right-1.5">
          <Heart size={10} className="fill-[hsl(var(--destructive))] text-[hsl(var(--destructive))] drop-shadow-md" />
        </div>
      )}
    </button>
  );
}

function InspectorPanel({ asset, onDelete }: { asset: AssetItem; onDelete?: (id: string) => void }) {
  const job = asset.job;
  const result = job?.result;
  const [exportOpen, setExportOpen] = useState(false);

  const handleDownload = (format: string, url?: string) => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `model.${format}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Downloading ${format.toUpperCase()}...`);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="aspect-video rounded-lg overflow-hidden bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]/[0.12] relative">
        {asset.thumbnailUrl ? (
          <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Box size={28} className="text-[hsl(var(--muted-foreground))]/[0.15]" />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="text-[11px] font-bold text-[hsl(var(--foreground))] truncate" title={asset.name}>
          {asset.name}
        </h3>
        <p className="text-[10px] text-[hsl(var(--muted-foreground))]/[0.4] font-medium leading-relaxed italic line-clamp-2" title={asset.prompt}>
          "{asset.prompt || 'No prompt'}"
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {[
          { label: 'Format', value: asset.format || 'N/A', icon: FileDown },
          { label: 'Vertices', value: result?.vertexCount ? result.vertexCount.toLocaleString() : '—', icon: Hash },
          { label: 'Faces', value: result?.polygonCount ? result.polygonCount.toLocaleString() : '—', icon: Layers },
          { label: 'Size', value: result?.fileSize ? `${(result.fileSize / 1024 / 1024).toFixed(1)} MB` : '—', icon: Package },
        ].map((meta, i) => {
          const Icon = meta.icon;
          return (
            <div key={i} className="flex flex-col gap-0.5 p-2 rounded-md bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]/[0.1]">
              <div className="flex items-center gap-1 opacity-40">
                <Icon size={10} />
                <span className="text-[8px] font-black uppercase tracking-wider">{meta.label}</span>
              </div>
              <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] tabular-nums">{meta.value}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 px-2 py-1 bg-[hsl(var(--surface-2))] rounded-full w-fit border border-[hsl(var(--border))]/[0.1]">
        <Clock size={10} className="text-[hsl(var(--muted-foreground))]/[0.4]" />
        <span className="text-[9px] font-bold text-[hsl(var(--muted-foreground))]/[0.6]">{asset.timestamp}</span>
      </div>

      <div className="flex gap-1.5">
        {asset.modelUrl && (
          <button
            onClick={() => { if (asset.modelUrl) loadModelInViewer(asset.modelUrl, asset.name); }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[10px] font-black uppercase tracking-widest bg-[hsl(var(--surface-2))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-3))] transition-all border border-[hsl(var(--border))]/[0.12] active:scale-95"
          >
            <Eye size={14} /> Preview
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(asset.id)}
            className="p-2 rounded-md bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]/[0.1] text-[hsl(var(--muted-foreground))]/[0.5] hover:text-red-400 hover:border-red-400/20 hover:bg-red-400/5 transition-all"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="pt-3 border-t border-[hsl(var(--border))]/[0.1] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]/[0.4]">
            <Download size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Export Options</span>
          </div>
          {result && (
            <span className="px-1.5 py-0.5 rounded bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] text-[8px] font-black uppercase">Ready</span>
          )}
        </div>

        <button
          onClick={() => setExportOpen(true)}
          disabled={!asset.modelUrl}
          className={cn(
            'w-full flex items-center justify-center gap-2 p-2.5 rounded-md border transition-all text-[10px] font-bold',
            asset.modelUrl
              ? 'bg-[hsl(var(--surface-2))] border-[hsl(var(--border))]/[0.15] hover:border-[hsl(var(--primary)/0.3)] text-[hsl(var(--foreground))]'
              : 'bg-[hsl(var(--surface-2))] border-transparent text-[hsl(var(--muted-foreground))]/[0.3] cursor-not-allowed'
          )}
        >
          <Archive size={14} />
          Package Export (GLB / ZIP)
        </button>

        <div className="grid grid-cols-2 gap-1.5">
          {EXPORT_FORMATS.map((format) => {
            const url = result?.downloadUrls?.[format.id] || result?.modelUrl;
            const enabled = !!url && !!result;
            return (
              <button
                key={format.id}
                onClick={() => enabled && handleDownload(format.id, url)}
                disabled={!enabled}
                className={cn(
                  'flex flex-col items-center gap-1 p-2 rounded-md border transition-all',
                  enabled
                    ? 'bg-[hsl(var(--surface-2))] border-[hsl(var(--border))]/[0.1] hover:border-[hsl(var(--border))]/[0.25] text-[hsl(var(--foreground))]'
                    : 'bg-[hsl(var(--surface-2))] border-transparent text-[hsl(var(--muted-foreground))]/[0.2] cursor-not-allowed'
                )}
              >
                <FileDown size={14} className={enabled ? 'text-[hsl(var(--muted-foreground))]/[0.6]' : 'text-[hsl(var(--muted-foreground))]/[0.2]'} />
                <span className="text-[9px] font-bold">{format.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <ExportDialog
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        modelUrl={asset.modelUrl ?? undefined}
        modelName={asset.name}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Export                                                        */
/* ------------------------------------------------------------------ */

export default function AssetPanel({
  assets,
  selectedAssetId,
  onSelectAsset,
  onToggleFavorite,
  onDeleteAsset,
  onAssetUploaded,
  loading,
  className,
}: AssetPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [assetTypeFilter, setAssetTypeFilter] = useState<'all' | 'model' | 'image'>('all');
  const [activeTab, setActiveTab] = useState<'assets' | 'inspector'>('assets');
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [modelUploadProgress, setModelUploadProgress] = useState<{ loaded: number; total: number; percent: number } | null>(null);
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);
  const [uploadAssets, setUploadAssets] = useState<AssetItem[]>([]);
  const [isLoadingUploads, setIsLoadingUploads] = useState(false);
  const modelFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchUploadAssets = async () => {
      setIsLoadingUploads(true);
      try {
        const response = await apiClient.get<any>('/api/v1/upload/assets');
        const payload = response?.data ?? response ?? {};
        const images = payload.images || [];
        const models = payload.models || [];
        
        const imageAssets: AssetItem[] = images.map((img: any) => ({
          id: img.id,
          name: img.name || img.filename || 'Untitled Image',
          prompt: '',
          format: img.format?.toUpperCase() || '',
          timestamp: img.created_at || new Date().toISOString(),
          thumbnailUrl: img.url,
          modelUrl: null,
          isFavorite: false,
          job: null,
          type: 'image' as const
        }));
        
        const modelAssets: AssetItem[] = models.map((model: any) => ({
          id: model.id,
          name: model.name || model.filename || 'Untitled Model',
          prompt: '',
          format: model.format?.toUpperCase() || '',
          timestamp: model.created_at || new Date().toISOString(),
          thumbnailUrl: model.thumbnail_url || model.thumbnailUrl || null,
          modelUrl: model.url,
          isFavorite: false,
          job: null,
          type: 'model' as const
        }));
        
        setUploadAssets([...imageAssets, ...modelAssets]);
      } catch (error) {
        console.error('Failed to fetch upload assets:', error);
      } finally {
        setIsLoadingUploads(false);
      }
    };

    fetchUploadAssets();
  }, []);

  const filteredAssets = useMemo(() => {
    const allAssets = [...assets, ...uploadAssets];
    
    return allAssets.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.prompt && a.prompt.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesType =
        assetTypeFilter === 'all' ||
        a.type === assetTypeFilter ||
        (assetTypeFilter === 'model' && ['GLB', 'GLTF', 'OBJ', 'FBX', 'STL'].includes(a.format));
      const matchesCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'favorites' && a.isFavorite) ||
        (categoryFilter === '3d-models' && ['GLB', 'GLTF', 'OBJ', 'FBX', 'STL'].includes(a.format));
      return matchesSearch && matchesType && matchesCategory;
    });
  }, [assets, uploadAssets, searchQuery, categoryFilter, assetTypeFilter]);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  const prevIdRef = React.useRef(selectedAssetId);
  React.useEffect(() => {
    if (selectedAssetId !== prevIdRef.current && selectedAsset) setActiveTab('inspector');
    prevIdRef.current = selectedAssetId;
  }, [selectedAssetId, selectedAsset]);

  const handleModelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processModelUpload(file);
    if (modelFileInputRef.current) modelFileInputRef.current.value = '';
  };

  const processModelUpload = async (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const supportedExts = ['.glb', '.gltf', '.fbx', '.obj', '.stl'];
    if (!supportedExts.includes(ext)) {
      toast.error(`Unsupported format: ${ext}. Supported: GLB, GLTF, FBX, OBJ, STL`);
      return;
    }

    setIsUploadingModel(true);
    setModelUploadProgress({ loaded: 0, total: file.size, percent: 0 });
    let cancelled = false;
    
    try {
      const { promise, cancel } = uploadService.uploadWithProgress(
        file,
        (progress) => {
          setModelUploadProgress(progress);
        },
        '/api/v1/upload/model' as any
      );
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Upload cancelled')), 300000);
      });
      
      const result = await Promise.race([promise, timeoutPromise]);
      if (result?.url && !cancelled) {
        toast.success(`Model uploaded successfully (${ext.slice(1).toUpperCase()})`);
        loadModelInViewer(result.url, file.name);
        if (onAssetUploaded) onAssetUploaded();
      } else if (!cancelled) {
        toast.error('Upload succeeded but no model URL was returned');
      }
    } catch (err: any) {
      if (err.message === 'Upload cancelled') {
        toast.info('Upload cancelled');
      } else if (!cancelled) {
        toast.error(`Model upload failed: ${err?.message || 'Unknown error'}`);
      }
    } finally {
      setIsUploadingModel(false);
      setModelUploadProgress(null);
    }
  };

  const isEmpty = !loading && !isLoadingUploads && filteredAssets.length === 0;

  return (
    <div className={cn("flex flex-col h-full bg-[hsl(var(--surface-1))] border-l border-[hsl(var(--border))]/[0.12] w-full min-w-0", className)}>
      <input
        ref={modelFileInputRef}
        type="file"
        accept=".glb,.gltf,.fbx,.obj,.stl"
        className="hidden"
        onChange={handleModelFileUpload}
      />

      {/* Model / Image top tabs */}
      <div className="flex items-center justify-center pt-3 pb-0 shrink-0">
        <div className="flex items-center gap-8">
          {(['model', 'image'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setAssetTypeFilter(type)}
              className={cn(
                'relative text-[0.75rem] font-medium transition-all pb-2',
                assetTypeFilter === type
                  ? 'text-[hsl(var(--foreground))]'
                  : 'text-[hsl(var(--muted-foreground))]/[0.4] hover:text-[hsl(var(--muted-foreground))]/[0.6]'
              )}
            >
              {type === 'model' ? 'Model' : 'Image'}
              {assetTypeFilter === type && (
                <div className="absolute -bottom-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-[hsl(var(--foreground))]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* My Assets / Collected sub tabs + Manage */}
      <div className="flex items-center justify-between px-4 py-0 shrink-0">
        <div className="flex items-center gap-5">
          <button className="text-[0.75rem] font-medium text-[hsl(var(--foreground))] transition-colors">
            My Assets
          </button>
          <button className="text-[0.75rem] font-medium text-[hsl(var(--muted-foreground))]/[0.4] hover:text-[hsl(var(--muted-foreground))]/[0.6] transition-colors">
            Collected
          </button>
        </div>
        <button className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-[0.75rem] font-medium flex gap-1.5 items-center transition-colors">
          <span>Manage</span>
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-3 shrink-0">
        {[
          { id: 'all', label: 'All', icon: Grid3X3 },
          { id: 'model', label: 'Model', icon: Box },
          { id: 'image', label: 'Image', icon: ImageIcon },
        ].map((filter) => {
          const Icon = filter.icon;
          const isActive = assetTypeFilter === filter.id;
          return (
            <button
              key={filter.id}
              onClick={() => setAssetTypeFilter(filter.id as any)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 border rounded-md transition-all whitespace-nowrap',
                isActive
                  ? 'border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]'
                  : 'border-[hsl(var(--border))]/[0.12] bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))]/[0.5] hover:bg-white/5'
              )}
            >
              <Icon size={14} className="v-mid" />
              <span className="text-[0.75rem] font-medium whitespace-nowrap">{filter.label}</span>
            </button>
          );
        })}
      </div>

      {/* Search + Upload row */}
      <div className="px-4 pb-3 pt-1 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]/[0.3]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assets..."
              className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]/[0.1] rounded-md pl-9 pr-4 py-2 text-[0.75rem] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/[0.3] focus:outline-none focus:border-[hsl(var(--primary)/0.2)] transition-all"
            />
          </div>
          <button
            onClick={() => modelFileInputRef.current?.click()}
            disabled={isUploadingModel}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-[0.75rem] font-medium transition-colors disabled:opacity-50 shrink-0"
          >
            {isUploadingModel ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* Asset list or empty state */}
      <div
        className={cn(
          'flex-1 overflow-y-auto px-4 min-h-0 transition-all',
          isDropZoneActive && 'bg-[hsl(var(--primary)/0.02)]'
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDropZoneActive(true); }}
        onDragLeave={() => setIsDropZoneActive(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setIsDropZoneActive(false);
          const file = e.dataTransfer.files[0];
          if (file) await processModelUpload(file);
        }}
      >
        {loading || isLoadingUploads ? (
          <div className="grid grid-cols-2 gap-3 pb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] rounded-lg bg-[hsl(var(--surface-2))] animate-pulse" />
            ))}
          </div>
        ) : filteredAssets.length > 0 ? (
          <div className="space-y-3 pb-6">
            <div className="grid grid-cols-2 gap-3">
              {filteredAssets.map((asset) => (
                <AssetThumbnail
                  key={asset.id}
                  asset={asset}
                  isSelected={asset.id === selectedAssetId}
                  onClick={() => onSelectAsset(asset)}
                />
              ))}
            </div>
            <button
              onClick={() => modelFileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg border border-dashed border-[hsl(var(--border))]/[0.15] hover:border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--primary)/0.03)] text-[hsl(var(--muted-foreground))]/[0.4] hover:text-[hsl(var(--primary))] text-[0.75rem] font-medium transition-all cursor-pointer"
            >
              <Upload size={14} />
              <span>Drop or upload model</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center pt-32 pb-10 text-center px-4 space-y-5">
            <div className="w-24 h-24 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center border border-[hsl(var(--border))]/[0.1]">
              <Grid3X3 size={40} className="text-[hsl(var(--muted-foreground))]/[0.12]" />
            </div>
            <div className="space-y-1.5">
              <p className="text-[0.875rem] font-medium text-[hsl(var(--muted-foreground))]/[0.5]">
                {searchQuery ? 'No matching assets' : 'Sign up to generate assets for free'}
              </p>
              {!searchQuery && (
                <p className="text-[0.75rem] text-[hsl(var(--muted-foreground))]/[0.35]">
                  Generate or upload your first 3D model
                </p>
              )}
            </div>
            {!searchQuery && (
              <button
                onClick={() => modelFileInputRef.current?.click()}
                disabled={isUploadingModel}
                className="flex items-center gap-2 px-5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-[0.875rem] font-medium transition-all disabled:opacity-50"
              >
                <Upload size={14} />
                <span>Generate Model</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Inspector tab */}
      {activeTab === 'inspector' && (
        <div className="flex-1 overflow-y-auto min-h-0 bg-[hsl(var(--surface-1))]">
          {selectedAsset ? (
            <InspectorPanel asset={selectedAsset} onDelete={onDeleteAsset} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center px-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center border border-[hsl(var(--border))]/[0.1]">
                <Eye size={28} className="text-[hsl(var(--muted-foreground))]/[0.12]" />
              </div>
              <div className="space-y-1">
                <p className="text-[0.75rem] font-medium text-[hsl(var(--muted-foreground))]/[0.4]">No Asset Selected</p>
                <p className="text-[0.75rem] text-[hsl(var(--muted-foreground))]/[0.25]">Select an asset from the list to view details</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
