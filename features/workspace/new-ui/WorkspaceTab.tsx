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
  Terminal, ArrowUpRight, CheckCircle, RefreshCw, Layers, Zap
} from 'lucide-react';
import { HistoryItem } from '@/types/new-ui';
import { useSystemOverview, useSystemStatistics } from '@/hooks/useBackendData';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
    const logs: { id: string; time: string; msg: string; type: 'info' | 'success' | 'warning' }[] = [
      { id: '1', time: '04:55:12', msg: 'Neural engine initialized with active CUDA environment', type: 'info' },
      { id: '2', time: '04:55:14', msg: 'Synchronized workspace state with durable cloud persistence', type: 'success' },
    ];
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
      logs.push({ id: 'empty', time: '04:55:20', msg: 'Vault empty; waiting for initial 3D neural generation request', type: 'warning' });
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
    <div className="flex-1 min-h-0 p-8 md:p-12 flex flex-col gap-10 animate-fadeIn text-white overflow-y-auto bg-black scrollbar-thin" id="workspace-dashboard-panel">
      
      {/* 1. Header & Quick Filter Bar */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5 pb-10" 
        id="dashboard-header-block"
      >
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
            <FolderOpen size={22} className="text-amber-500" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-black uppercase tracking-tight text-white">Workspace Central</h1>
            <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.3em]">Advanced Neural Reconstruction Suite</p>
          </div>
        </div>

        {/* Create Project Button */}
        <Button
          onClick={() => onNavigate('3D Gen')}
          variant="premium"
          className="h-12 px-8 rounded-2xl text-[10px]"
          id="dashboard-new-session-btn"
        >
          <Sparkles size={16} />
          Initialize New Synthesis
        </Button>
      </motion.div>

      {/* 2. Interactive Bento Analytics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="dashboard-bento-metrics">
        {[
          { label: 'Neural Assets', value: totalAssets, sub: 'GLB / OBJ / FBX format', icon: Database, color: 'text-amber-500', glow: 'shadow-[0_0_30px_rgba(245,158,11,0.1)]' },
          { label: 'Curated Vault', value: favoritesCount, sub: 'Marked for production', icon: Heart, color: 'text-rose-500', glow: 'shadow-[0_0_30px_rgba(244,63,94,0.1)]' },
          { label: 'Memory Status', value: storageUsed, sub: `of ${storageTotal} quota`, icon: HardDrive, color: 'text-sky-500', glow: 'shadow-[0_0_30px_rgba(14,165,233,0.1)]' },
          { label: 'Compute Efficiency', value: avgGenerationTime, sub: 'Active cycle efficiency', icon: Activity, color: 'text-emerald-500', glow: 'shadow-[0_0_30px_rgba(16,185,129,0.1)]' },
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={cn(
                "relative overflow-hidden rounded-3xl bg-white/[0.02] border border-white/5 p-8 transition-all duration-500 hover:border-white/10 hover:bg-white/[0.04] hover:-translate-y-1 group",
                stat.glow
              )}
            >
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">{stat.label}</span>
                <div className={cn("p-2.5 rounded-xl bg-white/[0.03] border border-white/5 transition-all duration-500 group-hover:scale-110", stat.color)}>
                  <Icon size={18} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-4xl font-black tracking-tight tabular-nums text-white">{stat.value}</span>
                <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.25em] opacity-60">{stat.sub}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* 3. Main Workspace Layout Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8" id="dashboard-main-grid">
        
        {/* Left Column (2/3 Width) - Recent Workspace Drafts & Active Filters */}
        <div className="xl:col-span-2 flex flex-col gap-8">
          
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white/[0.02] border border-white/5 p-6 rounded-3xl">
            <div className="flex items-center gap-4">
              <div className="w-1.5 h-6 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/80">Project Manifest</h3>
                <span className="text-[10px] bg-white/5 border border-white/10 text-white/40 px-2.5 py-1 rounded-xl font-black">
                  {filteredHistory.length}
                </span>
              </div>
            </div>

            {/* Live Filter Controls */}
            <div className="flex flex-wrap items-center gap-3" id="workspace-filter-badges">
              {/* Local Search Input */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20 group-focus-within:text-amber-500 transition-colors" />
                <input 
                  type="text" 
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  placeholder="Filter manifests..." 
                  className="bg-black/40 border border-white/5 rounded-2xl pl-10 pr-4 py-2 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:border-amber-500/30 w-44 sm:w-60 text-white placeholder:text-white/10 transition-all"
                />
              </div>

              {/* Format Selectors */}
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/5">
                {['all', 'GLB', 'OBJ', 'FBX'].map((format) => (
                  <button
                    key={format}
                    onClick={() => setSelectedFormat(format.toLowerCase())}
                    className={cn(
                      "px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                      selectedFormat === format.toLowerCase()
                        ? 'bg-amber-500 text-black shadow-lg'
                        : 'text-white/30 hover:text-white hover:bg-white/5'
                    )}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Drafts Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {filteredHistory.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => onLoadProject(item)}
                className="group relative bg-white/[0.01] border border-white/5 hover:border-amber-500/30 rounded-3xl p-6 cursor-pointer transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:-translate-y-1.5 flex flex-col justify-between overflow-hidden"
                id={`draft-card-${item.id}`}
              >
                <div>
                  {/* Grid Preview Simulation Container */}
                  <div className="aspect-[16/10] rounded-2xl bg-black border border-white/5 mb-6 overflow-hidden relative group-hover:border-amber-500/20 transition-all duration-700 shadow-inner">
                    {/* Simulated 3D Blueprint Lines */}
                    <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:16px_16px]" />
                    <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    
                    {/* Centered Box Icon */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-2xl bg-white/[0.02] backdrop-blur-md border border-white/[0.05] flex items-center justify-center group-hover:scale-110 group-hover:rotate-12 group-hover:border-amber-500/20 transition-all duration-700 shadow-2xl">
                        <Box size={28} className="text-white/10 group-hover:text-amber-500 transition-all duration-700" />
                      </div>
                    </div>
                    
                    <div className="absolute bottom-4 left-4 flex items-center gap-2">
                      <span className="px-3 py-1 rounded-xl bg-black/80 backdrop-blur-xl border border-white/10 text-[9px] font-black uppercase tracking-[0.2em] text-white/60">
                        {item.format}
                      </span>
                    </div>
                    
                    {item.isFavorite && (
                      <div className="absolute top-4 right-4">
                        <div className="w-8 h-8 rounded-full bg-rose-500/10 backdrop-blur-xl border border-rose-500/20 flex items-center justify-center shadow-lg">
                          <Heart size={14} className="fill-rose-500 text-rose-500" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 px-1">
                    <h4 className="text-sm font-black uppercase tracking-tight text-white group-hover:text-amber-500 transition-colors duration-500">{item.name}</h4>
                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest truncate leading-relaxed">
                      {item.prompt || 'Heuristic Reconstruction'}
                    </p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between px-1">
                  <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.15em] text-white/20">
                    <Clock size={14} className="text-white/10" />
                    {item.timestamp}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-amber-500 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-500">
                    Synchronize <ArrowRight size={14} />
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Empty State */}
            {filteredHistory.length === 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full py-24 bg-white/[0.01] border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center text-center px-8"
              >
                <div className="w-16 h-16 rounded-3xl bg-white/[0.02] flex items-center justify-center mb-6 border border-white/5">
                  <Sparkles size={24} className="text-white/10" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white/60">No Data Synchronized</h3>
                <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.2em] mt-3 max-w-sm leading-relaxed">
                  {localSearch ? "Refine filters to match existing neural manifests." : "Initialize the generation pipeline to populate your active workspace."}
                </p>
                {!localSearch && (
                  <Button 
                    onClick={() => onNavigate('3D Gen')} 
                    variant="premium"
                    className="mt-8 h-10 px-6 rounded-2xl"
                  >
                    Invoke System
                  </Button>
                )}
              </motion.div>
            )}
          </div>
        </div>

        {/* Right Column (1/3 Width) - Diagnostics & Interactive Knowledge Hub */}
        <div className="flex flex-col gap-8">
          
          {/* Diagnostic Console Box */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 flex flex-col gap-8 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-6 border-b border-white/5">
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4 text-amber-500" />
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Hardware Telemetry</h4>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Nominal</span>
              </div>
            </div>

            <div className="space-y-6">
              {[
                { name: 'CUDA Compute Cluster', load: cpuUsage || 24, color: 'from-amber-500 to-amber-600', icon: Cpu },
                { name: 'VRAM Allocation', load: gpuUsage || 68, color: 'from-sky-500 to-sky-600', icon: Zap },
                { name: 'Neural Model Cache', load: memoryUsage || 41, color: 'from-rose-500 to-rose-600', icon: Database },
              ].map((node, i) => (
                <div key={i} className="space-y-3 group">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                    <div className="flex items-center gap-2 text-white/30 group-hover:text-white/60 transition-colors">
                      <node.icon size={12} />
                      <span>{node.name}</span>
                    </div>
                    <span className="font-mono text-white/80">{node.load}%</span>
                  </div>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${node.load}%` }}
                      className={cn("h-full bg-gradient-to-r rounded-full transition-all duration-1000 ease-out shadow-lg", node.color)} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Interactive Live Log Stream */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 flex flex-col gap-6 shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-white/5 pb-6 justify-between">
              <div className="flex items-center gap-3">
                <Terminal size={16} className="text-white/20" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Neural Log Stream</span>
              </div>
              <span className="text-[8px] font-black text-white/10 uppercase tracking-widest">Active Thread</span>
            </div>

            <div className="space-y-4 max-h-[180px] overflow-y-auto pr-2 scrollbar-thin" id="log-terminal-output">
              {simulatedLogs.map((log) => (
                <div key={log.id} className="flex gap-4 text-[9px] font-black leading-normal group">
                  <span className="text-white/10 select-none shrink-0 group-hover:text-white/30 transition-colors font-mono">{log.time}</span>
                  <span className={cn(
                    "uppercase tracking-wider",
                    log.type === 'success' ? 'text-emerald-500/80' :
                    log.type === 'warning' ? 'text-amber-500/80' : 'text-white/30'
                  )}>
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Dynamic Knowledge Cards */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-amber-500/10 via-black to-black border border-amber-500/10 rounded-3xl p-8 flex flex-col gap-6 relative overflow-hidden group shadow-2xl"
          >
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-amber-500/10 transition-colors duration-700" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] font-black text-amber-500 uppercase tracking-[0.3em]">
                <Code size={14} />
                <span>Protocol Tip</span>
              </div>
              <div className="flex gap-2">
                {tips.map((_, i) => (
                  <button 
                    key={i} 
                    onClick={() => setActiveTipIndex(i)}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-all duration-500",
                      activeTipIndex === i ? 'bg-amber-500 w-6 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-white/10 hover:bg-white/30'
                    )}
                    title={`View tip ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div 
                key={activeTipIndex}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-3"
              >
                <h4 className="text-sm font-black uppercase tracking-tight text-white/90">
                  {tips[activeTipIndex].title}
                </h4>
                <p className="text-[10px] text-white/40 leading-relaxed font-bold uppercase tracking-wider">
                  {tips[activeTipIndex].content}
                </p>
              </motion.div>
            </AnimatePresence>
          </motion.div>

        </div>

      </div>

    </div>
  );
}
