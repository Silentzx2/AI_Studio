"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import anime from 'animejs';
import { Search, Folder, Trash2, Heart, Play, Cpu, LayoutGrid, Clock } from 'lucide-react';
import { HistoryItem } from '@/types/new-ui';
import { ProjectTimeline } from '@/components/ActivityLogger';

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
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  
  const filteredHistory = history.filter((item) => {
    const text = `${item.name || ''} ${item.prompt || ''}`.toLowerCase();
    const matchesSearch = text.includes(searchQuery.toLowerCase());
    const matchesFormat = formatFilter === 'ALL' || (item.format && item.format.toUpperCase() === formatFilter);
    return matchesSearch && matchesFormat;
  });

  useEffect(() => {
    if (viewMode === 'grid') {
      anime({
        targets: '#my-assets-grid > div',
        opacity: [0, 1],
        translateY: [15, 0],
        delay: anime.stagger(25),
        easing: 'easeOutQuad',
        duration: 400
      });
    }
  }, [filteredHistory.length, viewMode]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6 text-foreground max-w-7xl mx-auto w-full pb-10" id="my-assets-tab-panel">
      {/* Intro section with refined Studio layout */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-tripo-yellow-1/10 flex items-center justify-center border border-tripo-yellow-1/20">
            <Folder size={20} className="text-tripo-yellow-1" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Asset Store &amp; Library</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-xs text-tripo-gray-300">
                {history.length} assets saved in local storage &amp; cloud cache
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher: Gallery vs Project Timeline */}
        <div className="flex p-1 rounded-xl bg-tripo-gray-2/80 border border-tripo-white-5">
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-tripo-gray-4 text-tripo-yellow-1 shadow-sm'
                : 'text-tripo-gray-300 hover:text-white'
            }`}
          >
            <LayoutGrid size={13} />
            <span>Asset Grid</span>
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === 'timeline'
                ? 'bg-tripo-gray-4 text-tripo-yellow-1 shadow-sm'
                : 'text-tripo-gray-300 hover:text-white'
            }`}
          >
            <Clock size={13} />
            <span>Timeline</span>
          </button>
        </div>
      </div>

      {viewMode === 'timeline' ? (
        /* Visual Project Timeline from ActivityLogger */
        <ProjectTimeline onLoadProject={onLoadProject} />
      ) : (
        /* Grid Gallery View */
        <>
          {/* Search and Filters Header */}
          <div className="flex flex-col md:flex-row gap-3 justify-between items-start md:items-center bg-tripo-gray-2/80 border border-tripo-white-5 rounded-2xl p-3.5" id="assets-control-bar">
            {/* Search */}
            <div className="relative w-full md:w-80" id="assets-search-wrapper">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tripo-gray-400" />
              <input
                type="text"
                placeholder="Search generated assets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-tripo-gray-3 border border-tripo-white-5 rounded-xl h-9 pl-9 pr-4 text-xs text-white placeholder-tripo-gray-400 focus:outline-none focus:border-tripo-yellow-1/50 transition-all"
                id="assets-search-input"
              />
            </div>

            {/* Format Select Filter */}
            <div className="flex gap-1.5 w-full md:w-auto" id="format-filters-group">
              {(['ALL', 'GLB', 'OBJ', 'FBX'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormatFilter(fmt)}
                  className={`flex-1 md:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                    formatFilter === fmt
                      ? 'bg-tripo-yellow-1/15 text-tripo-yellow-1 border-tripo-yellow-1/30'
                      : 'bg-transparent text-tripo-gray-300 hover:text-white border-transparent'
                  }`}
                  id={`format-filter-btn-${fmt}`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Grid of Assets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" id="my-assets-grid">
            {filteredHistory.map((item) => {
              const title = item.name || item.prompt || 'Untitled 3D Asset';
              const prompt = item.prompt || item.name || 'AI generated neural mesh';
              const date = item.date || item.timestamp || 'Recent';
              const isFav = Boolean(item.favorite || item.isFavorite);

              return (
                <div
                  key={item.id}
                  onClick={() => onLoadProject(item)}
                  className="group rounded-2xl p-3 bg-tripo-gray-2/80 hover:bg-tripo-gray-3 border border-tripo-white-5 hover:border-tripo-white-15 flex flex-col gap-2.5 cursor-pointer transition-all duration-200 shadow-sm hover:-translate-y-0.5"
                  id={`asset-card-${item.id}`}
                >
                  {/* Visual Box representation of geometric mesh */}
                  <div className="relative aspect-square w-full rounded-xl bg-tripo-gray-3/80 border border-tripo-white-5 overflow-hidden flex items-center justify-center group-hover:border-tripo-yellow-1/30 transition-all" id={`asset-thumb-box-${item.id}`}>
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-tripo-gray-4 border border-tripo-white-5 flex items-center justify-center group-hover:scale-110 transition-transform" id={`asset-geom-${item.id}`}>
                        <Cpu size={26} className="text-tripo-yellow-1/70" />
                      </div>
                    )}

                    {/* Floating top controls */}
                    <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" id={`asset-floating-tools-${item.id}`}>
                      <button
                        onClick={(e) => onToggleFavorite(e, item.id)}
                        className={`p-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-xs transition-all ${
                          isFav ? 'text-rose-500' : 'text-tripo-gray-300 hover:text-white'
                        }`}
                        title="Favorite model"
                        id={`asset-fav-btn-${item.id}`}
                      >
                        <Heart size={13} className={isFav ? 'fill-rose-500' : ''} />
                      </button>
                      <button
                        onClick={(e) => onDeleteProject(e, item.id)}
                        className="p-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-xs text-tripo-gray-300 hover:text-rose-400 transition-all"
                        title="Delete model"
                        id={`asset-del-btn-${item.id}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Format Badge */}
                    <div className="absolute bottom-2 left-2" id={`asset-format-badge-container-${item.id}`}>
                      <span className="px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[9px] font-mono font-bold text-tripo-gray-200 border border-white/10 uppercase">
                        {item.format || 'GLB'}
                      </span>
                    </div>
                  </div>

                  {/* Labels */}
                  <div className="flex flex-col gap-1" id={`asset-meta-${item.id}`}>
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-xs font-bold text-white truncate group-hover:text-tripo-yellow-1 transition-colors" id={`asset-title-${item.id}`}>
                        {title}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-tripo-white-5 text-[9px] font-mono text-tripo-gray-300">PBR</span>
                    </div>
                    <p className="text-[11px] text-tripo-gray-300 truncate" id={`asset-prompt-${item.id}`}>
                      {prompt}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-tripo-gray-400 font-mono mt-1 pt-2 border-t border-tripo-white-5">
                      <span>{date}</span>
                      <span className="text-tripo-yellow-1 font-sans font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span>Load</span> <Play size={9} className="fill-tripo-yellow-1" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredHistory.length === 0 && (
              <div className="col-span-full bg-tripo-gray-2/60 border border-dashed border-tripo-white-10 rounded-2xl p-12 text-center flex flex-col items-center justify-center text-tripo-gray-300" id="assets-empty-placeholder">
                <Folder size={36} className="text-tripo-yellow-1/50 mb-3" />
                <p className="text-xs font-bold text-white">No assets found</p>
                <p className="text-xs text-tripo-gray-400 mt-1 max-w-sm">Try adjusting your search terms, changing the format filter, or create a new 3D model in the generator.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
