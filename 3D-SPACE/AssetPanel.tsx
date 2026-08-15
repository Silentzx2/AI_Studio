"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * File 1 — Asset + Export UI
 * Handles: asset list, thumbnails, selection, metadata, export/download, history
 */

import React, { useState, useMemo, useRef } from 'react';
import Image from 'next/image';
import {
  Search, RefreshCw, Download, FileDown, Eye, Trash2,
  Box, Heart, Clock, Hash, Layers,
  CheckCircle2, Lock, Package, Grid3X3, Archive, Upload, Loader2
} from 'lucide-react';
import { EXPORT_FORMATS } from '@/constants';
import { uploadService } from '@/services/uploadService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
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
/* ------------------------------------------------------------------ */function AssetThumbnail({ asset, isSelected, onClick }: { asset: AssetItem; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative rounded-2xl overflow-hidden border transition-all duration-500 aspect-square outline-none focus-visible:ring-2 focus-visible:ring-[#facc15]/50',
        isSelected
          ? 'border-[#facc15]/60 shadow-[0_0_30px_rgba(250,204,21,0.1)] bg-[#facc15]/5'
          : 'border-white/5 hover:border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
      )}
    >
      {asset.thumbnailUrl ? (
        <div className="w-full h-full relative overflow-hidden">
          <Image 
            src={asset.thumbnailUrl} 
            alt={asset.name} 
            fill
            className="object-cover transition-all duration-1000 ease-out group-hover:scale-110 group-hover:rotate-1" 
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/[0.02] to-transparent">
          <Box size={24} className="text-white/5 group-hover:text-[#facc15]/30 group-hover:scale-110 transition-all duration-700" />
        </div>
      )}
      
      {/* Selection Indicator */}
      <AnimatePresence>
        {isSelected && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 border-2 border-[#facc15] rounded-2xl pointer-events-none z-10" 
          />
        )}
      </AnimatePresence>

      {/* Overlay Info */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out z-20">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-white truncate flex-1 leading-none">
            {asset.name}
          </span>
          <span className="px-1 py-0.5 rounded-[4px] text-[6px] font-black uppercase bg-[#facc15] text-[#121214] leading-none">
            {asset.format}
          </span>
        </div>
      </div>

      {asset.isFavorite && (
        <div className="absolute top-2.5 right-2.5 z-20 animate-in zoom-in-0 duration-500">
          <div className="w-5 h-5 rounded-full bg-rose-500/10 backdrop-blur-md border border-rose-500/20 flex items-center justify-center">
            <Heart size={8} className="fill-rose-500 text-rose-500" />
          </div>
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
          <Image 
            src={asset.thumbnailUrl} 
            alt={asset.name} 
            fill
            className="object-cover" 
            referrerPolicy="no-referrer"
          />
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
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);
  const modelFileInputRef = useRef<HTMLInputElement>(null);

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.prompt && a.prompt.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'favorites' && a.isFavorite) ||
        (categoryFilter === '3d-models' && ['GLB', 'GLTF', 'OBJ', 'FBX', 'STL'].includes(a.format));
      return matchesSearch && matchesCategory;
    });
  }, [assets, searchQuery, categoryFilter]);

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
    try {
      const { promise } = uploadService.uploadWithProgress(file, () => {}, '/api/v1/upload/model' as any);
      const result = await promise;
      if (result?.url) {
        toast.success(`Model uploaded successfully (${ext.slice(1).toUpperCase()})`);
        // Load into 3D viewer right away
        window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: result.url } }));
        if (onAssetUploaded) onAssetUploaded();
      } else {
        toast.error('Upload succeeded but no model URL was returned');
      }
    } catch (err: any) {
      toast.error(`Model upload failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsUploadingModel(false);
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
      <div className="flex items-center gap-1 px-4 pt-4 pb-0 shrink-0 border-b border-white/[0.03]">
        {(['assets', 'inspector'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative group',
              activeTab === tab
                ? 'text-[#facc15]'
                : 'text-white/40 hover:text-white/60'
            )}
          >
            <span className="relative z-10">{tab}</span>
            {activeTab === tab && (
              <motion.div
                layoutId="asset-panel-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#facc15] shadow-[0_0_15px_rgba(250,204,21,0.4)]"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </button>
        ))}
        
        <div className="flex-1" />

        {/* Top Model Upload CTA Button */}
        <button
          onClick={() => modelFileInputRef.current?.click()}
          disabled={isUploadingModel}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white/[0.03] hover:bg-white/10 border border-white/5 text-white/60 hover:text-white transition-all cursor-pointer disabled:opacity-50 mb-2"
        >
          {isUploadingModel ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Upload size={12} />
          )}
          <span>{isUploadingModel ? '...' : 'Upload'}</span>
        </button>
      </div>

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
            {loading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-2xl bg-white/5 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer" />
                    <div className="absolute bottom-2 left-2 right-2 h-3 bg-white/5 rounded-md" />
                  </div>
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
