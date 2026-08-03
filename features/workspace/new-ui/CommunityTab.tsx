"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Globe, Heart, MessageSquare, Download, Copy, Sparkles, Check } from 'lucide-react';

interface CommunityTabProps {
  onCloneProject: (prompt: string, name: string) => void;
  onNavigate: (tab: string) => void;
}

interface CommunityModel {
  id: string;
  name: string;
  prompt: string;
  creator: string;
  avatar: string;
  likes: number;
  comments: number;
  downloads: number;
  url: string;
  hasLiked?: boolean;
}

export default function CommunityTab({ onCloneProject, onNavigate }: CommunityTabProps) {
  const [filter, setFilter] = useState<'TRENDING' | 'NEWEST' | 'FEATURED'>('TRENDING');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [communityModels, setCommunityModels] = useState<CommunityModel[]>([
    {
      id: 'comm_1',
      name: 'Steampunk Submarine',
      prompt: 'Steampunk submarine with brass gears, glowing glass portholes, hyper-detailed rivets, naval underwater render',
      creator: 'Elena_3D',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop',
      likes: 1240,
      comments: 42,
      downloads: 850,
      url: 'https://images.unsplash.com/photo-1501504905252-473c47e087f8?q=80&w=400&auto=format&fit=crop'
    },
    {
      id: 'comm_2',
      name: 'Cyberpunk Hoverbike',
      prompt: 'Cyberpunk hoverbike, neon turquoise glowing rims, sleek matte black carbon shell, dual exhaust ports, 8k resolution',
      creator: 'Kael_V',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150&auto=format&fit=crop',
      likes: 980,
      comments: 29,
      downloads: 640,
      url: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?q=80&w=400&auto=format&fit=crop'
    },
    {
      id: 'comm_3',
      name: 'Mystical Crystalline Sword',
      prompt: 'Ancient crystalline sword embedded in moss-covered stone, mystical runic glowing blade, editorial fantasy lighting',
      creator: 'Aria_Swordmaster',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&auto=format&fit=crop',
      likes: 1560,
      comments: 55,
      downloads: 1100,
      url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=400&auto=format&fit=crop'
    },
    {
      id: 'comm_4',
      name: 'Heavy Industrial Crate',
      prompt: 'Industrial sci-fi container crate, heavy duty handles, yellow hazard stripes, warning decals, rust weathering',
      creator: 'Apex_Ind',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=150&auto=format&fit=crop',
      likes: 540,
      comments: 14,
      downloads: 320,
      url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=400&auto=format&fit=crop'
    }
  ]);

  const handleLike = (id: string) => {
    setCommunityModels(
      communityModels.map((item) => {
        if (item.id === id) {
          const isLiked = !item.hasLiked;
          return {
            ...item,
            hasLiked: isLiked,
            likes: isLiked ? item.likes + 1 : item.likes - 1
          };
        }
        return item;
      })
    );
  };

  const handleCopyPrompt = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClone = (item: CommunityModel) => {
    onCloneProject(item.prompt, item.name);
    onNavigate('3D Generation');
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-6 animate-fadeIn text-[#FAFAFA]" id="community-tab-panel">
      {/* Tab Header with Banner */}
      <div className="flex justify-between items-center bg-[#111116] border border-[#1E1E26] rounded-2xl p-4 flex-wrap gap-4" id="community-header">
        <div id="community-title-meta">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Globe size={20} className="text-[#FF5A1F]" />
            Trending Community Showcases
          </h2>
          <p className="text-xs text-[#71717A] mt-1">
            Discover and clone photorealistic, high-performance 3D models curated by outstanding global artists.
          </p>
        </div>

        {/* Filter selection buttons */}
        <div className="flex gap-2 bg-[#18181F] border border-[#27272A] p-1 rounded-xl" id="community-filters">
          {(['TRENDING', 'NEWEST', 'FEATURED'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === f
                  ? 'bg-[#FF5A1F] text-black shadow-[0_2px_8px_rgba(255,90,31,0.2)]'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
              id={`comm-filter-btn-${f}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Community Models */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="community-grid">
        {communityModels.map((item) => (
          <div
            key={item.id}
            className="group bg-[#111116] border border-[#1E1E26] hover:border-[#FF5A1F]/30 rounded-2xl p-4 flex flex-col gap-4 relative transition-all hover:scale-[1.01]"
            id={`comm-card-${item.id}`}
          >
            {/* Model Preview Thumbnail */}
            <div className="relative aspect-square rounded-xl bg-[#18181F] border border-[#23232C] overflow-hidden flex items-center justify-center">
              <img
                src={item.url}
                alt={item.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />

              {/* Creator details absolute top badge */}
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/80 px-2.5 py-1 rounded-lg border border-[#27272A] max-w-[140px]">
                <img
                  src={item.avatar}
                  alt={item.creator}
                  referrerPolicy="no-referrer"
                  className="w-4.5 h-4.5 rounded-full object-cover"
                />
                <span className="text-[9px] font-bold text-white truncate">{item.creator}</span>
              </div>

              {/* Action Overlays on Hover */}
              <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4 gap-3">
                <p className="text-[10px] text-white leading-relaxed line-clamp-3">
                  💬 <span className="italic">&quot;{item.prompt}&quot;</span>
                </p>

                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    onClick={() => handleClone(item)}
                    className="px-3 py-2 bg-[#FF5A1F] hover:brightness-110 text-black font-bold text-[10px] rounded-lg flex items-center justify-center gap-1 transition-all shadow"
                    id={`clone-comm-btn-${item.id}`}
                  >
                    <Sparkles size={10} className="stroke-[3]" />
                    Clone Model
                  </button>
                  <button
                    onClick={() => handleCopyPrompt(item.id, item.prompt)}
                    className="px-3 py-2 bg-[#1E1E24] border border-[#2E2E38] hover:bg-[#25252E] text-white font-bold text-[10px] rounded-lg flex items-center justify-center gap-1 transition-all"
                    id={`copy-comm-prompt-${item.id}`}
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check size={10} className="text-emerald-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={10} />
                        Copy Prompt
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Title & Stats */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-white group-hover:text-[#FF5A1F] transition-colors">
                  {item.name}
                </span>
                <span className="text-[9px] text-[#71717A] truncate">by @{item.creator}</span>
              </div>

              {/* Counters footer row */}
              <div className="flex items-center justify-between text-[10px] text-[#71717A] font-mono border-t border-[#1E1E26] pt-3">
                <button
                  onClick={() => handleLike(item.id)}
                  className={`flex items-center gap-1 hover:text-white transition-colors ${
                    item.hasLiked ? 'text-rose-500 hover:text-rose-400' : ''
                  }`}
                  id={`like-comm-btn-${item.id}`}
                >
                  <Heart size={12} className={item.hasLiked ? 'fill-rose-500' : ''} />
                  <span>{item.likes}</span>
                </button>
                <div className="flex items-center gap-1">
                  <MessageSquare size={12} />
                  <span>{item.comments}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Download size={12} />
                  <span>{item.downloads}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
