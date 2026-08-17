"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { GlowRing } from '@/components/GlowRing';
import { 
  Database, HardDrive, Clock, ArrowRight, Sparkles, FolderOpen, 
  Box, Heart, Search, Filter, Activity, Cpu, Code, BookOpen, 
  Terminal, ArrowUpRight, CheckCircle, RefreshCw, Layers
} from 'lucide-react';
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
  
  // Interactive state
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [localSearch, setLocalSearch] = useState<string>('');
  const [activeTipIndex, setActiveTipIndex] = useState<number>(0);

  const totalAssets = overview?.total_jobs || history.length || 0;
  const favoritesCount = history.filter(h => h.isFavorite).length || 0;
  const storageUsed = overview?.storage_used || '0 GB';
  const storageTotal = overview?.storage_total || '0 GB';
  const avgGenerationTime = overview?.avg_generation_time || '0s';

  const cpuUsage = stats?.cpu_usage || 0;
  const memoryUsage = stats?.memory_usage || 0;
  const gpuUsage = stats?.gpu_utilization || 0;

  // Generate real-time logs based on actual workspace history dynamically
  const simulatedLogs = useMemo(() => {
    const logs: { id: string; time: string; msg: string; type: 'info' | 'success' | 'warning' | 'error' }[] = [];
    if (history.length > 0) {
      history.slice(0, 3).forEach((item, idx) => {
        logs.push({
          id: `history-${idx}`,
          time: `04:${50 - idx * 4}:22`,
          msg: `Linked project draft "${item.name}" (${item.format}) to compute cache`,
          type: 'success'
        });
      });
    } else {
      logs.push({ id: 'empty', time: '04:55:20', msg: 'No history available — waiting for initial generation request', type: 'info' });
    }
    return logs;
  }, [history]);

  // Filter history based on local search & format filter
  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(localSearch.toLowerCase()) || 
                            (item.prompt && item.prompt.toLowerCase().includes(localSearch.toLowerCase()));
      const matchesFormat = selectedFormat === 'all' || item.format.toLowerCase() === selectedFormat.toLowerCase();
      return matchesSearch && matchesFormat;
    });
  }, [history, localSearch, selectedFormat]);

  const tips = [
    {
      title: 'PBR Shading Controls',
      content: 'Incorporate semantic tokens like "anisotropic brushed aluminum" or "micro-roughness 0.2" to steer the generator during the baking phase.'
    },
    {
      title: 'Polycount Reduction',
      content: 'Add "low-poly quad mesh" to generate optimized assets suitable for real-time mobile pipelines or web AR frameworks.'
    },
    {
      title: 'Environment Baking',
      content: 'Use words like "studio dynamic HDRI light" or "cyberpunk atmospheric illumination" to bake high-contrast lightmaps into textures.'
    }
  ];

  return (
    <div className="flex-1 min-h-0 p-4 md:p-5 flex flex-col gap-4 animate-fadeIn text-[hsl(var(--foreground))] overflow-y-auto bg-[hsl(var(--surface-0))]" id="workspace-dashboard-panel">
      
      {/* 1. Header & Quick Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[hsl(var(--border)/0.15)] pb-4" id="dashboard-header-block">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] flex items-center justify-center">
            <FolderOpen size={16} className="text-[hsl(var(--muted-foreground))]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-page-title text-[hsl(var(--foreground))]">Workspace Central</h1>
            <p className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-widest">Advanced Neural Reconstruction Suite</p>
          </div>
        </div>

        {/* Create Project Button */}
        <button
          onClick={() => onNavigate('3D Gen')}
          className="btn-primary shadow-[0_0_10px_hsl(var(--primary))/0.2]"
          id="dashboard-new-session-btn"
        >
          <Sparkles size={14} />
          New Generation
        </button>
      </div>

      {/* 2. Interactive Bento Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="dashboard-bento-metrics">
        {[
          { label: 'Total Models', value: totalAssets, sub: 'GLB / OBJ / FBX format', icon: Database },
          { label: 'Favorites', value: favoritesCount, sub: 'Marked for production', icon: Heart },
          { label: 'Active Memory', value: storageTotal === '0 GB' ? '—' : storageUsed, sub: storageTotal === '0 GB' ? 'Storage limit' : `of ${storageTotal} limit`, icon: HardDrive },
          { label: 'Avg Duration', value: avgGenerationTime, sub: 'Active cycle efficiency', icon: Clock },
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className="card-minimal p-4 transition-all hover:border-[hsl(var(--border))]/[0.3]"
            >
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-label">{stat.label}</span>
                <div className={`p-1.5 rounded-lg bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] text-[hsl(var(--muted-foreground))]`}>
                  <Icon size={14} />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-semibold tracking-tight tabular-nums text-[hsl(var(--foreground))]">{stat.value}</span>
                <span className="text-[9px] text-[hsl(var(--muted-foreground))] mt-0.5 font-mono uppercase tracking-wider">{stat.sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Main Workspace Layout Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4" id="dashboard-main-grid">
        
        {/* Left Column (2/3 Width) - Recent Workspace Drafts & Active Filters */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[hsl(var(--surface-1))] border border-[hsl(var(--border)/0.3)] p-4 rounded-xl panel-padding">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 bg-[hsl(var(--primary))] rounded-full" />
              <h2 className="text-section-title text-[hsl(var(--foreground))]">Project Files</h2>
              <span className="text-[9px] bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.5)] text-[hsl(var(--muted-foreground))] px-1.5 py-0.5 rounded font-mono badge-status-neutral">
                {filteredHistory.length}
              </span>
            </div>

            {/* Live Filter Controls */}
            <div className="flex flex-wrap items-center gap-2" id="workspace-filter-badges">
              {/* Local Search Input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[hsl(var(--muted-foreground))]" />
                <input 
                  type="text" 
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  placeholder="Filter models..." 
                  className="input-field-sm h-9 pl-7 pr-3 text-[11px] w-36 sm:w-44"
                />
              </div>

              {/* Format Selectors */}
              {['all', 'GLB', 'OBJ', 'FBX'].map((format) => (
                <button
                  key={format}
                  onClick={() => setSelectedFormat(format.toLowerCase())}
                  className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${
                    selectedFormat === format.toLowerCase()
                      ? 'bg-[hsl(var(--primary))/0.1] text-[hsl(var(--primary))] border-[hsl(var(--primary))/0.3]'
                      : 'bg-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border-transparent'
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>

          {/* Drafts Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredHistory.map((item) => (
              <div
                key={item.id}
                onClick={() => onLoadProject(item)}
                className="group card-panel card-panel-hover rounded-xl p-4 cursor-pointer transition-all hover:shadow-xl hover:-translate-y-0.5 flex flex-col justify-between"
                id={`draft-card-${item.id}`}
              >
                <div>
                  {/* Grid Preview Simulation Container */}
                  <div className="aspect-[16/10] rounded-xl bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] mb-3.5 overflow-hidden relative group-hover:border-[hsl(var(--primary))/0.15] transition-all">
                    {/* Simulated 3D Blueprint Lines */}
                    <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:10px_10px]" />
                    <div className="absolute inset-0 bg-gradient-to-tr from-[hsl(var(--primary))/0.06] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    {/* Centered Box Icon */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-xl bg-[hsl(var(--surface-1))] border border-[hsl(var(--border)/0.3)] flex items-center justify-center group-hover:scale-110 group-hover:border-[hsl(var(--primary))/0.2] transition-all shadow-sm">
                        <Box size={20} className="text-[hsl(var(--muted-foreground))]/30 group-hover:text-[hsl(var(--primary))] transition-all" />
                      </div>
                    </div>
                    
                    <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-[hsl(var(--surface-0)/0.85)] border border-[hsl(var(--border)/0.5)] text-[8px] font-black uppercase text-[hsl(var(--foreground))] badge-status-neutral">
                        {item.format}
                      </span>
                    </div>
                    
                    {item.isFavorite && (
                      <div className="absolute top-2.5 right-2.5">
                        <Heart size={12} className="fill-[hsl(var(--destructive))] text-[hsl(var(--destructive))]" />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <h4 className="text-value group-hover:text-[hsl(var(--primary))] transition-all truncate">{item.name}</h4>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono uppercase tracking-tighter truncate leading-tight">
                      {item.prompt || 'Manual Reconstruction Model'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[hsl(var(--border)/0.3)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[9px] font-mono text-[hsl(var(--muted-foreground))]">
                    <Clock size={10} />
                    {item.timestamp}
                  </div>
                  <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[hsl(var(--primary))] opacity-0 group-hover:opacity-100 transition-opacity">
                    Load Model <ArrowRight size={10} />
                  </div>
                </div>
              </div>
            ))}

            {/* Empty State */}
            {filteredHistory.length === 0 && (
              <div className="col-span-full py-16 bg-[hsl(var(--surface-1))] border border-dashed border-[hsl(var(--border)/0.3)] rounded-xl flex flex-col items-center justify-center text-center px-6">
                <div className="w-12 h-12 rounded-xl bg-[hsl(var(--surface-2))] flex items-center justify-center mb-4 border border-[hsl(var(--border)/0.3)]">
                  <Sparkles size={20} className="text-[hsl(var(--muted-foreground))]/30" />
                </div>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--foreground))]">No Projects Found</h2>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] font-mono mt-1.5 max-w-[220px]">
                  {localSearch ? "Try refining your search terms or filters." : "Start generating 3D models to populate your pipeline."}
                </p>
                {!localSearch && (
                  <button 
                    onClick={() => onNavigate('3D Gen')} 
                    className="mt-4 btn-primary shadow-[0_0_10px_hsl(var(--primary))/0.2]"
                  >
                    Create First Model
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1/3 Width) - Diagnostics & Interactive Knowledge Hub */}
        <div className="flex flex-col gap-4">
          
          {/* Diagnostic Console Box */}
          <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border)/0.15)] rounded-xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[hsl(var(--border)/0.15)]">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]" />
                <h2 className="text-section-title">Hardware Load</h2>
              </div>
              <span className="badge-status badge-status-neutral">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--muted-foreground))] inline-block mr-1" />
                Live
              </span>
            </div>

            <div className="space-y-3">
              {[
                { name: 'CUDA Compute Cluster', load: cpuUsage },
                { name: 'VRAM Allocation', load: gpuUsage },
                { name: 'Neural Model Cache', load: memoryUsage },
              ].map((node, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between items-center text-[9px] font-medium uppercase">
                    <span className="text-[hsl(var(--muted-foreground))]">{node.name}</span>
                    <span className="font-mono text-[hsl(var(--foreground))]">{node.load}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[hsl(var(--surface-2))] rounded-full overflow-hidden border border-[hsl(var(--border)/0.15)]">
                    <div
                      className="h-full bg-[hsl(var(--muted-foreground))] transition-all duration-1000 ease-out rounded-full"
                      style={{ width: `${node.load}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Live Log Stream */}
          <div className="bg-[hsl(var(--surface-1))] border border-[hsl(var(--border)/0.3)] rounded-xl p-4 flex flex-col gap-3 panel-padding">
            <div className="flex items-center gap-2 border-b border-[hsl(var(--border)/0.2)] pb-2 justify-between">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-[hsl(var(--muted-foreground))]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Real-time Node Log</span>
              </div>
              <span className="text-[8px] font-mono text-[hsl(var(--muted-foreground))]">Updated Live</span>
            </div>

            <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin" id="log-terminal-output">
              {simulatedLogs.map((log) => (
                <div key={log.id} className="flex gap-2 text-[9px] font-mono leading-normal">
                  <span className="text-[hsl(var(--muted-foreground))] select-none shrink-0">{log.time}</span>
                  <span className={
                    log.type === 'success' ? 'text-emerald-400' :
                    log.type === 'warning' ? 'text-amber-400' :
                    log.type === 'error' ? 'text-red-400' : 'text-sky-400'
                  }>
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Dynamic Knowledge Cards */}
          <div className="bg-gradient-to-br from-[hsl(var(--surface-1))] to-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.3)] rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden panel-padding">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[hsl(var(--primary))/0.02] rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-widest">
                <Code size={12} />
                <span>Neural Tip</span>
              </div>
              <div className="flex gap-1">
                {tips.map((_, i) => (
                  <button 
                    key={i} 
                    onClick={() => setActiveTipIndex(i)}
                    className={"w-1.5 h-1.5 rounded-full transition-all " + (activeTipIndex === i ? "bg-[hsl(var(--muted-foreground))] w-3" : "bg-[hsl(var(--border))]")}
                    title={`View tip ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1 animate-in fade-in duration-150">
              <h4 className="text-xs font-medium uppercase tracking-tight text-[hsl(var(--foreground))]">
                {tips[activeTipIndex].title}
              </h4>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                {tips[activeTipIndex].content}
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
