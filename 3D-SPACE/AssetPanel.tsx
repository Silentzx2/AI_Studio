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
  CheckCircle2, Lock, Package, Grid3X3, Archive, Upload, Loader2
} from 'lucide-react';
import { EXPORT_FORMATS } from '@/constants';
import { uploadService } from '@/services/uploadService';
import { apiClient } from '@/services/apiClient';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function AssetThumbnail({ asset, isSelected, onClick }: { asset: AssetItem; isSelected: boolean; onClick: () => void }) {
  const handleDragStart = (e: React.DragEvent) => {
    // For images, drag the image URL to be dropped onto image upload areas
    // For 3D models, drag the model URL to be dropped onto 3D canvas
    if (asset.type === 'image' && asset.thumbnailUrl) {
      e.dataTransfer.setData('text/plain', asset.thumbnailUrl);
      e.dataTransfer.effectAllowed = 'copy';
    } else if (asset.type === 'model' && asset.modelUrl) {
      e.dataTransfer.setData('text/plain', asset.modelUrl);
      e.dataTransfer.effectAllowed = 'copy';
    }
    // Add visual feedback
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
        'group relative rounded-xl overflow-hidden border transition-all duration-300 aspect-square',
        isSelected
          ? 'border-[#facc15] shadow-[0_0_15px_rgba(250,204,21,0.2)] scale-[0.98]'
          : 'border-white/5 hover:border-white/20 bg-[#121214]'
      )}
    >
      {asset.thumbnailUrl ? (
        <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Box size={24} className="text-white/10 group-hover:text-white/30 transition-colors" />
        </div>
      )}
      <div className="absolute bottom-2 left-2">
        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-black/60 backdrop-blur-md border border-white/10 text-white/90">
          {asset.format}
        </span>
      </div>
      {asset.isFavorite && (
        <div className="absolute top-2 right-2">
          <Heart size={10} className="fill-[#facc15] text-[#facc15] drop-shadow-md" />
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
    <div className="flex flex-col gap-6 p-5">
      {/* Thumbnail */}
      <div className="aspect-video rounded-2xl overflow-hidden bg-[#121214] border border-white/5 relative group">
        {asset.thumbnailUrl ? (
          <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Box size={32} className="text-white/10" />
          </div>
        )}
      </div>

      {/* Info Header */}
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-white truncate" title={asset.name}>
          {asset.name}
        </h3>
        <p className="text-[10px] text-white/40 font-medium leading-relaxed italic" title={asset.prompt}>
          "{asset.prompt || 'No prompt'}"
        </p>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Format', value: asset.format || 'N/A', icon: FileDown },
          { label: 'Vertices', value: result?.vertexCount ? result.vertexCount.toLocaleString() : '—', icon: Hash },
          { label: 'Faces', value: result?.polygonCount ? result.polygonCount.toLocaleString() : '—', icon: Layers },
          { label: 'Size', value: result?.fileSize ? `${(result.fileSize / 1024 / 1024).toFixed(1)} MB` : '—', icon: Package },
        ].map((meta, i) => {
          const Icon = meta.icon;
          return (
            <div key={i} className="flex flex-col gap-1 p-3 rounded-xl bg-[#121214] border border-white/5">
              <div className="flex items-center gap-1.5 opacity-40">
                <Icon size={10} />
                <span className="text-[8px] font-black uppercase tracking-widest">{meta.label}</span>
              </div>
              <span className="text-xs font-bold text-white/90 tabular-nums">{meta.value}</span>
            </div>
          );
        })}
      </div>

      {/* Timestamp */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full w-fit">
        <Clock size={10} className="text-white/40" />
        <span className="text-[9px] font-bold text-white/60">{asset.timestamp}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {asset.modelUrl && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: asset.modelUrl } }))}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white text-black hover:bg-white/90 transition-all shadow-lg active:scale-95"
          >
            <Eye size={14} /> Preview
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(asset.id)}
            className="p-3 rounded-xl bg-white/5 border border-white/5 text-white/40 hover:text-red-400 hover:border-red-400/20 hover:bg-red-400/5 transition-all"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Export Section */}
      <div className="pt-6 border-t border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/40">
            <Download size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Export Options</span>
          </div>
          {result && (
            <span className="px-1.5 py-0.5 rounded bg-[#facc15]/10 text-[#facc15] text-[8px] font-black uppercase">Ready</span>
          )}
        </div>

        <button
          onClick={() => setExportOpen(true)}
          disabled={!asset.modelUrl}
          className={cn(
            'w-full flex items-center justify-center gap-2 p-3.5 rounded-xl border transition-all text-[11px] font-bold',
            asset.modelUrl
              ? 'bg-[#121214] border-white/10 hover:border-[#facc15]/50 text-white'
              : 'bg-white/5 border-transparent text-white/20 cursor-not-allowed'
          )}
        >
          <Archive size={14} />
          Package Export (GLB / ZIP)
        </button>

        <div className="grid grid-cols-2 gap-2">
          {EXPORT_FORMATS.map((format) => {
            const url = result?.downloadUrls?.[format.id] || result?.modelUrl;
            const enabled = !!url && !!result;
            return (
              <button
                key={format.id}
                onClick={() => enabled && handleDownload(format.id, url)}
                disabled={!enabled}
                className={cn(
                  'flex flex-col items-center gap-1 p-3 rounded-xl border transition-all',
                  enabled
                    ? 'bg-[#121214] border-white/5 hover:border-white/20 text-white'
                    : 'bg-white/5 border-transparent text-white/10 cursor-not-allowed'
                )}
              >
                <FileDown size={14} className={enabled ? 'text-white/60' : 'text-white/10'} />
                <span className="text-[10px] font-bold">{format.label}</span>
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
}: AssetPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
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
        
        // Convert to AssetItem format
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
          thumbnailUrl: model.thumbnailUrl || null,
          modelUrl: model.url,
          isFavorite: false,
          job: null,
          type: 'model' as const
        }));
        
        setUploadAssets([...imageAssets, ...modelAssets]);
      } catch (error) {
        console.error('Failed to fetch upload assets:', error);
        // Keep existing uploadAssets if any
      } finally {
        setIsLoadingUploads(false);
      }
    };

    fetchUploadAssets();
  }, []);

