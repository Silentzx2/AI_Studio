"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Search, Folder, Trash2, Heart, Play, Cpu } from 'lucide-react';
import { HistoryItem } from '@/types/new-ui';

interface MyAssetsTabProps {
  history: HistoryItem[];
  onLoadProject: (item: HistoryItem) => void;
  onDeleteProject: (e: React.MouseEvent, id: string) => void;
  onToggleFavorite: (e: React.MouseEvent, id: string) => void;
}

export default function MyAssetsTab({
  history,
  onLoadProject,
  onDeleteProject,
  onToggleFavorite,
}: MyAssetsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<'ALL' | 'GLB' | 'OBJ' | 'FBX'>('ALL');

  const filteredHistory = history.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.prompt.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFormat = formatFilter === 'ALL' || item.format === formatFilter;
    return matchesSearch && matchesFormat;
  });

  return (
    <div className="flex-1 p-6 flex flex-col gap-5 animate-fadeIn text-[#FAFAFA]" id="my-assets-tab-panel">
      {/* Search and Filters Header */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-[#111116] border border-[#1E1E26] rounded-2xl p-4" id="assets-control-bar">
        {/* Search */}
        <div className="relative w-full md:w-80" id="assets-search-wrapper">
          <Search size={15} className="absolute left-3 top-3.5 text-[#52525B]" />
          <input
            type="text"
            placeholder="Search generated assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#18181F] border border-[#27272A] rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-[#52525B] focus:outline-none focus:border-[#FF5A1F] transition-all"
            id="assets-search-input"
          />
        </div>

        {/* Format Select Filter */}
        <div className="flex gap-2 w-full md:w-auto" id="format-filters-group">
          {(['ALL', 'GLB', 'OBJ', 'FBX'] as const).map((fmt) => (
            <button
              key={fmt}
              onClick={() => setFormatFilter(fmt)}
              className={`flex-1 md:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                formatFilter === fmt
                  ? 'bg-[#FF5A1F] text-black shadow-[0_2px_8px_rgba(255,90,31,0.2)]'
                  : 'bg-[#18181F] border border-[#27272A] text-[#A1A1AA] hover:text-white'
              }`}
              id={`format-filter-btn-${fmt}`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Assets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5" id="my-assets-grid">
        {filteredHistory.map((item) => (
          <div
            key={item.id}
            onClick={() => onLoadProject(item)}
            className="group bg-[#111116] border border-[#1E1E26] hover:border-[#FF5A1F]/50 rounded-2xl p-3 flex flex-col gap-3 cursor-pointer transition-all hover:scale-[1.01]"
            id={`asset-card-${item.id}`}
          >
            {/* Visual Box representation of geometric mesh */}
            <div className="relative aspect-square w-full rounded-xl bg-[#18181F] border border-[#23232C] overflow-hidden flex items-center justify-center" id={`asset-thumb-box-${item.id}`}>
              <div className="w-16 h-16 rounded bg-gradient-to-tr from-[#FF5A1F]/20 to-transparent flex items-center justify-center border border-[#FF5A1F]/10 transform group-hover:rotate-6 transition-all" id={`asset-geom-${item.id}`}>
                <Cpu size={28} className="text-[#FF5A1F] opacity-80" />
              </div>

              {/* Floating top controls */}
              <div className="absolute top-2.5 right-2.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" id={`asset-floating-tools-${item.id}`}>
                <button
                  onClick={(e) => onToggleFavorite(e, item.id)}
                  className={`p-2 rounded-lg bg-black/80 hover:bg-black text-xs transition-all ${
                    item.isFavorite ? 'text-rose-500' : 'text-[#71717A] hover:text-white'
                  }`}
                  title="Favorite model"
                  id={`asset-fav-btn-${item.id}`}
                >
                  <Heart size={12} className={item.isFavorite ? 'fill-rose-500' : ''} />
                </button>
                <button
                  onClick={(e) => onDeleteProject(e, item.id)}
                  className="p-2 rounded-lg bg-black/80 hover:bg-red-950 text-xs text-[#71717A] hover:text-red-400 transition-all"
                  title="Delete model"
                  id={`asset-del-btn-${item.id}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Format Badge */}
              <div className="absolute bottom-2.5 left-2.5" id={`asset-format-badge-container-${item.id}`}>
                <span className="px-2 py-0.5 rounded bg-black/90 text-[9px] font-mono font-bold text-white border border-[#27272A] uppercase">
                  {item.format}
                </span>
              </div>
            </div>

            {/* Labels */}
            <div className="flex flex-col gap-1" id={`asset-meta-${item.id}`}>
              <div className="flex justify-between items-start gap-1">
                <span className="text-xs font-bold text-white truncate group-hover:text-[#FF5A1F] transition-colors" id={`asset-title-${item.id}`}>
                  {item.name}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[9px] font-mono text-[#71717A]">PBR</span>
              </div>
              <p className="text-[10px] text-[#71717A] line-clamp-1 truncate" id={`asset-prompt-${item.id}`}>
                {item.prompt}
              </p>
              
              <div className="flex items-center justify-between text-[10px] text-[#71717A] font-mono mt-2 pt-2 border-t border-white/[0.03]">
                <span>🕒 {item.timestamp}</span>
                <span className="text-[#FF5A1F] font-sans font-bold flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  Open <Play size={8} />
                </span>
              </div>
            </div>
          </div>
        ))}

        {filteredHistory.length === 0 && (
          <div className="col-span-full bg-[#111116] border border-dashed border-[#1E1E26] rounded-2xl p-12 text-center flex flex-col items-center justify-center text-[#71717A]" id="assets-empty-placeholder">
            <Folder size={40} className="text-[#27272A] mb-3" />
            <p className="text-xs font-semibold text-[#FAFAFA]">No assets found</p>
            <p className="text-[10px] mt-1">Try tweaking your search terms, changing the format filter, or create a new mesh!</p>
          </div>
        )}
      </div>
    </div>
  );
}
