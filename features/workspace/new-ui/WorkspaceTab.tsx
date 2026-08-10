"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Database, TrendingUp, HardDrive, Clock, Plus, ArrowRight, Sparkles, FolderOpen, Box, Heart } from 'lucide-react';
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
  
  const totalAssets = overview?.total_jobs || history.length || 0;
  const favoritesCount = history.filter(h => h.isFavorite).length || 0;
  const storageUsed = overview?.storage_used || '0 GB';
  const storageTotal = overview?.storage_total || '0 GB';
  const avgGenerationTime = overview?.avg_generation_time || '0s';

  const cpuUsage = stats?.cpu_usage || 0;
  const memoryUsage = stats?.memory_usage || 0;
  const gpuUsage = stats?.gpu_utilization || 0;

  return (
    <div className="flex-1 p-8 flex flex-col gap-10 animate-fadeIn text-[hsl(var(--foreground))] overflow-y-auto bg-[hsl(var(--surface-0))]" id="workspace-tab-panel">
      
      {/* Header Section */}
      <div className="flex flex-col gap-2" id="workspace-header-section">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[hsl(var(--primary))/0.1] flex items-center justify-center border border-[hsl(var(--primary))/0.2]">
            <FolderOpen size={20} className="text-[hsl(var(--primary))]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black uppercase tracking-tight">Project Dashboard</h1>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-widest">Workspace Management & Analytics</p>
          </div>
        </div>
      </div>

      {/* Hero Analytics Card */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[hsl(var(--surface-1))] to-[hsl(var(--surface-0))] border border-[hsl(var(--border))] p-10 shadow-2xl" id="workspace-hero-stats">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[hsl(var(--primary))/0.05] to-transparent pointer-events-none" />
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {[
            { label: 'Total Assets', value: totalAssets, sub: 'GLB / FBX / OBJ', icon: Database, color: 'text-[hsl(var(--primary))]' },
            { label: 'Favorites', value: favoritesCount, sub: 'Hand-picked assets', icon: Heart, color: 'text-[hsl(var(--destructive))]' },
            { label: 'Storage', value: storageUsed, sub: `of ${storageTotal} limit`, icon: HardDrive, color: 'text-[hsl(var(--neon-amber))]' },
            { label: 'Avg Time', value: avgGenerationTime, sub: 'Baking Efficiency', icon: Clock, color: 'text-[hsl(var(--neon-green))]' },
          ].map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div key={idx} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] ${stat.color}`}>
                    <Icon size={18} />
                  </div>
                  <span className="text-[10px] font-black text-[hsl(var(--muted-foreground))] uppercase tracking-widest">{stat.label}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-4xl font-black tabular-nums tracking-tighter">{stat.value}</span>
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tight">{stat.sub}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10" id="workspace-content-layout">
        
        {/* Left Column: Recent Projects */}
        <div className="xl:col-span-2 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-6 bg-[hsl(var(--primary))] rounded-full" />
              <h3 className="text-sm font-black uppercase tracking-widest">Recent Workspace Drafts</h3>
            </div>
            <button 
              onClick={() => onNavigate('My Assets')}
              className="px-4 py-1.5 rounded-full bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] text-[10px] font-black uppercase tracking-widest hover:bg-[hsl(var(--surface-2))] transition-all flex items-center gap-2"
            >
              Browse Library <ArrowRight size={12} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {history.slice(0, 4).map((item) => (
              <div
                key={item.id}
                onClick={() => onLoadProject(item)}
                className="group relative bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] hover:border-[hsl(var(--primary))/0.4] rounded-[1.5rem] p-5 cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1"
              >
                <div className="aspect-[16/10] rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))] mb-4 overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-tr from-[hsl(var(--primary))/0.1] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                      <Box size={24} className="text-[hsl(var(--muted-foreground))]/40 group-hover:text-[hsl(var(--primary))] transition-colors" />
                    </div>
                  </div>
                  <div className="absolute bottom-3 left-3 flex gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-[hsl(var(--surface-0)/0.8)] backdrop-blur-md border border-[hsl(var(--border))] text-[9px] font-black uppercase text-[hsl(var(--foreground))]">
                      {item.format}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-col gap-1">
                  <h4 className="text-sm font-black truncate group-hover:text-[hsl(var(--primary))] transition-colors">{item.name}</h4>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tighter truncate">{item.prompt || 'Manual Reconstruction'}</p>
                </div>
                
                <div className="mt-4 pt-4 border-t border-[hsl(var(--border))] flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[9px] font-mono text-[hsl(var(--muted-foreground))]">
                    <Clock size={10} />
                    {item.timestamp}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[hsl(var(--primary))] opacity-0 group-hover:opacity-100 transition-opacity">
                    Edit <ArrowRight size={12} />
                  </div>
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <div className="col-span-full py-20 bg-[hsl(var(--surface-1))] border border-dashed border-[hsl(var(--border))] rounded-[1.5rem] flex flex-col items-center justify-center text-center px-10">
                <div className="w-16 h-16 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center mb-6">
                  <Sparkles size={32} className="text-[hsl(var(--muted-foreground))]/20" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest">Your Vault is Empty</h3>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono mt-2 max-w-[240px]">The neural mesh generator is ready. Start your first session to populate your workspace.</p>
                <button onClick={() => onNavigate('3D Generation')} className="mt-6 px-6 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all">
                  Initialize Generator
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Engine & Resources */}
        <div className="flex flex-col gap-10">
          {/* Node Status Card */}
          <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border))] rounded-[1.5rem] p-8 flex flex-col gap-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Engine Nodes</h4>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[hsl(var(--neon-green))/0.1] border border-[hsl(var(--neon-green))/0.3]">
                <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-green))] animate-pulse" />
                <span className="text-[9px] font-black text-[hsl(var(--neon-green))] uppercase">Stable</span>
              </div>
            </div>
            
            <div className="flex flex-col gap-5">
              {[
                { name: 'Compute Cluster', load: cpuUsage, color: 'bg-[hsl(var(--primary))]' },
                { name: 'Neural Memory', load: memoryUsage, color: 'bg-[hsl(var(--neon-blue))]' },
                { name: 'GPU Synthesizer', load: gpuUsage, color: 'bg-[hsl(var(--neon-amber))]' },
              ].map((node, i) => (
                <div key={i} className="flex flex-col gap-2.5">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase">
                    <span className="text-[hsl(var(--muted-foreground))]">{node.name}</span>
                    <span className="font-mono">{node.load}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[hsl(var(--surface-2))] rounded-full overflow-hidden border border-[hsl(var(--border))]">
                    <div 
                      className={`h-full ${node.color} transition-all duration-1000 ease-out`} 
                      style={{ width: `${node.load}%` }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Start Guide */}
          <div className="bg-gradient-to-br from-[hsl(var(--surface-1))] to-[hsl(var(--surface-2))] border border-[hsl(var(--border))] rounded-[1.5rem] p-8 flex flex-col gap-4 shadow-sm relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-20 h-20 bg-[hsl(var(--primary))/0.05] rounded-full blur-2xl" />
            <span className="text-[10px] font-black text-[hsl(var(--primary))] uppercase tracking-[0.2em]">Neural Tips</span>
            <h4 className="text-sm font-black leading-tight uppercase tracking-tight">Optimizing PBR Material Workflows</h4>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">
              Use semantic tokens like <code className="text-[hsl(var(--foreground))] font-bold">"metallic"</code> or <code className="text-[hsl(var(--foreground))] font-bold">"anisotropic"</code> in your prompts to guide the generator towards more complex shading models during the baking phase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