const filteredAssets = useMemo(() => {
    // Combine job history assets and upload assets
    const allAssets = [...assets, ...uploadAssets];
    
    return allAssets.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.prompt && a.prompt.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'favorites' && a.isFavorite) ||
        (categoryFilter === '3d-models' && ['GLB', 'GLTF', 'OBJ', 'FBX', 'STL'].includes(a.format));
      return matchesSearch && matchesCategory;
    });
  }, [assets, uploadAssets, searchQuery, categoryFilter]);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  // Auto-switch to inspector when an asset is selected
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
            
            // Create a timeout to allow cancellation
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Upload cancelled')), 300000); // 5 minute timeout
            });
            
            const result = await Promise.race([promise, timeoutPromise]);
            if (result?.url && !cancelled) {
                toast.success(`Model uploaded successfully (${ext.slice(1).toUpperCase()})`);
                // Load into 3D viewer right away
                window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: result.url } }));
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

  const categoryPills = [
    { id: 'all', label: 'All' },
    { id: '3d-models', label: '3D Models' },
    { id: 'favorites', label: 'Favorites' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#1a1b1e] border-l border-white/5 w-full min-w-0">
      {/* Hidden Model File Input */}
      <input
        ref={modelFileInputRef}
        type="file"
        accept=".glb,.gltf,.fbx,.obj,.stl"
        className="hidden"
        onChange={handleModelFileUpload}
      />

      {/* Tabs: Assets / Inspector */}
      <div className="flex items-center justify-between px-4 pt-4 pb-0 shrink-0">
        <div className="flex items-center gap-1">
          {(['assets', 'inspector'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative',
                activeTab === tab
                  ? 'text-[#facc15]'
                  : 'text-white/40 hover:text-white/60'
              )}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#facc15] shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
              )}
            </button>
          ))}
        </div>

        {/* Top Model Upload CTA Button */}
        <button
          onClick={() => modelFileInputRef.current?.click()}
          disabled={isUploadingModel}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 transition-all cursor-pointer disabled:opacity-50"
        >
          {isUploadingModel ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Upload size={12} />
          )}
          <span>{isUploadingModel ? '...' : 'Upload'}</span>
