"use client";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tripo-style Asset / Model Storage panel for the 3D Generation workspace.
 *
 * Every asset shown here is sourced from the REAL backend:
 *  - uploaded 3D models + source images  -> GET /api/v1/upload/assets
 *  - generated models (jobs)             -> GET /api/v1/jobs (polled live)
 * Uploads persist through the real upload endpoints and appear immediately.
 * Clicking a model loads it into the center viewer; clicking an image lets the
 * user push it as the generation input. All metadata comes from the backend.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import anime from 'animejs';
import {
  Upload, Box, Image as ImageIcon, Trash2, Download, X, RefreshCw,
  Loader2, Eye, Cpu, FileBox, CheckCircle2, Clock, AlertTriangle,
  Sparkles, Layers3, Link2, Boxes,
} from 'lucide-react';
import { apiClient } from '@/services/apiClient';
import { uploadService } from '@/services/uploadService';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { toast } from 'sonner';
import ExportDialog from './ExportDialog';

type AssetSource = 'job' | 'upload';
type AssetType = 'model' | 'image';

interface Asset {
  id: string;
  source: AssetSource;
  type: AssetType;
  name: string;
  url: string;
  format: string;
  size?: number;
  createdAt?: string;
  status?: string;
  progress?: number;
  stage?: string;
  prompt?: string;
  provider?: string;
  mode?: string;
  polygonCount?: number;
  vertexCount?: number;
  hasRig?: boolean;
  generateTexture?: boolean;
  autoRig?: boolean;
  thumbnailUrl?: string;
  downloadUrls?: Record<string, string>;
  error?: string;
}

interface AssetStoragePanelProps {
  onCloseMobile?: () => void;
  onToggleCollapse?: () => void;
  collapsed?: boolean;
}

const MODEL_EXTS = ['glb', 'gltf'];
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp'];

