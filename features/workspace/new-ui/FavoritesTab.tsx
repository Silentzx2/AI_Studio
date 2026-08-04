"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Heart, Play, Trash2, Cpu } from 'lucide-react';
import { HistoryItem } from '@/types/new-ui';

interface FavoritesTabProps {
  history: HistoryItem[];
  onLoadProject: (item: HistoryItem) => void;
  onRemoveFavorite: (e: React.MouseEvent, id: string) => void;
  onDeleteProject: (e: React.MouseEvent, id: string) => void;
}

export default function FavoritesTab({
  history,
  onLoadProject,
  onRemoveFavorite,
  onDeleteProject,
}: FavoritesTabProps) {
  const favoriteItems = history.filter((item) => item.isFavorite);

  return (
    <div className="flex-1 p-6 flex flex-col gap-6 animate-fadeIn text-[hsl(var(--foreground))]" id="favorites-tab-panel">
      {/* Intro */}
      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Heart size={20} className="text-rose-500 fill-rose-500" />
          Your Favorite Creations
        </h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
          A filtered view of your highest rated 3D models. Click any model to load it inside the workspace render stage!
        </p>
      </div>

      {/* Favorites Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5" id="favorites-grid">
        {favoriteItems.map((item) => (
          <div
            key={item.id}
            onClick={() => onLoadProject(item)}
            className="group bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] hover:border-rose-500/30 rounded-2xl p-3 flex flex-col gap-3 cursor-pointer transition-all hover:scale-[1.01]"
            id={`favorite-card-${item.id}`}
          >
            {/* Visual Box */}
            <div className="relative aspect-square w-full rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--surface-3))] overflow-hidden flex items-center justify-center">
              <div className="w-16 h-16 rounded bg-gradient-to-tr from-rose-500/10 to-transparent flex items-center justify-center border border-rose-500/10 transform group-hover:rotate-6 transition-all">
                <Cpu size={28} className="text-rose-500 opacity-80" />
              </div>

              {/* Floating top tools */}
              <div className="absolute top-2.5 right-2.5 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => onRemoveFavorite(e, item.id)}
                  className="p-2 rounded-lg bg-black/85 hover:bg-black text-rose-500 text-xs transition-all"
                  title="Remove from favorites"
                  id={`remove-fav-btn-${item.id}`}
                >
                  <Heart size={12} className="fill-rose-500" />
                </button>
                <button
                  onClick={(e) => onDeleteProject(e, item.id)}
                  className="p-2 rounded-lg bg-black/85 hover:bg-red-950 text-xs text-[hsl(var(--muted-foreground))] hover:text-red-400 transition-all"
                  title="Delete creation"
                  id={`del-fav-btn-${item.id}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Format Badge */}
              <div className="absolute bottom-2.5 left-2.5">
                <span className="px-2 py-0.5 rounded bg-black/90 text-[9px] font-mono font-bold text-white border border-[hsl(var(--border))] uppercase">
                  {item.format}
                </span>
              </div>
            </div>

            {/* Labels */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-white group-hover:text-[hsl(var(--neon-amber))] transition-colors truncate">
                {item.name}
              </span>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] line-clamp-1 truncate">
                {item.prompt}
              </p>
              
              <div className="flex items-center justify-between text-[10px] text-[hsl(var(--muted-foreground))] font-mono mt-2 pt-2 border-t border-white/[0.03]">
                <span>🕒 {item.timestamp}</span>
                <span className="text-rose-500 font-sans font-bold flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  Load <Play size={8} />
                </span>
              </div>
            </div>
          </div>
        ))}

        {favoriteItems.length === 0 && (
          <div className="col-span-full bg-[hsl(var(--surface-1))] border border-dashed border-[hsl(var(--border))] rounded-2xl p-12 text-center flex flex-col items-center justify-center text-[hsl(var(--muted-foreground))]" id="favorites-empty-placeholder">
            <Heart size={40} className="text-[hsl(var(--border))] mb-3" />
            <p className="text-xs font-semibold text-[hsl(var(--foreground))]">No favorites saved yet</p>
            <p className="text-[10px] mt-1">To add models here, click the heart icon on any generated item card in history grids.</p>
          </div>
        )}
      </div>
    </div>
  );
}
