import React, { useState, useRef } from 'react';
import { 
  Plus, 
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
  Upload,
  Info,
  SlidersHorizontal,
  FolderOpen
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { ModelAsset } from '../types';

export const RightAssetsPanel: React.FC = () => {
  const { 
    assets, 
    currentAsset, 
    setCurrentAsset, 
    assetFilter, 
    setAssetFilter,
    duplicateAsset,
    deleteAsset,
    addAsset
  } = useWorkspace();

  const [activePage, setActivePage] = useState(1);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [activeMenuAssetId, setActiveMenuAssetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredAssets = assets.filter(a => {
    if (showFavoritesOnly && !a.isFavorite) return false;
    if (assetFilter === 'all') return true;
    if (assetFilter === 'models') return a.category === 'generation' || a.category === 'mesh';
    if (assetFilter === 'textures') return a.category === 'texture' || a.tags?.includes('PBR');
    if (assetFilter === 'images') return a.tags?.includes('character') || a.tags?.includes('sculpture');
    if (assetFilter === 'videos') return a.category === 'animation';
    return true;
  });

  const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newAsset: ModelAsset = {
        id: `user-upload-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        category: 'mesh',
        meshType: 'custom',
        thumbnail: '',
        faces: 0,
        vertices: 0,
        triangles: 0,
        statsAvailable: false,
        source: { filename: file.name, subfolder: '', type: 'input', localUrl: URL.createObjectURL(file) },
        topology: 'Triangle',
        format: (() => {
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext === 'obj') return 'OBJ';
          if (ext === 'ply') return 'PLY';
          if (ext === 'glb' || ext === 'gltf') return 'GLB';
          return 'FILE';
        })(),
        dateCreated: '',
        tags: ['Custom', 'User-Upload', 'Mesh']
      };
      addAsset(newAsset);
      setCurrentAsset(newAsset);
    }
  };

  return (
    <div id="panel-assets-library" className="flex flex-col h-full bg-[#101115] text-xs select-none">
      {/* Hidden file input for uploading custom 3D files */}
      <input 
        ref={fileInputRef}
        type="file" 
        accept=".glb,.gltf,.obj,.fbx,.stl" 
        className="hidden" 
        onChange={handleModelUpload}
      />

      {/* Top Action Sub-bar (Matching Reference Image) */}
      <div className="p-3 border-b border-[#21242c] space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {/* Grid / All View */}
            <button
              onClick={() => { setShowFavoritesOnly(false); setAssetFilter('all'); }}
              title="All Assets"
              className={`p-1.5 rounded-lg transition-colors ${
                !showFavoritesOnly && assetFilter === 'all'
                  ? 'bg-[#232733] text-[#f5c518]'
                  : 'text-[#8e95a5] hover:text-[#f3f4f6] hover:bg-[#181a22]'
              }`}
            >
              <GridIcon className="w-3.5 h-3.5" />
            </button>

            {/* Favorite Filter */}
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              title="Favorites Only"
              className={`p-1.5 rounded-lg transition-colors ${
                showFavoritesOnly
                  ? 'bg-[#232733] text-[#f5c518]'
                  : 'text-[#8e95a5] hover:text-[#f3f4f6] hover:bg-[#181a22]'
              }`}
            >
              <Star className="w-3.5 h-3.5" />
            </button>

            {/* Category Filter */}
            <div className="relative">
              <button
                onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                title="Filter by Category"
                className={`p-1.5 rounded-lg transition-colors ${
                  assetFilter !== 'all'
                    ? 'bg-[#232733] text-[#f5c518]'
                    : 'text-[#8e95a5] hover:text-[#f3f4f6] hover:bg-[#181a22]'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
              </button>

              {filterMenuOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-36 py-1 rounded-xl bg-[#181a22] border border-[#2b3040] shadow-2xl z-50 text-xs">
                  <button
                    onClick={() => { setAssetFilter('all'); setFilterMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#232734] text-[#cbd5e1]"
                  >
                    All Assets
                  </button>
                  <button
                    onClick={() => { setAssetFilter('models'); setFilterMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#232734] text-[#cbd5e1]"
                  >
                    3D Models
                  </button>
                  <button
                    onClick={() => { setAssetFilter('textures'); setFilterMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#232734] text-[#cbd5e1]"
                  >
                    PBR Textures
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Manage Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-[#cbd5e1] hover:text-[#f5c518] hover:bg-[#181a22] border border-[#242834] transition-colors"
          >
            <span>Manage</span>
          </button>
        </div>
      </div>

      {/* Main Asset Grid Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredAssets.length === 0 && (
          <div className="py-14 px-4 text-center text-[#6b7280]">
            <FolderOpen className="w-8 h-8 mx-auto mb-3 text-[#3d4350]" />
            <div className="text-xs font-semibold text-[#9ca3af]">No real outputs yet</div>
            <div className="text-[10px] mt-1">Run a generation workflow or import a local 3D file.</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Upload 3D Model Card (Matching Reference Image) */}
          <div
            id="btn-upload-3d-model-card"
            onClick={() => fileInputRef.current?.click()}
            className="group relative rounded-xl border border-dashed border-[#2f3545] hover:border-[#f5c518]/60 bg-[#12141a] hover:bg-[#161922] cursor-pointer p-3 flex flex-col items-center justify-center text-center aspect-square transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-[#1b1e28] border border-[#282d3b] flex items-center justify-center text-[#8e95a5] group-hover:text-[#f5c518] group-hover:scale-105 transition-all mb-1.5">
              <Box className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-bold text-[#e5e7eb] leading-tight block">
              Upload 3D Model
            </span>
            <span className="text-[9px] text-[#717786] mt-0.5 block">
              OBJ, FBX, STL, GLB
            </span>
            <span className="text-[9px] text-[#555a68] block">
              Size ≤150MB
            </span>
          </div>

          {/* Asset Items */}
          {filteredAssets.map((asset) => {
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
                    ? 'ring-2 ring-[#f5c518] bg-[#1a1d26] shadow-lg shadow-[#f5c518]/15'
                    : 'border border-[#212530] bg-[#13151b] hover:border-[#383f50] hover:bg-[#161922]'
                }`}
                title={`Click or drag "${asset.name}" into 3D Viewport`}
              >
                {/* 3D Asset Thumbnail */}
                <div className="relative w-full flex-1 bg-[#0b0c0f] overflow-hidden">
                  {asset.thumbnail ? (
                    <img
                      src={asset.thumbnail}
                      alt={asset.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Box className="w-8 h-8 text-[#4b5563]" />
                    </div>
                  )}

                  {/* Info Badge (i) on bottom-left of thumbnail */}
                  <div className="absolute bottom-1.5 left-1.5 w-4 h-4 rounded-full bg-[#0d0e12]/80 backdrop-blur-sm border border-[#252a36] flex items-center justify-center text-[#9ca3af] text-[9px] font-mono">
                    i
                  </div>

                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#f5c518] flex items-center justify-center text-[#111216] shadow">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  )}
                </div>

                {/* Bottom Asset Label */}
                <div className="px-2 py-1 bg-[#12141a]/95 border-t border-[#1e222c] flex items-center justify-between">
                  <span className={`text-[10px] font-medium truncate ${isSelected ? 'text-[#f5c518] font-bold' : 'text-[#cbd5e1]'}`}>
                    {asset.name}
                  </span>

                  {/* 3-Dots Menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuAssetId(activeMenuAssetId === asset.id ? null : asset.id);
                      }}
                      className="p-0.5 rounded text-[#717684] hover:text-[#f3f4f6]"
                    >
                      <MoreVertical className="w-2.5 h-2.5" />
                    </button>

                    {activeMenuAssetId === asset.id && (
                      <div className="absolute right-0 bottom-full mb-1 w-28 py-1 rounded-lg bg-[#1a1d26] border border-[#2e3342] shadow-xl z-50 text-[10px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateAsset(asset.id);
                            setActiveMenuAssetId(null);
                          }}
                          className="w-full text-left px-2 py-1 text-[#e5e7eb] hover:bg-[#252a36] flex items-center gap-1"
                        >
                          <Copy className="w-2.5 h-2.5 text-[#f5c518]" />
                          <span>Duplicate</span>
                        </button>
                        {assets.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteAsset(asset.id);
                              setActiveMenuAssetId(null);
                            }}
                            className="w-full text-left px-2 py-1 text-[#ef4444] hover:bg-[#252a36] flex items-center gap-1"
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
      <div className="p-2.5 border-t border-[#21242c] flex items-center justify-center gap-1 text-xs text-[#8e95a5]">
        <button
          onClick={() => setActivePage(Math.max(1, activePage - 1))}
          className="p-1 rounded hover:text-[#f3f4f6] hover:bg-[#181a20]"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setActivePage(1)}
          className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${
            activePage === 1 ? 'bg-[#f5c518] text-[#111216]' : 'hover:text-[#f3f4f6] hover:bg-[#181a20]'
          }`}
        >
          1
        </button>

        <button
          onClick={() => setActivePage(2)}
          className={`w-5 h-5 rounded flex items-center justify-center text-xs ${
            activePage === 2 ? 'bg-[#f5c518] text-[#111216]' : 'hover:text-[#f3f4f6] hover:bg-[#181a20]'
          }`}
        >
          2
        </button>

        <button
          onClick={() => setActivePage(Math.min(2, activePage + 1))}
          className="p-1 rounded hover:text-[#f3f4f6] hover:bg-[#181a20]"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