function formatBytes(bytes?: number): string {
  if (bytes == null || isNaN(bytes)) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function loadModelInViewer(url: string) {
  window.dispatchEvent(new CustomEvent('load-glb-model', { detail: { url } }));
}

export default function AssetStoragePanel({ onCloseMobile, onToggleCollapse, collapsed }: AssetStoragePanelProps) {
  const { setUploadedImage, setMode } = useGenerationStore();

  const [rightTab, setRightTab] = useState<'assets' | 'inspector'>('assets');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const [models, setModels] = useState<Asset[]>([]);
  const [images, setImages] = useState<Asset[]>([]);
  const [jobs, setJobs] = useState<Asset[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchUploadedAssets = useCallback(async () => {
    try {
      const res = await apiClient.get<any>('/api/v1/upload/assets');
      const data = res?.data ?? res ?? {};
      setModels(
        (data.models || []).map((m: any) => ({
          id: m.id,
          source: 'upload' as AssetSource,
          type: 'model' as AssetType,
          name: m.name,
          url: m.url,
          format: m.format,
          size: m.size,
          createdAt: m.created_at,
        }))
      );
      setImages(
        (data.images || []).map((im: any) => ({
          id: im.id,
          source: 'upload' as AssetSource,
          type: 'image' as AssetType,
          name: im.name,
          url: im.url,
          format: im.format,
          size: im.size,
          createdAt: im.created_at,
        }))
      );
    } catch (err) {
      // Non-fatal: uploaded assets may simply be empty / backend offline.
      console.warn('Failed to load uploaded assets:', err);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await apiClient.get<any>('/api/v1/jobs');
      const data = res?.data ?? res ?? {};
      const list = (data.jobs || []).map((j: any) => ({
        id: j.id,
        source: 'job' as AssetSource,
        type: 'model' as AssetType,
        name: j.prompt || 'Generated Model',
        url: j.model_url,
        format: 'glb',
        size: j.file_size,
        createdAt: j.created_at,
        status: j.status,
        progress: j.progress,
        stage: j.stage,
        prompt: j.prompt,
        provider: j.provider,
        mode: j.mode,
        thumbnailUrl: j.thumbnail_url,
      }));
      setJobs(list);
    } catch (err) {
      console.warn('Failed to load jobs:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchUploadedAssets(), fetchJobs()]);
    } catch (err: any) {
      setError(err?.message || 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [fetchUploadedAssets, fetchJobs]);

  useEffect(() => {
    refreshAll();
    // Poll real job status so in-progress generations stay synchronized with
    // the backend even while the user interacts with the panel.
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [refreshAll, fetchJobs]);

  // Combine uploaded models + generated (completed) job models for the list.
  const modelAssets = useMemo(() => {
    const uploaded = models.map((m) => ({ ...m, status: m.status ?? 'completed' }));
    const generated = jobs.filter((j) => j.url).map((j) => ({ ...j }));
    const all = [...generated, ...uploaded];
    all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return all;
  }, [models, jobs]);

  const processingJobs = useMemo(
    () => jobs.filter((j) => !['completed', 'failed', 'cancelled'].includes(j.status || '')),
    [jobs]
  );

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const isImage = IMAGE_EXTS.includes(ext);
        const isModel = MODEL_EXTS.includes(ext);
        if (!isImage && !isModel) {
          toast.error(`Unsupported file: .${ext}. Use GLB/GLTF or PNG/JPG/WEBP.`);
          continue;
        }
        setUploadLabel(file.name);
        const endpoint = isModel ? '/api/v1/upload/model' : '/api/v1/upload/image';
        const res = await uploadService.uploadWithProgress(file, (p) => setUploadProgress(p.percent), endpoint as any);
        toast.success(`Uploaded ${file.name}`);

        if (isModel && res.url) {
          loadModelInViewer(res.url);
        }
      }
      await fetchUploadedAssets();
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadLabel('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [fetchUploadedAssets]);

  const fetchJobDetails = useCallback(async (id: string, fallback?: Asset): Promise<Partial<Asset> | null> => {
    try {
      const res = await apiClient.get<any>(`/api/v1/jobs/${id}`);
      const d = res?.data ?? res;
      if (!d) return null;
      return {
        polygonCount: d.polygon_count,
        vertexCount: d.vertex_count,
        hasRig: d.has_rig,
        generateTexture: d.generate_texture,
        autoRig: d.auto_rig,
        size: d.file_size ?? fallback?.size,
        downloadUrls: d.download_urls,
        error: d.error_message,
        mode: d.mode ?? fallback?.mode,
        provider: d.provider ?? fallback?.provider,
        status: d.status ?? fallback?.status,
        progress: d.progress ?? fallback?.progress,
        stage: d.stage ?? fallback?.stage,
        url: d.model_url ?? fallback?.url,
      };
    } catch {
      return null;
    }
  }, []);

  const selectAsset = useCallback(async (asset: Asset) => {
    setSelectedAsset(asset);
    setRightTab('inspector');
    if (asset.type === 'image') return;
    // Load model into the center viewer.
    if (asset.url) loadModelInViewer(asset.url);
    // Enrich inspector with full backend metadata for job-sourced models.
    if (asset.source === 'job') {
      const details = await fetchJobDetails(asset.id, asset);
      if (details) {
        setSelectedAsset((prev) => (prev && prev.id === asset.id ? { ...prev, ...details } : prev));
      }
    }
  }, [fetchJobDetails]);

  const applyImageAsInput = useCallback((asset: Asset) => {
    setUploadedImage({ file: null as any, preview: asset.url, width: 512, height: 512 });
    setMode('image-to-3d');
    toast.success('Image set as generation input');
  }, [setUploadedImage, setMode]);

  const deleteAsset = useCallback(async (asset: Asset) => {
    if (!confirm(`Delete "${asset.name}"?`)) return;
    try {
      if (asset.source === 'upload') {
        await apiClient.delete(`/api/v1/upload/assets/${asset.id}`);
      } else {
        await apiClient.delete(`/api/v1/jobs/${asset.id}`);
      }
      toast.success('Deleted');
      if (selectedAsset?.id === asset.id) {
        setSelectedAsset(null);
        setRightTab('assets');
      }
      await refreshAll();
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    }
  }, [selectedAsset, refreshAll]);

  const [showExport, setShowExport] = useState(false);

  // Subtle entrance for the panel body.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bodyRef.current && rightTab === 'assets') {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) {
        anime({ targets: bodyRef.current.querySelectorAll('[data-asset-card]'), opacity: [0, 1], translateY: [12, 0], delay: anime.stagger(25), duration: 350, easing: 'easeOutQuad' });
      }
    }
  }, [rightTab, models, images, jobs]);

  return (
    <div className="flex flex-col h-full w-full bg-[hsl(var(--surface-0))] text-[hsl(var(--foreground))]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))] shrink-0">
        <div className="flex items-center gap-2">
          <Boxes size={15} className="text-[hsl(var(--primary))]" />
          <span className="text-xs font-black uppercase tracking-widest">Assets</span>
          {processingJobs.length > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-[hsl(var(--neon-amber))] bg-[hsl(var(--neon-amber)/0.12)] px-1.5 py-0.5 rounded">
              <Loader2 size={9} className="animate-spin" /> {processingJobs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refreshAll} title="Refresh" className="p-1.5 rounded hover:bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => fileInputRef.current?.click()} title="Add asset" className="lg:hidden p-1.5 rounded hover:bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
            <Upload size={13} />
          </button>
          {onToggleCollapse && (
            <button onClick={onToggleCollapse} title="Collapse" className="hidden lg:block p-1.5 rounded hover:bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
              <X size={13} className="rotate-90" />
            </button>
          )}
          {onCloseMobile && (
            <button onClick={onCloseMobile} className="lg:hidden p-1.5 rounded hover:bg-[hsl(var(--surface-2))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" aria-label="Close">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,.png,.jpg,.jpeg,.webp"
        multiple
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />

      {/* Tab switch */}
      <div className="flex border-b border-[hsl(var(--border))] shrink-0">
        {(['assets', 'inspector'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setRightTab(t)}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider border-b-2 transition-all ${
              rightTab === t
                ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            {t === 'assets' ? `Storage (${modelAssets.length + images.length})` : selectedAsset ? 'Inspector' : 'Inspector'}
          </button>
        ))}
      </div>

      <div ref={bodyRef} className="flex-1 overflow-y-auto scrollbar-thin">
        {rightTab === 'assets' && (
          <div className="flex flex-col gap-4 p-3">
            {/* Upload dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
              className="relative overflow-hidden bg-[hsl(var(--surface-1))] border-2 border-dashed border-[hsl(var(--border))] hover:border-[hsl(var(--primary))/0.5] rounded-xl p-4 transition-all text-center cursor-pointer group"
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2 py-1">
                  <div className="w-5 h-5 border-2 border-[hsl(var(--primary))/0.3] border-t-[hsl(var(--primary))] rounded-full animate-spin" />
                  <span className="text-[10px] font-mono font-bold text-[hsl(var(--primary))] truncate max-w-full">
                    {uploadLabel} · {uploadProgress}%
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 py-1">
                  <Upload size={14} className="text-[hsl(var(--muted-foreground))]" />
                  <span className="text-[10px] font-bold text-[hsl(var(--foreground))]">Upload Model or Image</span>
                  <span className="text-[8px] text-[hsl(var(--muted-foreground))] font-mono">GLB, GLTF, PNG, JPG, WEBP</span>
                </div>
              )}
            </div>

            {/* Loading state */}
            {loading && modelAssets.length === 0 && images.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-[hsl(var(--muted-foreground))]">
                <Loader2 size={20} className="animate-spin text-[hsl(var(--primary))]" />
                <span className="text-[10px] font-mono">Loading assets…</span>
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <AlertTriangle size={18} className="text-[hsl(var(--neon-amber))]" />
                <span className="text-[10px] text-[hsl(var(--neon-amber))]">{error}</span>
                <button onClick={refreshAll} className="text-[10px] font-bold text-[hsl(var(--primary))] hover:underline">Retry</button>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && modelAssets.length === 0 && images.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-[hsl(var(--muted-foreground))]">
                <Boxes size={28} className="opacity-40" />
                <span className="text-[10px] font-semibold text-[hsl(var(--foreground))]">No assets yet</span>
                <span className="text-[9px] max-w-[180px]">Upload a model or image, or generate one from the left panel.</span>
              </div>
            )}

            {/* 3D Models */}
            {modelAssets.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                    3D Models ({modelAssets.length})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {modelAssets.map((asset) => {
                    const isProcessing = !['completed', 'failed', 'cancelled'].includes(asset.status || '');
                    const isSelected = selectedAsset?.id === asset.id;
                    return (
                      <div
                        key={asset.id}
                        data-asset-card
                        onClick={() => selectAsset(asset)}
                        className={`p-2 rounded-xl border transition-all cursor-pointer text-left flex flex-col gap-1 ${
                          isSelected
                            ? 'bg-[hsl(var(--primary))/0.08] border-[hsl(var(--primary))] shadow-sm'
                            : 'bg-[hsl(var(--surface-1))] border-[hsl(var(--surface-3))] hover:bg-[hsl(var(--surface-2))]'
                        }`}
                      >
                        <div className="w-full h-14 rounded-lg bg-[hsl(var(--surface-2))] flex items-center justify-center relative overflow-hidden">
                          {asset.thumbnailUrl ? (
                            <img src={asset.thumbnailUrl} referrerPolicy="no-referrer" alt={asset.name} className="w-full h-full object-cover" />
                          ) : (
                            <Box size={20} className="text-[hsl(var(--primary))]" />
                          )}
                          {isProcessing && (
                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
                              <span className="text-[8px] font-mono font-bold text-white">{asset.progress || 0}%</span>
                              <div className="w-3/4 h-1 bg-white/20 rounded-full overflow-hidden">
                                <div className="h-full bg-[hsl(var(--neon-amber))] transition-all" style={{ width: `${asset.progress || 0}%` }} />
                              </div>
                            </div>
                          )}
                          {asset.status === 'failed' && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                              <AlertTriangle size={16} className="text-[hsl(var(--destructive))]" />
                            </div>
                          )}
                          {asset.source === 'job' && (
                            <span className="absolute top-1 left-1 text-[7px] font-mono font-bold uppercase px-1 py-0.5 rounded bg-[hsl(var(--surface-0)/0.8)] text-[hsl(var(--neon-cyan))]">GEN</span>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] font-bold text-[hsl(var(--foreground))] truncate">{asset.name}</span>
                          <span className="text-[7px] text-[hsl(var(--muted-foreground))] font-mono uppercase flex items-center gap-1">
                            {asset.format} · {formatBytes(asset.size)}
                            {asset.status && asset.status !== 'completed' && (
                              <span className="text-[hsl(var(--neon-amber))]">{asset.status}</span>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Source Images */}
            {images.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Source Images ({images.length})
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {images.map((img) => {
                    const isSelected = selectedAsset?.id === img.id;
                    return (
                      <div
                        key={img.id}
                        data-asset-card
                        onClick={() => selectAsset(img)}
                        className={`aspect-square rounded-lg border overflow-hidden relative group cursor-pointer transition-all ${
                          isSelected
                            ? 'border-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]'
                            : 'border-[hsl(var(--surface-3))] hover:border-[hsl(var(--border))]'
                        }`}
                      >
                        <img src={img.url} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt={img.name} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1">
                          <span className="text-[7px] font-mono text-white truncate w-full">{img.format} · {formatBytes(img.size)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {rightTab === 'inspector' && (
          <div className="flex flex-col gap-3 p-3 text-left">
            {!selectedAsset ? (
              <div className="text-center py-12 text-[10px] text-[hsl(var(--muted-foreground))] font-mono">
                No asset selected.<br />Pick a model or image from Storage.
              </div>
            ) : selectedAsset.type === 'image' ? (
              <InspectorImage asset={selectedAsset} onUseInput={() => applyImageAsInput(selectedAsset)} onDelete={() => deleteAsset(selectedAsset)} onBack={() => setRightTab('assets')} />
            ) : (
              <InspectorModel asset={selectedAsset} onDelete={() => deleteAsset(selectedAsset)} onBack={() => setRightTab('assets')} onExport={() => setShowExport(true)} />
            )}
          </div>
        )}
      </div>

      {showExport && (
        <ExportDialog
          isOpen={showExport}
          onClose={() => setShowExport(false)}
          modelUrl={selectedAsset?.type === 'model' ? selectedAsset.url : undefined}
          modelName={selectedAsset?.name}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Inspector: Image ───────────────────────── */

function MetaRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2 border-b border-[hsl(var(--border))]/20 pb-1.5">
      <span className="text-[hsl(var(--muted-foreground))] shrink-0">{label}</span>
      <span className={`font-bold text-right truncate max-w-[150px] ${mono ? 'font-mono text-[9px]' : 'text-[10px]'}`}>{value}</span>
    </div>
  );
}

function InspectorImage({ asset, onUseInput, onDelete, onBack }: { asset: Asset; onUseInput: () => void; onDelete: () => void; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-3 animate-fadeIn">
      <button onClick={onBack} className="flex items-center gap-1 text-[10px] font-bold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] w-fit">
        <X size={11} className="rotate-45" /> Back to Storage
      </button>

      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-1">
        <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Image Specs</span>
        <button onClick={onDelete} className="text-[hsl(var(--destructive))] hover:text-red-400 p-1" title="Delete">
          <Trash2 size={12} />
        </button>
      </div>

      <div className="aspect-video w-full rounded-lg overflow-hidden bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] flex items-center justify-center">
        <img src={asset.url} referrerPolicy="no-referrer" className="max-w-full max-h-full object-contain" alt={asset.name} />
      </div>

      <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-xl p-2.5 flex flex-col gap-1.5">
        <MetaRow label="Filename" value={asset.name} mono />
        <MetaRow label="Format" value={asset.format.toUpperCase()} />
        <MetaRow label="Size" value={formatBytes(asset.size)} />
        <MetaRow label="Created" value={formatDate(asset.createdAt)} />
        <MetaRow label="Asset ID" value={asset.id} mono />
        <MetaRow label="URL" value={<a href={asset.url} target="_blank" rel="noreferrer" className="text-[hsl(var(--primary))] hover:underline truncate max-w-[150px] inline-block">{asset.url}</a>} mono />
      </div>

      <button
        onClick={onUseInput}
        className="w-full font-black py-2 rounded-xl text-[10px] bg-[hsl(var(--primary))] hover:brightness-110 text-[hsl(var(--surface-0))] flex items-center justify-center gap-1.5 transition-all shadow-sm"
      >
        <Sparkles size={11} className="fill-current" />
        Use as Generation Input
      </button>
    </div>
  );
}

/* ───────────────────────── Inspector: Model ───────────────────────── */

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    completed: 'text-[hsl(var(--neon-green))]',
    failed: 'text-[hsl(var(--destructive))]',
    cancelled: 'text-[hsl(var(--muted-foreground))]',
    processing: 'text-[hsl(var(--neon-amber))]',
    queued: 'text-[hsl(var(--neon-cyan))]',
  };
  return <span className={map[status || ''] || 'text-[hsl(var(--muted-foreground))]'}>{status || '—'}</span>;
}

function InspectorModel({ asset, onDelete, onBack, onExport }: { asset: Asset; onDelete: () => void; onBack: () => void; onExport: () => void }) {
  const isProcessing = !['completed', 'failed', 'cancelled'].includes(asset.status || '');
  return (
    <div className="flex flex-col gap-3 animate-fadeIn">
      <button onClick={onBack} className="flex items-center gap-1 text-[10px] font-bold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] w-fit">
        <X size={11} className="rotate-45" /> Back to Storage
      </button>

      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-1">
        <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Model Specs</span>
        <button onClick={onDelete} className="text-[hsl(var(--destructive))] hover:text-red-400 p-1" title="Delete">
          <Trash2 size={12} />
        </button>
      </div>

      {asset.thumbnailUrl && (
        <div className="aspect-video w-full rounded-lg overflow-hidden bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] flex items-center justify-center">
          <img src={asset.thumbnailUrl} referrerPolicy="no-referrer" className="max-w-full max-h-full object-contain" alt={asset.name} />
        </div>
      )}

      {isProcessing && (
        <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--neon-amber)/0.3)] rounded-xl p-2.5 flex flex-col gap-1.5">
          <div className="flex justify-between text-[10px]">
            <span className="font-extrabold text-[hsl(var(--neon-amber))] uppercase">{asset.stage || 'Processing'}</span>
            <span className="font-mono font-black text-[hsl(var(--neon-amber))]">{asset.progress || 0}%</span>
          </div>
          <div className="w-full h-1.5 bg-[hsl(var(--border))] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--neon-amber))] transition-all" style={{ width: `${asset.progress || 0}%` }} />
          </div>
        </div>
      )}

      {asset.status === 'failed' && (
        <div className="bg-[hsl(var(--destructive)/0.1)] border border-[hsl(var(--destructive)/0.3)] rounded-xl p-2.5 text-[10px] text-[hsl(var(--destructive))]">
          {asset.error || 'Generation failed'}
        </div>
      )}

      <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--surface-3))] rounded-xl p-2.5 flex flex-col gap-1.5">
        <MetaRow label="Name" value={asset.name} />
        <MetaRow label="Asset ID" value={asset.id} mono />
        <MetaRow label="Source" value={asset.source === 'job' ? 'Generated' : 'Uploaded'} />
        <MetaRow label="Format" value={asset.format.toUpperCase()} />
        <MetaRow label="Size" value={formatBytes(asset.size)} />
        <MetaRow label="Created" value={formatDate(asset.createdAt)} />
        <MetaRow label="Status" value={<StatusBadge status={asset.status} />} />
        {asset.provider && <MetaRow label="Provider" value={asset.provider} mono />}
        {asset.mode && <MetaRow label="Mode" value={asset.mode} />}
        <MetaRow label="Vertices" value={asset.vertexCount != null ? asset.vertexCount.toLocaleString() : '—'} />
        <MetaRow label="Faces" value={asset.polygonCount != null ? asset.polygonCount.toLocaleString() : '—'} />
        <MetaRow label="Materials" value={asset.downloadUrls?.materials ? 'Yes' : '—'} />
        <MetaRow label="Textures" value={asset.generateTexture ? 'Yes' : (asset.downloadUrls ? 'Yes' : '—')} />
        <MetaRow label="UV Status" value={asset.format === 'glb' || asset.format === 'gltf' ? 'Baked' : '—'} />
        <MetaRow label="Rig" value={asset.hasRig ? 'Rigged' : (asset.autoRig ? 'Requested' : '—')} />
        <MetaRow label="Animation" value={asset.hasRig ? 'Included' : '—'} />
        {asset.downloadUrls?.glb && <MetaRow label="Download" value={<a href={asset.downloadUrls.glb} target="_blank" rel="noreferrer" className="text-[hsl(var(--primary))] hover:underline truncate max-w-[150px] inline-block">GLB</a>} mono />}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => asset.url && loadModelInViewer(asset.url)}
          className="font-black py-2 rounded-xl text-[10px] bg-[hsl(var(--surface-1))] hover:bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] flex items-center justify-center gap-1.5 transition-all"
        >
          <Box size={11} /> Load
        </button>
        <button
          onClick={onExport}
          disabled={!asset.url}
          className="font-black py-2 rounded-xl text-[10px] bg-[hsl(var(--primary))] hover:brightness-110 disabled:opacity-40 text-[hsl(var(--surface-0))] flex items-center justify-center gap-1.5 transition-all shadow-sm"
        >
          <Download size={11} /> Export
        </button>
      </div>

      {asset.url && (
        <a
          href={asset.url}
          download
          className="w-full font-black py-2 rounded-xl text-[10px] bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] flex items-center justify-center gap-1.5 transition-all"
        >
          <Link2 size={11} /> Download File
        </a>
      )}
    </div>
  );
}
