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
  const favoritesCount = history.filter(h => h.favorite || h.isFavorite).length || 0;
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
        const title = item.name || item.prompt || `Asset-${idx + 1}`;
        logs.push({
          id: `history-${idx}`,
          time: `04:${50 - idx * 4}:22`,
          msg: `Loaded project "${title}" (${item.format || 'GLB'}) into compute cache`,
          type: 'success'
        });
      });
    } else {
      logs.push({ id: 'empty', time: '04:55:20', msg: 'System initialized — ready for 3D generation', type: 'info' });
    }
    return logs;
  }, [history]);

  // Filter history based on local search & format filter
  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      const text = `${item.name || ''} ${item.prompt || ''}`.toLowerCase();
      const matchesSearch = text.includes(localSearch.toLowerCase());
      const matchesFormat = selectedFormat === 'all' || (item.format && item.format.toLowerCase() === selectedFormat.toLowerCase());
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
    <div className="flex-1 min-h-0 flex flex-col gap-6 text-foreground max-w-7xl mx-auto w-full pb-10" id="workspace-dashboard-panel">
      
      {/* 1. Header & Hero Action Section (Tripo AI Style) */}
      <div className="flex flex-col gap-4" id="dashboard-header-block">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>Studio Workspace</span>
              <span className="text-[10px] font-bold tracking-widest bg-tripo-yellow-1/10 text-tripo-yellow-1 px-2 py-0.5 rounded-full border border-tripo-yellow-1/20">
                v2.5 AI
              </span>
            </h1>
            <p className="text-xs text-tripo-gray-300 mt-1">
              Create, inspect, remesh, and texture state-of-the-art 3D models with neural generation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('3D Gen')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-tripo-yellow-1 hover:bg-yellow-400 text-black font-bold text-xs shadow-lg shadow-amber-500/10 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              id="dashboard-new-session-btn"
            >
              <Sparkles size={15} className="fill-black" />
              <span>Generate New 3D</span>
            </button>
          </div>
        </div>

        {/* Quick Generation Cards (Tripo AI Studio Feature Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {[
            { title: 'Text to 3D', desc: 'Generate high-res 3D meshes from text prompts', tab: '3D Gen', icon: Sparkles, tag: 'Popular' },
            { title: 'Image to 3D', desc: 'Turn single/multi photos into 3D models', tab: '3D Gen', icon: Box, tag: 'Fast' },
            { title: 'Smart Remesh', desc: 'Quad/Triangle retopology with LOD control', tab: 'Remesh', icon: RefreshCw, tag: 'Toolkit' },
            { title: 'Auto Rig & Animate', desc: 'Biped skeletal rig & animation retargeting', tab: 'Rigging & Animation', icon: Activity, tag: 'Rig' },
          ].map((card, i) => {
            const Icon = card.icon;
            return (
              <div
                key={i}
                onClick={() => onNavigate(card.tab)}
                className="group p-3.5 rounded-2xl bg-tripo-gray-2/80 hover:bg-tripo-gray-3 border border-tripo-white-5 hover:border-tripo-yellow-1/30 cursor-pointer transition-all duration-200 flex flex-col justify-between relative overflow-hidden"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="w-8 h-8 rounded-xl bg-tripo-yellow-1/10 text-tripo-yellow-1 flex items-center justify-center border border-tripo-yellow-1/20 group-hover:scale-110 transition-transform">
                    <Icon size={16} />
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-tripo-white-5 text-tripo-gray-300 font-mono">
                    {card.tag}
                  </span>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white group-hover:text-tripo-yellow-1 transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-[11px] text-tripo-gray-300 mt-0.5 line-clamp-2 leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Interactive Bento Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" id="dashboard-bento-metrics">
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
              className="p-4 rounded-2xl bg-tripo-gray-2/80 border border-tripo-white-5 transition-all hover:border-tripo-white-10"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-tripo-gray-300">{stat.label}</span>
                <div className="p-1.5 rounded-lg bg-tripo-gray-3 border border-tripo-white-5 text-tripo-gray-300">
                  <Icon size={14} />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold tracking-tight tabular-nums text-white">{stat.value}</span>
                <span className="text-[10px] text-tripo-gray-400 mt-0.5 font-mono uppercase tracking-wider">{stat.sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Main Workspace Layout Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5" id="dashboard-main-grid">
        
        {/* Left Column (2/3 Width) - Recent Workspace Drafts & Active Filters */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-tripo-gray-2/80 border border-tripo-white-5 p-3.5 rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 bg-tripo-yellow-1 rounded-full" />
              <h2 className="text-sm font-bold text-white">Recent Models &amp; Projects</h2>
              <span className="text-[10px] font-mono font-bold bg-tripo-gray-3 border border-tripo-white-5 text-tripo-gray-300 px-2 py-0.5 rounded-full">
                {filteredHistory.length}
              </span>
            </div>

            {/* Live Filter Controls */}
            <div className="flex flex-wrap items-center gap-2" id="workspace-filter-badges">
              {/* Local Search Input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-tripo-gray-400" />
                <input 
                  type="text" 
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  placeholder="Search assets..." 
                  className="bg-tripo-gray-3 border border-tripo-white-5 rounded-xl h-8 pl-8 pr-3 text-xs text-white placeholder-tripo-gray-400 focus:outline-none focus:border-tripo-yellow-1/50 w-36 sm:w-48 transition-colors"
                />
              </div>

              {/* Format Selectors */}
              {['all', 'GLB', 'OBJ', 'FBX'].map((format) => (
                <button
                  key={format}
                  onClick={() => setSelectedFormat(format.toLowerCase())}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                    selectedFormat === format.toLowerCase()
                      ? 'bg-tripo-yellow-1/15 text-tripo-yellow-1 border-tripo-yellow-1/30 font-bold'
                      : 'bg-transparent text-tripo-gray-300 hover:text-white border-transparent'
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>

          {/* Drafts Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredHistory.map((item) => {
              const title = item.name || item.prompt || 'Untitled 3D Asset';
              const prompt = item.prompt || item.name || 'AI generated neural 3D model';
              const date = item.date || item.timestamp || 'Recently created';
              const isFav = Boolean(item.favorite || item.isFavorite);

              return (
                <div
                  key={item.id}
                  onClick={() => onLoadProject(item)}
                  className="group rounded-2xl p-3.5 bg-tripo-gray-2/80 hover:bg-tripo-gray-3 border border-tripo-white-5 hover:border-tripo-white-15 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 flex flex-col justify-between shadow-sm"
                  id={`draft-card-${item.id}`}
                >
                  <div>
                    {/* Grid Preview Simulation Container */}
                    <div className="aspect-[16/10] rounded-xl bg-tripo-gray-3/80 border border-tripo-white-5 mb-3 overflow-hidden relative group-hover:border-tripo-yellow-1/30 transition-all flex items-center justify-center">
                      {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt={title} className="w-full h-full object-cover" />
                      ) : (
                        <>
                          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:12px_12px]" />
                          <div className="w-12 h-12 rounded-xl bg-tripo-gray-4 border border-tripo-white-5 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                            <Box size={24} className="text-tripo-yellow-1/70" />
                          </div>
                        </>
                      )}
                      
                      <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-white/10 text-[9px] font-mono font-bold uppercase text-tripo-gray-200">
                          {item.format || 'GLB'}
                        </span>
                      </div>
                      
                      {isFav && (
                        <div className="absolute top-2 right-2 p-1 rounded-md bg-black/60 backdrop-blur-sm">
                          <Heart size={12} className="fill-rose-500 text-rose-500" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <h4 className="text-xs font-bold text-white group-hover:text-tripo-yellow-1 transition-colors truncate">
                        {title}
                      </h4>
                      <p className="text-[11px] text-tripo-gray-300 truncate leading-tight">
                        {prompt}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-tripo-white-5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-tripo-gray-400">
                      <Clock size={11} />
                      <span>{date}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-tripo-yellow-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Open Studio</span>
                      <ArrowRight size={11} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Empty State */}
            {filteredHistory.length === 0 && (
              <div className="col-span-full py-14 bg-tripo-gray-2/60 border border-dashed border-tripo-white-10 rounded-2xl flex flex-col items-center justify-center text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-tripo-gray-3 flex items-center justify-center mb-3 border border-tripo-white-5 text-tripo-yellow-1">
                  <Box size={24} />
                </div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-white">No 3D Models Found</h2>
                <p className="text-xs text-tripo-gray-300 mt-1 max-w-[260px]">
                  {localSearch ? "Try clearing your search or format filters." : "Generate your first 3D asset using text prompts or reference images."}
                </p>
                {!localSearch && (
                  <button 
                    onClick={() => onNavigate('3D Gen')} 
                    className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-tripo-yellow-1 hover:bg-yellow-400 text-black font-bold text-xs transition-all shadow-md"
                  >
                    <Sparkles size={14} className="fill-black" />
                    <span>Create First 3D Model</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (1/3 Width) - Diagnostics & Interactive Knowledge Hub */}
        <div className="flex flex-col gap-4">
          
          {/* Diagnostic Console Box */}
          <div className="bg-tripo-gray-2/80 border border-tripo-white-5 rounded-2xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-tripo-white-5">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-tripo-yellow-1" />
                <h2 className="text-xs font-bold text-white">Hardware Compute Load</h2>
              </div>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
                  <div className="flex justify-between items-center text-[11px] font-medium">
                    <span className="text-tripo-gray-300">{node.name}</span>
                    <span className="font-mono text-tripo-yellow-1 font-bold">{node.load}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-tripo-gray-3 rounded-full overflow-hidden border border-tripo-white-5">
                    <div
                      className="h-full bg-gradient-to-r from-tripo-yellow-1 to-amber-500 transition-all duration-1000 ease-out rounded-full"
                      style={{ width: `${node.load}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Live Log Stream */}
          <div className="bg-tripo-gray-2/80 border border-tripo-white-5 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-tripo-white-5 pb-2 justify-between">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-tripo-gray-300" />
                <span className="text-xs font-bold text-white">Compute Pipeline Stream</span>
              </div>
              <span className="text-[10px] font-mono text-tripo-gray-400">Ready</span>
            </div>

            <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin" id="log-terminal-output">
              {simulatedLogs.map((log) => (
                <div key={log.id} className="flex gap-2 text-[10px] font-mono leading-normal">
                  <span className="text-tripo-gray-400 select-none shrink-0">{log.time}</span>
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
          <div className="bg-tripo-gray-2/80 border border-tripo-white-5 rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-tripo-yellow-1">
                <Code size={13} />
                <span>3D Prompt Engineering</span>
              </div>
              <div className="flex gap-1">
                {tips.map((_, i) => (
                  <button 
                    key={i} 
                    onClick={() => setActiveTipIndex(i)}
                    className={"h-1.5 rounded-full transition-all cursor-pointer " + (activeTipIndex === i ? "bg-tripo-yellow-1 w-4" : "bg-tripo-gray-4 w-1.5")}
                    title={`View tip ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <h4 className="text-xs font-bold text-white">
                {tips[activeTipIndex].title}
              </h4>
              <p className="text-[11px] text-tripo-gray-300 leading-relaxed">
                {tips[activeTipIndex].content}
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