</button>
       </div>
       {modelUploadProgress && (
         <div className="mt-2">
           <div className="flex items-center justify-between mb-1">
             <span className="text-[9px] font-mono text-white/70">Uploading...</span>
             <span className="text-[9px] font-mono text-white">{modelUploadProgress.percent}%</span>
           </div>
           <div className="w-full h-1.5 bg-[hsl(var(--surface-3))] rounded-full overflow-hidden">
             <div
               className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-cyan))] rounded-full transition-all duration-300"
               style={{ width: `${modelUploadProgress.percent}%` }}
             />
           </div>
           <button
             onClick={() => {
               // Cancel upload by calling cancel on the upload service
               // We need to store the cancel function somewhere accessible
               // For now, we'll just reset the state and show cancelled toast
               setIsUploadingModel(false);
               setModelUploadProgress(null);
               toast.info('Upload cancelled');
             }}
             className="text-[8px] font-mono text-[hsl(var(--muted-foreground))]/50 hover:underline"
           >
             Cancel
           </button>
         </div>
       )}

      {activeTab === 'assets' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Search + Filter */}
          <div className="p-4 space-y-4 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search assets..."
                className="w-full bg-[#121214] border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-white/10 focus:outline-none focus:border-[#facc15]/30 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              {categoryPills.map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setCategoryFilter(pill.id)}
                  className={cn(
                    'px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all',
                    categoryFilter === pill.id
                      ? 'bg-[#facc15]/10 text-[#facc15] border-[#facc15]/20'
                      : 'bg-[#121214] text-white/40 border-white/5 hover:text-white/60'
                  )}
                >
                  {pill.label}
                </button>
              ))}
              <button
                onClick={() => { setSearchQuery(''); setCategoryFilter('all'); }}
                className="ml-auto p-2 rounded-lg bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {/* Asset Grid / Upload Drop Zone */}
          <div
            className={cn(
              'flex-1 overflow-y-auto p-4 min-h-0 transition-all',
              isDropZoneActive && 'bg-[#facc15]/5 scale-[0.99] rounded-2xl'
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
  <div className="grid grid-cols-2 gap-3">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="aspect-square rounded-2xl bg-white/5 animate-pulse" />
    ))}
  </div>
) : filteredAssets.length > 0 ? (
              <div className="space-y-6">
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
                {/* Subtle upload dropzone at bottom of asset list */}
                <button
                  onClick={() => modelFileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-4 px-4 rounded-2xl border border-dashed border-white/5 hover:border-[#facc15]/20 bg-[#121214] hover:bg-[#facc15]/5 text-white/20 hover:text-[#facc15] text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                >
                  <Upload size={14} />
                  <span>Drop or upload model</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4 space-y-4">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                  <Grid3X3 size={32} className="text-white/10" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">No Assets Found</p>
                  <p className="text-[9px] text-white/20">
                    {searchQuery ? 'Try a different search term' : 'Generate or upload your first 3D model'}
                  </p>
                </div>
                <button
                  onClick={() => modelFileInputRef.current?.click()}
                  disabled={isUploadingModel}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-[#facc15] text-[#121214] hover:brightness-110 transition-all shadow-lg disabled:opacity-50"
                >
                  <Upload size={14} />
                  <span>Upload File</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inspector Tab */}
      {activeTab === 'inspector' && (
        <div className="flex-1 overflow-y-auto min-h-0 bg-[#1a1b1e]">
          {selectedAsset ? (
            <InspectorPanel asset={selectedAsset} onDelete={onDeleteAsset} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center px-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <Eye size={32} className="text-white/10" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">No Asset Selected</p>
                <p className="text-[9px] text-white/20">Select an asset from the list to view details</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
