"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * File 1 — Asset + Export UI
 * Handles: asset list, thumbnails, selection, metadata, export/download, history
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Search, Filter, RefreshCw, Download, FileDown, Eye, MoreVertical,
  Box, Heart, Clock, Hash, Layers, Image as ImageIcon, Plus, ChevronDown,
  CheckCircle2, Lock, Package, Grid3X3, Archive
} from 'lucide-react';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { EXPORT_FORMATS } from '@/constants';
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
}

interface AssetPanelProps {
  assets: AssetItem[];
  selectedAssetId: string | null;
  onSelectAsset: (asset: AssetItem) => void;
  onToggleFavorite?: (id: string) => void;
  onDeleteAsset?: (id: string) => void;
  loading?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function AssetThumbnail({ asset, isSelected, onClick }: { asset: AssetItem; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative rounded-xl overflow-hidden border transition-all duration-200 aspect-square',
        isSelected
          ? 'border-[hsl(var(--primary))/0.5] ring-1 ring-[hsl(var(--primary))/0.3] shadow-lg shadow-[hsl(var(--primary))/0.1]'
          : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))/0.3] hover:shadow-md'
      )}
    >
      {asset.thumbnailUrl ? (
        <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full bg-[hsl(var(--surface-2))] flex items-center justify-center">
          <Box size={20} className="text-[hsl(var(--muted-foreground))]/30 group-hover:text-[hsl(var(--muted-foreground))]/50 transition-colors" />
        </div>
      )}
      <div className="absolute bottom-1 left-1">
        <span className="px-1 py-0.5 rounded text-[7px] font-black uppercase bg-[hsl(var(--surface-0))/0.85] border border-[hsl(var(--border)/0.5)] text-[hsl(var(--foreground))]">
          {asset.format}
        </span>
      </div>
      {asset.isFavorite && (
        <div className="absolute top-1 right-1">
          <Heart size={10} className="fill-[hsl(var(--destructive))] text-[hsl(var(--destructive))]" />
        </div>
      )}
    </button>
  );
}

