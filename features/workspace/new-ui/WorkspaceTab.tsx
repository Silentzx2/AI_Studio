"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Database, TrendingUp, HardDrive, Clock, Plus, ArrowRight, Sparkles, FolderOpen } from 'lucide-react';
import { HistoryItem } from '@/types/new-ui';
import { useSystemOverview, useSystemStatistics } from '@/hooks/useBackendData';

interface WorkspaceTabProps {
  history: HistoryItem[];
  onLoadProject: (item: HistoryItem) => void;
  onNavigate: (tab: string) => void;
}

export default function WorkspaceTab({ history, onLoadProject, onNavigate }: WorkspaceTabProps) {
  const { overview } = useSystemOverview();
  const { stats } = useSystemStatistics();
  
  const totalAssets = overview?.overview?.total_jobs || history.length || 0;
  const favoritesCount = history.filter(h => h.isFavorite).length || 0;
  const storageUsed = overview?.overview?.storage_used || '0 GB';
  const storageTotal = overview?.overview?.storage_total || '0 GB';
  const avgGenerationTime = overview?.overview?.avg_generation_time || '0s';

  const cpuUsage = stats?.stats?.cpu_usage || 0;
  const memoryUsage = stats?.stats?.memory_usage || 0;
  const gpuUsage = stats?.stats?.gpu_utilization || 0;

  return (
    <div className="flex-1 p-6 flex flex-col gap-6 animate-fadeIn text-[#FAFAFA]" id="workspace-tab-panel">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1E1B4B] via-[#0F172A] to-[#1E293B] border border-[#27272A] p-6 sm:p-8" id="workspace-welcome-banner">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#F5A623]/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5A623]/10 border border-[#F5A623]/30 text-xs font-bold text-[#F5A623] uppercase tracking-wider mb-4">
            <Sparkles size={12} className="animate-pulse" />
            AI 3D Studio Engine Active
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Welcome back to your Creative Studio
          </h2>
          <p className="mt-2 text-sm text-[#A1A1AA] leading-relaxed">
            Create ultra-realistic 3D models with PBR textures using our latest neural mesh generator, or convert conceptual 2D images to complete interactive assets.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('3D Generation')}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#F5A623] to-[#FF8A00] text-black font-bold text-xs flex items-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(245,166,35,0.25)]"
              id="workspace-start-btn"
            >
              Open 3D Workspace
              <Plus size={14} className="stroke-[3]" />
            </button>
          </div>
        </div>
      </div>

      {/* Statistics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="workspace-stats-row">
        {[
          { label: 'Total Models Baked', value: totalAssets, sub: 'All formats (GLB/OBJ)', icon: Database, color: 'text-[#F5A623]' },
          { label: 'Favorite Creations', value: favoritesCount, sub: 'Saved in favorites', icon: TrendingUp, color: 'text-rose-500' },
          { label: 'Storage Used', value: storageUsed, sub: `of ${storageTotal} limit`, icon: HardDrive, color: 'text-amber-500' },
          { label: 'Baking Efficiency', value: avgGenerationTime, sub: 'Avg generation time', icon: Clock, color: 'text-emerald-500' },
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="bg-[#111116] border border-[#1E1E26] rounded-xl p-4 flex flex-col justify-between" id={`stat-card-${idx}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#71717A] uppercase tracking-wider">{stat.label}</span>
                <Icon size={16} className={stat.color} />
              </div>
              <div className="mt-4">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight">{stat.value}</span>
                <p className="text-[10px] text-[#71717A] mt-1">{stat.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid Content: Left - Recent Drafts, Right - Storage/News */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="workspace-content-grid">
        {/* Left Column: Recent Projects (Span 2) */}
        <div className="lg:col-span-2 flex flex-col gap-4" id="recent-drafts-wrapper">
          <div className="flex justify-between items-center" id="recent-drafts-header">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FolderOpen size={16} className="text-[#F5A623]" />
              Recent Workspace Projects
            </h3>
            <button
              onClick={() => onNavigate('My Assets')}
              className="text-xs font-semibold text-[#F5A623] hover:underline flex items-center gap-1"
              id="view-all-drafts-btn"
            >
              View All <ArrowRight size={12} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="workspace-drafts-grid">
            {history.slice(0, 4).map((item) => (
              <div
                key={item.id}
                onClick={() => onLoadProject(item)}
                className="group bg-[#111116] border border-[#1E1E26] hover:border-[#F5A623]/50 rounded-xl p-4 flex flex-col gap-3 cursor-pointer transition-all hover:scale-[1.01]"
                id={`workspace-draft-card-${item.id}`}
              >
                <div className="aspect-[4/3] rounded-lg bg-[#18181F] flex items-center justify-center relative border border-[#23232C] overflow-hidden">
                  <div className="w-12 h-12 rounded bg-gradient-to-tr from-[#F5A623]/20 to-transparent flex items-center justify-center border border-[#F5A623]/10 transform group-hover:rotate-6 transition-all">
                    <Database size={20} className="text-[#F5A623] opacity-80" />
                  </div>
                  <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/85 border border-[#27272A] text-[9px] font-mono font-bold text-white uppercase">
                    {item.format}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-white group-hover:text-[#F5A623] transition-colors truncate">
                    {item.name}
                  </span>
                  <span className="text-[10px] text-[#71717A] truncate">
                    {item.prompt}
                  </span>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1E1E26] text-[9px] text-[#71717A] font-mono">
                    <span>🕒 {item.timestamp}</span>
                    <span className="text-[#F5A623] group-hover:underline flex items-center gap-0.5 font-sans font-semibold">
                      Load in Studio <ArrowRight size={10} />
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <div className="col-span-full bg-[#111116] border border-dashed border-[#1E1E26] rounded-xl p-8 text-center flex flex-col items-center justify-center text-[#71717A]" id="empty-workspace-placeholder">
                <FolderOpen size={36} className="text-[#27272A] mb-3" />
                <p className="text-xs font-semibold text-[#FAFAFA]">No active projects</p>
                <p className="text-[10px] mt-1">Start by generating your very first 3D model in the generator tab.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Engine Stats & Guide */}
        <div className="flex flex-col gap-6" id="workspace-sidebar-info">
          {/* Engine Health Panel */}
          <div className="bg-[#111116] border border-[#1E1E26] rounded-xl p-4 flex flex-col gap-4" id="engine-health-widget">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Engine Nodes Status</h4>
            <div className="flex flex-col gap-3" id="nodes-status-list">
              {[
                { name: 'Compute CPU', load: `${cpuUsage}%`, status: cpuUsage > 80 ? 'High Load' : 'Operational', color: cpuUsage > 80 ? 'bg-amber-500' : 'bg-emerald-500' },
                { name: 'System Memory', load: `${memoryUsage}%`, status: memoryUsage > 80 ? 'High Load' : 'Operational', color: memoryUsage > 80 ? 'bg-amber-500' : 'bg-emerald-500' },
                { name: 'GPU Synthesizer', load: `${gpuUsage}%`, status: gpuUsage > 80 ? 'High Load' : (gpuUsage > 10 ? 'Generating' : 'Idle'), color: gpuUsage > 80 ? 'bg-amber-500' : (gpuUsage > 10 ? 'bg-blue-500' : 'bg-emerald-500') },
              ].map((node, i) => (
                <div key={i} className="flex flex-col gap-1" id={`node-${i}`}>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-semibold text-[#A1A1AA]">{node.name}</span>
                    <span className="font-mono text-[#71717A]">{node.load}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${node.color}`} />
                    <span className="text-[9px] text-[#71717A] font-medium">{node.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Learning Card */}
          <div className="bg-gradient-to-br from-[#18181F] to-[#111116] border border-[#1E1E26] rounded-xl p-4 flex flex-col gap-3" id="workspace-pro-tip">
            <span className="text-[10px] text-[#F5A623] font-bold uppercase tracking-widest font-mono">PRO TIP</span>
            <h4 className="text-xs font-bold text-[#FAFAFA]">High fidelity texturing with PBR maps</h4>
            <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
              When using Text-to-3D, append descriptive material keywords like <code className="text-xs text-white bg-[#1E1E24] px-1 py-0.5 rounded font-mono">polished carbon fiber</code>, <code className="text-xs text-white bg-[#1E1E24] px-1 py-0.5 rounded font-mono">brushed titanium</code>, or <code className="text-xs text-white bg-[#1E1E24] px-1 py-0.5 rounded font-mono">double-stitched leather</code> to generate automatically mapped diffuse, roughness, and metalness channels.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

