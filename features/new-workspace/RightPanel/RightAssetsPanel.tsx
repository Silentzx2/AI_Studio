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
        id?: string;
        filename: string;
        stored_filename?: string;
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
        id: result?.id || result?.stored_filename || `user-upload-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        category: 'mesh',
        meshType: 'custom',
        thumbnail: resolveUrl(result?.thumbnail_url),
        faces: meshStats?.polygon_count || 0,
        vertices: meshStats?.vertex_count || 0,
        triangles: meshStats?.polygon_count || 0,
        statsAvailable: !!(meshStats && meshStats.polygon_count > 0),
        source: { filename: result?.stored_filename || file.name, subfolder: '', type: 'upload', viewUrl: resolveUrl(result?.url) },
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
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / ITEMS_PER_PAGE));
  const safePage = Math.min(activePage, totalPages);
  const paginatedAssets = filteredAssets.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  return (
    <div id="panel-assets-library" className="flex flex-col h-full bg-[#191A1D] text-xs select-none">
      {/* Hidden file input for uploading custom 3D files */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,.obj,.fbx,.stl,.ply"
        className="hidden"
        onChange={handleModelUpload}
      />

      {/* Top Action Sub-bar */}
      <div className="px-2 py-1.5 border-b border-white/[0.08] bg-[#16181D]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {/* Grid / All View */}
            <SimpleTooltip label="All Assets">
              <button
                onClick={() => { setShowFavoritesOnly(false); setAssetFilter('all'); }}
                className={`p-1 rounded-md transition-colors ${
                  !showFavoritesOnly && assetFilter === 'all'
                    ? 'bg-[#25262A] text-[#F9CF00]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <GridIcon className="w-3 h-3" />
              </button>
            </SimpleTooltip>

            {/* Favorite Filter */}
            <SimpleTooltip label="Favorites Only">
              <button
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`p-1 rounded-md transition-colors ${
                  showFavoritesOnly
                    ? 'bg-[#25262A] text-[#F9CF00]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Star className="w-3 h-3" />
              </button>
            </SimpleTooltip>

            {/* Category Filter */}
            <div className="relative">
              <SimpleTooltip label="Filter by Category">
                <button
                  onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                  className={`p-1 rounded-md transition-colors ${
                    assetFilter !== 'all'
                      ? 'bg-[#25262A] text-[#F9CF00]'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                </button>
              </SimpleTooltip>

              {filterMenuOpen && (
                <div className="absolute top-full left-0 mt-1 w-32 py-1 rounded-xl bg-[#202125] border border-white/[0.1] shadow-2xl z-50 text-[10px]">
                  <button
                    onClick={() => { setAssetFilter('all'); setFilterMenuOpen(false); }}
                    className="w-full text-left px-2 py-1 hover:bg-[#28292E] text-zinc-200"
                  >
                    All Assets
                  </button>
                  <button
                    onClick={() => { setAssetFilter('models'); setFilterMenuOpen(false); }}
                    className="w-full text-left px-2 py-1 hover:bg-[#28292E] text-zinc-200"
                  >
                    3D Models
                  </button>
                  <button
                    onClick={() => { setAssetFilter('textures'); setFilterMenuOpen(false); }}
                    className="w-full text-left px-2 py-1 hover:bg-[#28292E] text-zinc-200"
                  >
                    PBR Textures
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Manage Button */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-0.5 rounded-md text-[10px] font-bold text-zinc-200 hover:text-[#F9CF00] hover:bg-[#25262A] border border-white/[0.08] transition-colors cursor-pointer"
            >
              <span>Import</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Asset Grid Body */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
        {filteredAssets.length === 0 && (
          <div className="py-8 px-2 text-center text-zinc-400">
            <FolderOpen className="w-6 h-6 mx-auto mb-2 text-zinc-500" />
            <div className="text-[11px] font-semibold text-zinc-300">No outputs yet</div>
            <div className="text-[9px] mt-0.5 text-zinc-500">Run a generation workflow or import a 3D file.</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {/* Upload 3D Model Card */}
          <div
            id="btn-upload-3d-model-card"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`group relative rounded-xl border border-dashed cursor-pointer p-2 flex flex-col items-center justify-center text-center aspect-square transition-all ${
              isDragOver
                ? 'border-[#F9CF00] bg-[#F9CF00]/10'
                : 'border-white/[0.1] hover:border-[#F9CF00]/60 bg-[#141518] hover:bg-[#1A1B1F]'
            }`}
          >
            {uploadProgress.active ? (
              <div className="flex flex-col items-center justify-center space-y-1 w-full px-1">
                <Loader2 className="w-4 h-4 animate-spin text-[#F9CF00]" />
                <div className="w-full bg-[#25262A] rounded-full h-1 overflow-hidden">
                  <div
                    className="bg-[#F9CF00] h-full rounded-full transition-all duration-200"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
                <span className="text-[8px] text-zinc-400">
                  {uploadProgress.percent}%
                </span>
              </div>
            ) : (
              <>
                <div className={`w-6 h-6 rounded-full bg-[#25262A] border border-white/[0.08] flex items-center justify-center transition-all mb-1 ${
                  isDragOver ? 'text-[#F9CF00] border-[#F9CF00]' : 'text-zinc-400 group-hover:text-[#F9CF00]'
                }`}>
                  <Box className="w-3 h-3" />
                </div>
                <span className="text-[10px] font-bold text-white leading-tight block">
                  {isDragOver ? 'Drop here' : 'Import'}
                </span>
                <span className="text-[8px] text-zinc-500 block">
                  GLB, GLTF, OBJ, FBX, STL, PLY
                </span>
              </>
            )}
           </div>

           {uploadError && (
            <div className="col-span-2 flex items-center gap-1 text-[9px] text-rose-400 px-1">
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
                    ? 'ring-2 ring-[#F9CF00] bg-[#25262A] shadow-md shadow-[#F9CF00]/15'
                    : 'border border-white/[0.08] bg-[#141518] hover:border-white/[0.18] hover:bg-[#1A1B1F]'
                }`}
                title={`Click or drag "${asset.name}" into 3D Viewport`}
              >
                {/* 3D Asset Thumbnail */}
                <div className="relative w-full flex-1 bg-[#121316] overflow-hidden">
                  {asset.thumbnail ? (
                    <img
                      src={asset.thumbnail}
                      alt={asset.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-[#16181D] gap-0.5 p-1">
                      <div className="w-6 h-6 rounded-md bg-[#202125] border border-white/[0.08] flex items-center justify-center">
                        <Box className="w-3.5 h-3.5 text-zinc-400" />
                      </div>
                      <span className="text-[8px] font-bold text-zinc-400 uppercase">
                        {asset.format}
                      </span>
                    </div>
                  )}


                  {isSelected && (
                    <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-[#F9CF00] flex items-center justify-center text-black shadow">
                      <Check className="w-2 h-2 stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* Bottom Asset Label */}
                <div className="px-1.5 py-1 bg-[#16181D] border-t border-white/[0.06] flex items-center justify-between gap-1">
                  <span className={`text-[9px] truncate ${isSelected ? 'text-[#F9CF00] font-bold' : 'text-zinc-200'}`}>
                    {asset.name}
                  </span>

                  {/* 3-Dots Menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuAssetId(activeMenuAssetId === asset.id ? null : asset.id);
                      }}
                      className="p-0.5 rounded text-zinc-400 hover:text-white"
                    >
                      <MoreVertical className="w-2.5 h-2.5" />
                    </button>

                      {activeMenuAssetId === asset.id && (
                        <div className="absolute right-0 bottom-full mb-1 w-24 py-1 rounded-lg bg-[#202125] border border-white/[0.1] shadow-xl z-50 text-[9px]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateAsset(asset.id);
                              setActiveMenuAssetId(null);
                            }}
                           className="w-full text-left px-2 py-1 text-zinc-200 hover:bg-[#28292E] flex items-center gap-1"
                         >
                           <Copy className="w-2.5 h-2.5 text-[#F9CF00]" />
                           <span>Duplicate</span>
                         </button>
                         {assets.length > 1 && (
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               deleteAsset(asset.id);
                               setActiveMenuAssetId(null);
                             }}
                             className="w-full text-left px-2 py-1 text-rose-400 hover:bg-rose-500/10 flex items-center gap-1"
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
      <div className="p-2 border-t border-[#2f333e] bg-[#1e2026] flex items-center justify-center gap-1 text-xs text-zinc-400">
        <button
          onClick={() => setActivePage(Math.max(1, activePage - 1))}
          disabled={activePage <= 1}
          className="p-1 rounded hover:text-white hover:bg-[#282b34] disabled:opacity-40"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
          <button
            key={page}
            onClick={() => setActivePage(page)}
            className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${
              safePage === page ? 'bg-[#F9CF00] text-black' : 'hover:text-white hover:bg-[#282b34] text-zinc-400'
            }`}
          >
            {page}
          </button>
        ))}

        <button
          onClick={() => setActivePage(Math.min(totalPages, activePage + 1))}
          disabled={activePage >= totalPages}
          className="p-1 rounded hover:text-white hover:bg-[#282b34] disabled:opacity-40"
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