function InspectorPanel({ asset }: { asset: AssetItem }) {
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
    <div className="flex flex-col gap-3 p-4 border-t border-[hsl(var(--border)/0.5)]">
      {/* Thumbnail */}
      <div className="aspect-video rounded-lg overflow-hidden bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]">
        {asset.thumbnailUrl ? (
          <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Box size={28} className="text-[hsl(var(--muted-foreground))]/20" />
          </div>
        )}
      </div>

      {/* Filename */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold text-[hsl(var(--foreground))] truncate" title={asset.name}>
          {asset.name}
        </span>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono truncate" title={asset.prompt}>
          {asset.prompt || 'No prompt'}
        </span>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        {[
          { label: 'Format', value: asset.format || 'N/A', icon: FileDown },
          { label: 'Vertices', value: result?.vertexCount ? result.vertexCount.toLocaleString() : '—', icon: Hash },
          { label: 'Faces', value: result?.polygonCount ? result.polygonCount.toLocaleString() : '—', icon: Layers },
          { label: 'Size', value: result?.fileSize ? `${(result.fileSize / 1024 / 1024).toFixed(1)} MB` : '—', icon: Package },
        ].map((meta, i) => {
          const Icon = meta.icon;
          return (
            <div key={i} className="flex items-center gap-1.5 p-2 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.4)]">
              <Icon size={10} className="text-[hsl(var(--muted-foreground))] shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-[8px] font-bold uppercase text-[hsl(var(--muted-foreground))] tracking-wider">{meta.label}</span>
                <span className="text-[10px] font-semibold text-[hsl(var(--foreground))] truncate tabular-nums">{meta.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Timestamp */}
      <div className="flex items-center gap-1.5 text-[9px] text-[hsl(var(--muted-foreground))]">
        <Clock size={10} />
        <span>{asset.timestamp}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {asset.modelUrl && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url: asset.modelUrl } }))}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))/0.3] hover:bg-[hsl(var(--primary))/0.05] text-[hsl(var(--foreground))] transition-all"
          >
            <Eye size={12} /> Preview
          </button>
        )}
      </div>

      {/* Export section — reuses existing DownloadArea logic */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Download className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
          <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Export</span>
          {result ? (
            <span className="ml-auto flex items-center gap-1 text-[8px] text-[hsl(var(--neon-green))]">
              <CheckCircle2 className="w-3 h-3" /> Ready
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1 text-[8px] text-[hsl(var(--muted-foreground))]/60">
              <Lock className="w-3 h-3" /> No result
            </span>
          )}
        </div>

        {/* Packaged export (GLB assembly + ZIP) via /api/v1/project/export */}
        <button
          onClick={() => setExportOpen(true)}
          disabled={!asset.modelUrl}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 p-2 rounded-lg border text-center transition-all mb-2',
            asset.modelUrl
              ? 'bg-[hsl(var(--primary))/0.1] border-[hsl(var(--primary))/0.3] hover:bg-[hsl(var(--primary))/0.15] cursor-pointer'
              : 'bg-[hsl(var(--surface-2))/0.3] border-[hsl(var(--border)/0.3)] cursor-not-allowed opacity-40'
          )}
        >
          <Archive size={12} className={asset.modelUrl ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))/30'} />
          <span className={cn('text-[10px] font-bold', asset.modelUrl ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))/30')}>
            Export Package (GLB / ZIP)
          </span>
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
                  'flex items-center gap-1.5 p-2 rounded-lg border text-center transition-all',
                  enabled
                    ? 'bg-[hsl(var(--surface-2))/0.7] border-[hsl(var(--border)/0.5)] hover:border-[hsl(var(--primary))/0.4] hover:bg-[hsl(var(--primary))/0.05] cursor-pointer'
                    : 'bg-[hsl(var(--surface-2))/0.3] border-[hsl(var(--border)/0.3)] cursor-not-allowed opacity-40'
                )}
              >
                <FileDown size={12} className={enabled ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--muted-foreground))/30'} />
                <span className={cn('text-[10px] font-bold', enabled ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))/30')}>
                  {format.label}
                </span>
                <span className="text-[7px] text-[hsl(var(--muted-foreground))]/50 ml-auto hidden sm:inline">{format.description}</span>
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
  loading,
}: AssetPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'assets' | 'inspector'>('assets');

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.prompt && a.prompt.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'favorites' && a.isFavorite) ||
        (categoryFilter === '3d-models' && (a.format === 'GLB' || a.format === 'OBJ' || a.format === 'FBX'));
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

  const categoryPills = [
    { id: 'all', label: 'All' },
    { id: '3d-models', label: '3D Models' },
    { id: 'favorites', label: 'Favorites' },
  ];

  return (
    <div className="flex flex-col h-full bg-[hsl(var(--surface-1))] border-l border-[hsl(var(--border))] w-full min-w-0">
      {/* Tabs: Assets / Inspector */}
      <div className="flex items-center gap-0 px-3 pt-3 pb-0 border-b border-[hsl(var(--border)/0.5)] shrink-0">
        {(['assets', 'inspector'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all',
              activeTab === tab
                ? 'text-[hsl(var(--primary))] border-[hsl(var(--primary))]'
                : 'text-[hsl(var(--muted-foreground))] border-transparent hover:text-[hsl(var(--foreground))]'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'assets' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Search + Filter */}
          <div className="p-3 space-y-2 border-b border-[hsl(var(--border)/0.5)] shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[hsl(var(--muted-foreground))]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search assets..."
                className="w-full bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/50 focus:outline-none focus:border-[hsl(var(--primary))] transition-all"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {categoryPills.map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setCategoryFilter(pill.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border transition-all',
                    categoryFilter === pill.id
                      ? 'bg-[hsl(var(--primary))/0.1] text-[hsl(var(--primary))] border-[hsl(var(--primary))/0.3]'
                      : 'bg-transparent text-[hsl(var(--muted-foreground))] border-transparent hover:text-[hsl(var(--foreground))]'
                  )}
                >
                  {pill.label}
                </button>
              ))}
              <button
                onClick={() => { setSearchQuery(''); setCategoryFilter('all'); }}
                className="ml-auto p-1 rounded hover:bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all"
                title="Refresh"
              >
                <RefreshCw size={12} />
              </button>
            </div>
          </div>

          {/* Asset Grid */}
          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            {loading ? (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] animate-pulse" />
                ))}
              </div>
            ) : filteredAssets.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {filteredAssets.map((asset) => (
                  <AssetThumbnail
                    key={asset.id}
                    asset={asset}
                    isSelected={asset.id === selectedAssetId}
                    onClick={() => onSelectAsset(asset)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Grid3X3 size={28} className="text-[hsl(var(--muted-foreground))]/20 mb-3" />
                <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">No Assets</p>
                <p className="text-[9px] text-[hsl(var(--muted-foreground))]/60 mt-1">
                  {searchQuery ? 'Try a different search' : 'Generate a 3D model to get started'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inspector Tab */}
      {activeTab === 'inspector' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {selectedAsset ? (
            <InspectorPanel asset={selectedAsset} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center px-4">
              <Eye size={24} className="text-[hsl(var(--muted-foreground))]/20 mb-3" />
              <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">No Asset Selected</p>
              <p className="text-[9px] text-[hsl(var(--muted-foreground))]/60 mt-1">Select an asset to inspect</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
