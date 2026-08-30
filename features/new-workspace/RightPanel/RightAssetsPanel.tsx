import React, { useState, useRef, useCallback, useEffect } from 'react';
import { apiClient, getApiUrl } from '@/services/apiClient';
import {
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Box,
  Grid as GridIcon,
  Star,
  Filter,
  Check,
  Copy,
  Trash2,
  FolderOpen,
  AlertCircle,
  Loader2,
  Search
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { ModelAsset } from '../types';
import { useUploadProgress } from '@/hooks/useUploadProgress';
import { UploadDiagnosticModal } from '../Modals/UploadDiagnosticModal';
import { validate3DFile } from '../lib/fileValidation';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

export const RightAssetsPanel: React.FC = () => {
  const { 
    assets, 
    currentAsset, 
    setCurrentAsset, 
    assetFilter, 
    setAssetFilter,
    duplicateAsset,
    deleteAsset,
    addAsset,
    setActiveTool
  } = useWorkspace();

  const [activePage, setActivePage] = useState(1);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [activeMenuAssetId, setActiveMenuAssetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { progress: uploadProgress, readFileWithProgress, startUpload, updateProgress, finishUpload, failUpload } = useUploadProgress();
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
  const [diagnosticFile, setDiagnosticFile] = useState<File | null>(null);

  const MAX_MODEL_SIZE = 150 * 1024 * 1024; // 150MB
  const ACCEPTED_MODEL_EXTS = ['glb', 'gltf', 'obj', 'fbx', 'stl', 'ply'];
  const ITEMS_PER_PAGE = 8;

  useEffect(() => {
    setActivePage(1);
  }, [assetFilter, showFavoritesOnly]);

  const processModelFile = useCallback(async (file: File) => {
    setUploadError(null);

    // Validate file structure before upload (extension, MIME, size, magic bytes)
    const validation = await validate3DFile(file, 'upload');
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid file');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !ACCEPTED_MODEL_EXTS.includes(ext)) {
      setUploadError('Invalid file type. Use GLB, GLTF, OBJ, FBX, STL, or PLY.');
      return;
    }

    if (file.size === 0) {
      setUploadError('File is empty.');
      return;
    }

    // Show progress while uploading
    startUpload(file.name, file.size);

    try {
      // Upload file to backend with real-time progress
      const result = await apiClient.uploadFile<{
        url: string;
        thumbnail_url?: string;
        filename: string;
        size: number;
        mesh_stats?: { polygon_count: number; vertex_count: number };
      }>(
        '/api/v1/upload/model',
        file,
        (loaded, total) => updateProgress(loaded)
      );

      finishUpload();

      // Resolve relative URLs: /static/* paths go through the /static proxy route
      const resolveUrl = (url: string | undefined) => {
        if (!url) return '';
        if (url.startsWith('/static/')) {
          // Return as same-origin relative URL - the /static/* proxy route
          // will forward to the backend
          return url;
        }
        return url;
      };

      const meshStats = result?.mesh_stats;
      const newAsset: ModelAsset = {
        id: `user-upload-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        category: 'mesh',
        meshType: 'custom',
        thumbnail: resolveUrl(result?.thumbnail_url),
        faces: meshStats?.polygon_count || 0,
        vertices: meshStats?.vertex_count || 0,
        triangles: meshStats?.polygon_count || 0,
        statsAvailable: !!(meshStats && meshStats.polygon_count > 0),
        source: { filename: file.name, subfolder: '', type: 'input', viewUrl: resolveUrl(result?.url) },
        topology: 'Triangle',
        format: (() => {
          if (ext === 'obj') return 'OBJ';
          if (ext === 'ply') return 'PLY';
          if (ext === 'glb' || ext === 'gltf') return 'GLB';
          if (ext === 'fbx') return 'FBX';
          if (ext === 'stl') return 'STL';
          return 'FILE';
        })(),
        dateCreated: '',
        tags: ['Custom', 'User-Upload', 'Mesh']
      };
      addAsset(newAsset);
      setCurrentAsset(newAsset);
    } catch (err) {
      failUpload();
      setUploadError(err instanceof Error ? err.message : 'Failed to upload file.');
    }
  }, [addAsset, setCurrentAsset, startUpload, updateProgress, finishUpload, failUpload]);

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processModelFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    if (file) processModelFile(file);
  };

  const filteredAssets = assets.filter(a => {
    if (showFavoritesOnly && !a.isFavorite) return false;
    if (assetFilter === 'all') return true;
    if (assetFilter === 'models') return a.category === 'generation' || a.category === 'mesh';
    if (assetFilter === 'textures') return a.category === 'texture' || a.tags?.includes('PBR');
    if (assetFilter === 'images') return a.tags?.includes('character') || a.tags?.includes('sculpture');
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / ITEMS_PER_PAGE));
  const safePage = Math.min(activePage, totalPages);
  const paginatedAssets = filteredAssets.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  return (
    <div id="panel-assets-library" className="flex flex-col h-full bg-[hsl(var(--surface-1))] text-xs select-none">
      {/* Hidden file input for uploading custom 3D files */}
      <input 
        ref={fileInputRef}
        type="file" 
        accept=".glb,.gltf,.obj,.fbx,.stl,.ply" 
        className="hidden" 
        onChange={handleModelUpload}
      />

      {/* Top Action Sub-bar (Matching Reference Image) */}
      <div className="p-2.5 border-b border-[hsl(var(--border))] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {/* Grid / All View */}
            <SimpleTooltip label="All Assets">
              <button
                onClick={() => { setShowFavoritesOnly(false); setAssetFilter('all'); }}
                className={`p-1.5 rounded-lg transition-colors ${
                  !showFavoritesOnly && assetFilter === 'all'
                    ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]'
                }`}
              >
                <GridIcon className="w-3.5 h-3.5" />
              </button>
            </SimpleTooltip>

            {/* Favorite Filter */}
            <SimpleTooltip label="Favorites Only">
              <button
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`p-1.5 rounded-lg transition-colors ${
                  showFavoritesOnly
                    ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]'
                }`}
              >
                <Star className="w-3.5 h-3.5" />
              </button>
            </SimpleTooltip>

            {/* Category Filter */}
            <div className="relative">
              <SimpleTooltip label="Filter by Category">
                <button
                  onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    assetFilter !== 'all'
                      ? 'bg-[hsl(var(--surface-3))] text-[hsl(var(--primary))]'
                      : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                </button>
              </SimpleTooltip>

              {filterMenuOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-36 py-1 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] shadow-2xl z-50 text-xs">
                  <button
                    onClick={() => { setAssetFilter('all'); setFilterMenuOpen(false); }}
                    className="w-full text-left px-2.5 py-1 hover:bg-[hsl(var(--surface-3))] text-[hsl(var(--foreground))]"
                  >
                    All Assets
                  </button>
                  <button
                    onClick={() => { setAssetFilter('models'); setFilterMenuOpen(false); }}
                    className="w-full text-left px-2.5 py-1 hover:bg-[hsl(var(--surface-3))] text-[hsl(var(--foreground))]"
                  >
                    3D Models
                  </button>
                  <button
                    onClick={() => { setAssetFilter('textures'); setFilterMenuOpen(false); }}
                    className="w-full text-left px-2.5 py-1 hover:bg-[hsl(var(--surface-3))] text-[hsl(var(--foreground))]"
                  >
                    PBR Textures
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Manage Button */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] transition-colors"
            >
              <span>Manage</span>
            </button>
            <button
              onClick={() => {
                setDiagnosticFile(null);
                setIsDiagnosticOpen(true);
              }}
              className="p-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] transition-colors"
            >
              <SimpleTooltip label="Diagnose upload issues">
                <span className="flex items-center justify-center">
                  <Search className="w-3.5 h-3.5" />
                </span>
              </SimpleTooltip>
            </button>
          </div>
        </div>
      </div>

      {/* Main Asset Grid Body */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filteredAssets.length === 0 && (
          <div className="py-14 px-4 text-center text-[hsl(var(--muted-foreground))]">
            <FolderOpen className="w-8 h-8 mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
            <div className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">No real outputs yet</div>
            <div className="text-[10px] mt-1">Run a generation workflow or import a local 3D file.</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Upload 3D Model Card (Matching Reference Image) */}
          <div
            id="btn-upload-3d-model-card"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`group relative rounded-xl border border-dashed cursor-pointer p-3 flex flex-col items-center justify-center text-center aspect-square transition-all ${
              isDragOver
                ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 scale-105'
                : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/60 bg-[hsl(var(--surface-1))] hover:bg-[hsl(var(--surface-2))]'
            }`}
          >
            {uploadProgress.active ? (
              <div className="flex flex-col items-center justify-center space-y-1 w-full">
                <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--primary))]" />
                <div className="w-full bg-[hsl(var(--surface-3))] rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-[hsl(var(--primary))] h-full rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
                <span className="text-[9px] text-[hsl(var(--muted-foreground))]">
                  {uploadProgress.percent}% ({(uploadProgress.loadedBytes / 1024 / 1024).toFixed(1)}/{(uploadProgress.totalBytes / 1024 / 1024).toFixed(1)} MB)
                </span>
              </div>
            ) : (
              <>
                <div className={`w-8 h-8 rounded-full bg-[hsl(var(--surface-3))] border border-[hsl(var(--border))] flex items-center justify-center transition-all mb-1.5 ${
                  isDragOver ? 'text-[hsl(var(--primary))] border-[hsl(var(--primary))] scale-110' : 'text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] group-hover:scale-105'
                }`}>
                  <Box className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold text-[hsl(var(--foreground))] leading-tight block">
                  {isDragOver ? 'Drop model here' : 'Upload 3D Model'}
                </span>
                <span className="text-[9px] text-[hsl(var(--muted-foreground))] mt-0.5 block">
                  OBJ, FBX, STL, GLB
                </span>
                <span className="text-[9px] text-muted-foreground block">
                  Size ≤150MB
                </span>
              </>
            )}
          </div>

          {uploadError && (
            <div className="flex items-center gap-1 text-[10px] text-[hsl(var(--destructive))] px-1">
              <AlertCircle className="w-3 h-3" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Asset Items */}
          {paginatedAssets.map((asset) => {
            const isSelected = currentAsset?.id === asset.id;

            return (
              <div
                key={asset.id}
                id={`asset-card-${asset.id}`}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify(asset));
                  e.dataTransfer.setData('text/plain', asset.id);
                  e.dataTransfer.effectAllowed = 'copyMove';
                }}
                onClick={() => setCurrentAsset(asset)}
                className={`group relative rounded-xl overflow-hidden cursor-grab active:cursor-grabbing transition-all aspect-square flex flex-col ${
                  isSelected
                    ? 'ring-2 ring-[hsl(var(--primary))] bg-[hsl(var(--surface-2))] shadow-lg shadow-[hsl(var(--primary))]/15'
                    : 'border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--surface-2))]'
                }`}
                title={`Click or drag "${asset.name}" into 3D Viewport`}
              >
                {/* 3D Asset Thumbnail */}
                <div className="relative w-full flex-1 bg-[hsl(var(--surface-0))] overflow-hidden">
                  {asset.thumbnail ? (
                    <img
                      src={asset.thumbnail}
                      alt={asset.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[hsl(var(--surface-2))] to-[hsl(var(--surface-0))] gap-1 p-2">
                      <div className="w-10 h-10 rounded-lg bg-[hsl(var(--border))] border border-[hsl(var(--border))] flex items-center justify-center">
                        <Box className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />
                      </div>
                      <span className="text-[9px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">
                        {asset.format}
                      </span>
                      {asset.statsAvailable && (
                        <span className="text-[8px] text-[hsl(var(--muted-foreground))]">
                          {asset.faces.toLocaleString()} faces
                        </span>
                      )}
                    </div>
                  )}

                  {/* Info Badge (i) on bottom-left of thumbnail */}
                  <div className="absolute bottom-1.5 left-1.5 w-4 h-4 rounded-full bg-[hsl(var(--surface-0))] border border-[hsl(var(--border))] flex items-center justify-center text-[hsl(var(--muted-foreground))] text-[9px] font-mono">
                    i
                  </div>

                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center text-[hsl(var(--primary-foreground))] shadow">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* Bottom Asset Label */}
                <div className="px-2 py-1 bg-[hsl(var(--surface-1))] border-t border-[hsl(var(--border))] flex items-center justify-between gap-1">
                  <div className="flex flex-col min-w-0">
                    <span className={`text-[10px] font-medium truncate ${isSelected ? 'text-[hsl(var(--primary))] font-bold' : 'text-[hsl(var(--foreground))]'}`}>
                      {asset.name}
                    </span>
                    {asset.statsAvailable && (
                      <span className="text-[8px] text-[hsl(var(--muted-foreground))] truncate">
                        {asset.format} · {asset.faces.toLocaleString()} faces · {asset.vertices.toLocaleString()} verts
                      </span>
                    )}
                  </div>

                  {/* 3-Dots Menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuAssetId(activeMenuAssetId === asset.id ? null : asset.id);
                      }}
                      className="p-0.5 rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    >
                      <MoreVertical className="w-2.5 h-2.5" />
                    </button>

                      {activeMenuAssetId === asset.id && (
                        <div className="absolute right-0 bottom-full mb-1 w-28 py-1 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] shadow-xl z-50 text-[10px]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateAsset(asset.id);
                              setActiveMenuAssetId(null);
                            }}
                           className="w-full text-left px-2 py-1 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--border))] flex items-center gap-1"
                         >
                           <Copy className="w-2.5 h-2.5 text-[hsl(var(--primary))]" />
                           <span>Duplicate</span>
                         </button>
                         {assets.length > 1 && (
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               deleteAsset(asset.id);
                               setActiveMenuAssetId(null);
                             }}
                             className="w-full text-left px-2 py-1 text-[hsl(var(--destructive))] hover:bg-[hsl(var(--border))] flex items-center gap-1"
                           >
                             <Trash2 className="w-2.5 h-2.5" />
                             <span>Delete</span>
                           </button>
                         )}
                       </div>
                     )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="p-2 border-t border-[hsl(var(--border))] flex items-center justify-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
        <button
          onClick={() => setActivePage(Math.max(1, activePage - 1))}
          disabled={activePage <= 1}
          className="p-1 rounded hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] disabled:opacity-40"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
          <button
            key={page}
            onClick={() => setActivePage(page)}
            className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${
              safePage === page ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))]'
            }`}
          >
            {page}
          </button>
        ))}

        <button
          onClick={() => setActivePage(Math.min(totalPages, activePage + 1))}
          disabled={activePage >= totalPages}
          className="p-1 rounded hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--surface-2))] disabled:opacity-40"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Upload Diagnostic Modal */}
      <UploadDiagnosticModal
        isOpen={isDiagnosticOpen}
        onClose={() => {
          setIsDiagnosticOpen(false);
          setDiagnosticFile(null);
        }}
        initialFile={diagnosticFile}
      />
    </div>
  );
};
