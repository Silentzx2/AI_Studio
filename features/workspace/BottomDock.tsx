"use client";


import { useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  MessageSquare, ListOrdered, Activity,
  Bell, Download, Clock, FolderOpen,
  ChevronDown, ChevronUp, X, CheckCircle2, AlertTriangle,
  FileDown, ImageIcon, Package, Wifi
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUIStore, type BottomDockTab } from '@/stores/useUIStore';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { Badge } from '@/components/premium/Badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/* ── Tab Config ─────────────────────────────────────── */
const DOCK_TABS: { id: BottomDockTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'recent', label: 'Recent Prompts', icon: MessageSquare },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'progress', label: 'Progress', icon: Activity },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'downloads', label: 'Downloads', icon: Download },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'assets', label: 'Assets', icon: FolderOpen },
];

/* ── Shared animation helpers ──────────────────────── */
const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
};

const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 6, filter: 'blur(4px)' },
  visible: {
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  },
};

/* ── Mock Data ──────────────────────────────────────── */

const recentPrompts = [
  { id: 1, text: 'A detailed medieval castle with towers and courtyard', time: '2 min ago', model: 'Trellis', status: 'completed' as const },
  { id: 2, text: 'Futuristic cyberpunk motorcycle with neon accents', time: '15 min ago', model: 'Hunyuan3D', status: 'completed' as const },
  { id: 3, text: 'Low-poly game character with sword and shield', time: '1 hour ago', model: 'TripoSR', status: 'completed' as const },
  { id: 4, text: 'Art nouveau vase with floral patterns', time: '2 hours ago', model: 'Trellis', status: 'failed' as const },
  { id: 5, text: 'Realistic human hand with detailed fingernails', time: '3 hours ago', model: 'InstantMesh', status: 'completed' as const },
  { id: 6, text: 'Stylized cartoon tree with autumn leaves', time: '5 hours ago', model: 'TripoSR', status: 'completed' as const },
];

const queueItems = [
  { id: 101, position: 1, prompt: 'Ancient Greek temple with columns', model: 'Trellis', wait: '~2 min' },
  { id: 102, position: 2, prompt: 'Steampunk airship with propellers', model: 'Hunyuan3D', wait: '~5 min' },
  { id: 103, position: 3, prompt: 'Cute robot companion with LED eyes', model: 'TripoSR', wait: '~8 min' },
];

const activeJobs = [
  { id: 201, prompt: 'Dragon sculpture with detailed scales', model: 'Trellis', progress: 67, stage: 'Generating geometry...' },
  { id: 202, prompt: 'Modern coffee table with metal legs', model: 'Hunyuan3D', progress: 23, stage: 'Processing image...' },
];

const notifications = [
  { id: 1, title: 'Generation Complete', message: 'Medieval castle is ready for download', time: '2 min ago', type: 'success' as const, read: false },
  { id: 2, title: 'Model Updated', message: 'Trellis v2.1 is now available', time: '1 hour ago', type: 'info' as const, read: false },
  { id: 3, title: 'GPU Warning', message: 'Temperature exceeded 80°C threshold', time: '2 hours ago', type: 'warning' as const, read: true },
  { id: 4, title: 'Download Ready', message: 'Cyberpunk motorcycle.glb (24MB)', time: '3 hours ago', type: 'info' as const, read: true },
];

const downloads = [
  { id: 1, name: 'medieval_castle.glb', size: '24.3 MB', status: 'complete' as const, time: '2 min ago' },
  { id: 2, name: 'cyberpunk_motorcycle.obj', size: '18.7 MB', status: 'complete' as const, time: '15 min ago' },
  { id: 3, name: 'game_character.fbx', size: '32.1 MB', status: 'complete' as const, time: '1 hour ago' },
];

const historyItems = [
  { id: 1, prompt: 'Medieval castle', model: 'Trellis', quality: 'High Poly', duration: '12.4s', date: 'Today 14:31', verts: '98,432', format: 'GLB' },
  { id: 2, prompt: 'Cyberpunk motorcycle', model: 'Hunyuan3D', quality: 'Standard', duration: '8.2s', date: 'Today 14:15', verts: '45,210', format: 'GLB' },
  { id: 3, prompt: 'Game character', model: 'TripoSR', quality: 'Low Poly', duration: '3.1s', date: 'Today 13:05', verts: '8,240', format: 'OBJ' },
  { id: 4, prompt: 'Human hand', model: 'InstantMesh', quality: 'High Poly', duration: '15.7s', date: 'Today 11:20', verts: '124,800', format: 'FBX' },
  { id: 5, prompt: 'Cartoon tree', model: 'TripoSR', quality: 'Low Poly', duration: '2.8s', date: 'Today 09:30', verts: '5,680', format: 'GLB' },
  { id: 6, prompt: 'Art nouveau vase', model: 'Trellis', quality: 'High Poly', duration: '14.1s', date: 'Yesterday 22:10', verts: '67,320', format: 'GLB' },
];

const assets = [
  { id: 1, name: 'medieval_castle.glb', type: '3D Model', size: '24.3 MB', thumbnail: '🏰' },
  { id: 2, name: 'texture_pack_pbr.zip', type: 'Texture Pack', size: '156 MB', thumbnail: '🎨' },
  { id: 3, name: 'cyberpunk_motorcycle.glb', type: '3D Model', size: '18.7 MB', thumbnail: '🏍️' },
  { id: 4, name: 'environment_hdri.exr', type: 'HDRI Map', size: '89 MB', thumbnail: '🌅' },
  { id: 5, name: 'material_library.json', type: 'Material', size: '2.4 MB', thumbnail: '✨' },
];

/* ── Tab Content Components ─────────────────────────── */

function RecentPromptsTab() {
  const { toast } = useToast();

  const handleClick = useCallback((text: string) => {
    toast({ title: 'Loaded prompt', description: text.length > 50 ? text.slice(0, 50) + '...' : text });
  }, [toast]);

  return (
    <motion.div className="space-y-0.5" variants={listVariants} initial="hidden" animate="visible">
      {recentPrompts.map((p) => (
        <motion.button
          key={p.id}
          variants={listItemVariants}
          onClick={() => handleClick(p.text)}
          className="group w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-xl text-xs hover:bg-[hsl(var(--surface-2)/0.35)] hover:shadow-[0_0_16px_hsl(var(--neon-purple)/0.04)] transition-all duration-200 border border-transparent hover:border-[hsl(var(--border)/0.2)]"
        >
          {/* Status dot */}
          <span className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            p.status === 'completed'
              ? 'bg-[hsl(var(--neon-green))] shadow-[0_0_6px_hsl(var(--neon-green)/0.5)]'
              : 'bg-[hsl(var(--destructive))] shadow-[0_0_6px_hsl(0_70%_50%/0.5)]'
          )} />
          {/* Text */}
          <span className="flex-1 text-muted-foreground/70 group-hover:text-foreground/90 truncate transition-colors">
            {p.text}
          </span>
          {/* Model chip */}
          <span className="chip shrink-0 text-[10px] px-1.5 py-px rounded-md bg-[hsl(var(--surface-2)/0.6)] text-muted-foreground/60 border border-[hsl(var(--border)/0.2)]">
            {p.model}
          </span>
          {/* Time */}
          <span className="text-[10px] text-muted-foreground/30 shrink-0 tabular-nums w-14 text-right">
            {p.time}
          </span>
        </motion.button>
      ))}
    </motion.div>
  );
}

function QueueTab() {
  const { toast } = useToast();

  const handleCancel = useCallback((id: number, prompt: string) => {
    toast({ title: 'Job cancelled', description: prompt.slice(0, 30) + '...' });
  }, [toast]);

  return (
    <motion.div className="space-y-1.5" variants={listVariants} initial="hidden" animate="visible">
      {queueItems.map((item) => (
        <motion.div
          key={item.id}
          variants={listItemVariants}
          className="card-premium flex items-center gap-3 px-3 py-2.5 rounded-xl"
        >
          {/* Position badge */}
          <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md bg-[hsl(var(--neon-purple)/0.15)] border border-[hsl(var(--neon-purple)/0.3)] text-[10px] font-bold text-[hsl(var(--neon-purple))] tabular-nums shadow-[0_0_8px_hsl(var(--neon-purple)/0.1)]">
            {item.position}
          </span>
          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground/80 truncate font-medium">{item.prompt}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="chip text-[10px] px-1.5 py-px rounded-md bg-[hsl(var(--surface-2)/0.6)] text-muted-foreground/50 border border-[hsl(var(--border)/0.15)]">
                {item.model}
              </span>
              <span className="text-[10px] text-muted-foreground/30 flex items-center gap-1">
                <Wifi className="w-2.5 h-2.5" />{item.wait}
              </span>
            </div>
          </div>
          {/* Cancel button */}
          <button
            onClick={() => handleCancel(item.id, item.prompt)}
            className="shrink-0 p-1 rounded-md text-muted-foreground/30 hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.1)] hover:shadow-[0_0_8px_hsl(0_70%_50%/0.1)] transition-all duration-200"
          >
            <X className="w-3 h-3" />
          </button>
        </motion.div>
      ))}
    </motion.div>
  );
}

function ProgressTab() {
  const { toast } = useToast();

  const handleCancel = useCallback((id: number, prompt: string) => {
    toast({ title: 'Generation cancelled', description: prompt.slice(0, 30) + '...' });
  }, [toast]);

  return (
    <motion.div className="space-y-3" variants={listVariants} initial="hidden" animate="visible">
      {activeJobs.map((job) => (
        <motion.div
          key={job.id}
          variants={listItemVariants}
          className="card-premium px-3 py-3 rounded-xl space-y-2.5"
        >
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="shrink-0 w-2 h-2 rounded-full bg-[hsl(var(--neon-purple))] shadow-[0_0_8px_hsl(var(--neon-purple)/0.6)] animate-[pulse-soft_2s_ease-in-out_infinite]" />
              <span className="text-xs text-foreground/80 truncate font-medium">{job.prompt}</span>
            </div>
            <button
              onClick={() => handleCancel(job.id, job.prompt)}
              className="shrink-0 p-1 rounded-md text-muted-foreground/30 hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.1)] transition-all duration-200 ml-2"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {/* Model + stage */}
          <div className="flex items-center gap-2">
            <Badge variant="neon" size="sm">{job.model}</Badge>
            <span className="text-[10px] text-muted-foreground/40 italic">{job.stage}</span>
          </div>
          {/* Progress bar */}
          <div className="animate-[pulse-glow_2s_ease-in-out_infinite]">
            <ProgressBar value={job.progress} color="purple" size="sm" showGlow />
          </div>
          {/* Percentage */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/30">Processing...</span>
            <span className="text-xs font-mono font-bold text-[hsl(var(--neon-purple))] tabular-nums drop-shadow-[0_0_6px_hsl(var(--neon-purple)/0.4)]">
              {job.progress}%
            </span>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

function NotificationsTab() {
  const notifIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-3.5 h-3.5" />;
      case 'warning': return <AlertTriangle className="w-3.5 h-3.5" />;
      default: return <Bell className="w-3.5 h-3.5" />;
    }
  };

  const notifColor = (type: string, read: boolean) => {
    if (read) return 'text-muted-foreground/40 bg-[hsl(var(--surface-2)/0.15)]';
    switch (type) {
      case 'success': return 'text-[hsl(var(--neon-green))] bg-[hsl(var(--neon-green)/0.06)]';
      case 'warning': return 'text-[hsl(var(--neon-amber))] bg-[hsl(var(--neon-amber)/0.06)]';
      default: return 'text-[hsl(var(--neon-blue))] bg-[hsl(var(--neon-blue)/0.06)]';
    }
  };

  return (
    <motion.div className="space-y-1" variants={listVariants} initial="hidden" animate="visible">
      {notifications.map((n) => (
        <motion.div
          key={n.id}
          variants={listItemVariants}
          className={cn(
            'flex items-start gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 border',
            n.read
              ? 'border-transparent hover:border-[hsl(var(--border)/0.15)] hover:bg-[hsl(var(--surface-2)/0.2)]'
              : 'border-[hsl(var(--border)/0.15)] bg-[hsl(var(--surface-2)/0.25)] hover:bg-[hsl(var(--surface-2)/0.35)]'
          )}
        >
          {/* Icon */}
          <div className={cn(
            'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5',
            notifColor(n.type, n.read)
          )}>
            {notifIcon(n.type)}
          </div>
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-xs font-medium truncate',
                n.read ? 'text-muted-foreground/60' : 'text-foreground/90'
              )}>{n.title}</span>
              {!n.read && (
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-blue))] shadow-[0_0_6px_hsl(var(--neon-blue)/0.5)]" />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/40 truncate mt-0.5">{n.message}</p>
            <span className="text-[10px] text-muted-foreground/25 mt-0.5 block">{n.time}</span>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

function DownloadsTab() {
  const { toast } = useToast();

  const handleDownload = useCallback((name: string) => {
    toast({ title: 'Download started', description: name });
  }, [toast]);

  return (
    <motion.div className="space-y-1.5" variants={listVariants} initial="hidden" animate="visible">
      {downloads.map((d) => (
        <motion.div
          key={d.id}
          variants={listItemVariants}
          className="card-premium flex items-center gap-3 px-3 py-2.5 rounded-xl"
        >
          {/* File icon */}
          <div className="shrink-0 w-8 h-8 rounded-lg bg-[hsl(var(--neon-green)/0.1)] border border-[hsl(var(--neon-green)/0.15)] flex items-center justify-center">
            <FileDown className="w-3.5 h-3.5 text-[hsl(var(--neon-green))]" />
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground/80 truncate font-medium">{d.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground/30 tabular-nums">{d.size}</span>
              <span className="text-[10px] text-muted-foreground/20">·</span>
              <span className="text-[10px] text-muted-foreground/25">{d.time}</span>
            </div>
          </div>
          {/* Status + action */}
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="success" size="sm" dot>
              {d.status}
            </Badge>
            <button
              onClick={() => handleDownload(d.name)}
              className="p-1 rounded-md text-muted-foreground/30 hover:text-[hsl(var(--neon-blue))] hover:bg-[hsl(var(--neon-blue)/0.1)] hover:shadow-[0_0_8px_hsl(var(--neon-blue)/0.1)] transition-all duration-200"
              title="Download again"
            >
              <Download className="w-3 h-3" />
            </button>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

function HistoryTab() {
  return (
    <motion.div className="space-y-1" variants={listVariants} initial="hidden" animate="visible">
      {historyItems.map((item) => (
        <motion.div
          key={item.id}
          variants={listItemVariants}
          className="group px-3 py-2 rounded-xl hover:bg-[hsl(var(--surface-2)/0.3)] hover:shadow-[0_0_12px_hsl(var(--neon-purple)/0.03)] transition-all duration-200 border border-transparent hover:border-[hsl(var(--border)/0.15)]"
        >
          {/* Top row: prompt + format */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-foreground/80 group-hover:text-foreground/95 truncate font-medium transition-colors">
              {item.prompt}
            </span>
            <Badge variant="default" size="sm" className="shrink-0 font-mono">
              {item.format}
            </Badge>
          </div>
          {/* Bottom row: badges + stats */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant="neon" size="sm">{item.model}</Badge>
            <Badge variant="default" size="sm">{item.quality}</Badge>
            <span className="text-[10px] text-muted-foreground/25 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />{item.duration}
            </span>
            <span className="text-[10px] text-muted-foreground/25">
              {item.verts} verts
            </span>
            <span className="text-[10px] text-muted-foreground/20 ml-auto">
              {item.date}
            </span>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

function AssetsTab() {
  const { toast } = useToast();

  const handleClick = useCallback((name: string) => {
    toast({ title: 'Asset selected', description: name });
  }, [toast]);

  const typeIcon = (type: string) => {
    switch (type) {
      case '3D Model': return <Package className="w-2.5 h-2.5" />;
      case 'Texture Pack': return <ImageIcon className="w-2.5 h-2.5" />;
      default: return <FileDown className="w-2.5 h-2.5" />;
    }
  };

  return (
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-3 gap-1.5"
      variants={listVariants}
      initial="hidden"
      animate="visible"
    >
      {assets.map((asset) => (
        <motion.button
          key={asset.id}
          variants={listItemVariants}
          onClick={() => handleClick(asset.name)}
          className="card-premium p-2.5 rounded-xl text-left hover:bg-[hsl(var(--surface-2)/0.4)] hover:shadow-[0_0_14px_hsl(var(--neon-purple)/0.06)] hover:border-[hsl(var(--neon-purple)/0.15)] transition-all duration-200 border border-transparent group"
        >
          {/* Thumbnail */}
          <div className="w-full aspect-square rounded-lg bg-[hsl(var(--surface-2)/0.5)] border border-[hsl(var(--border)/0.15)] flex items-center justify-center mb-2 text-2xl group-hover:scale-[1.03] transition-transform duration-200">
            {asset.thumbnail}
          </div>
          {/* Name */}
          <p className="text-[11px] text-foreground/80 font-medium truncate">{asset.name}</p>
          {/* Type + size */}
          <div className="flex items-center gap-1.5 mt-1">
            <Badge variant="default" size="sm" className="gap-0.5">
              {typeIcon(asset.type)}
              {asset.type}
            </Badge>
            <span className="text-[10px] text-muted-foreground/25 tabular-nums">{asset.size}</span>
          </div>
        </motion.button>
      ))}
    </motion.div>
  );
}

/* ── Main Bottom Dock Component ─────────────────────── */
export function BottomDock() {
  const { bottomPanelCollapsed, toggleBottomPanel, bottomDockTab, setBottomDockTab } = useUIStore();

  const tabContentVariants: Variants = {
    hidden: { opacity: 0, y: 4 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
    exit: { opacity: 0, y: -4, transition: { duration: 0.15, ease: 'easeIn' } },
  };

  return (
    <div className="flex flex-col h-full panel-glass border-t border-[hsl(var(--border)/0.3)]" style={{ boxShadow: 'inset 0 1px 0 hsl(var(--neon-purple) / 0.06)' }}>
      {/* Glowing gradient line at top */}
      <div className="h-[1px] w-full shrink-0" style={{ background: 'linear-gradient(90deg, transparent 0%, hsl(var(--neon-purple) / 0.35) 20%, hsl(var(--neon-blue) / 0.35) 80%, transparent 100%)', boxShadow: '0 0 10px hsl(var(--neon-purple) / 0.2)' }} />

      {/* Tab Bar */}
      <div className="flex items-center gap-0.5 px-2 h-9 shrink-0 overflow-x-auto no-scrollbar">
        {DOCK_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = bottomDockTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (bottomPanelCollapsed) toggleBottomPanel();
                setBottomDockTab(tab.id);
              }}
              className={cn(
                'tab-premium relative flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium transition-all duration-200 whitespace-nowrap shrink-0',
                isActive ? 'tab-premium-active shadow-[0_0_12px_hsl(var(--neon-purple)/0.12)]' : 'hover:shadow-[0_0_6px_hsl(var(--neon-purple)/0.06)]'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="dock-tab-indicator"
                  className="absolute -top-[5px] left-3 right-3 h-[1.5px] rounded-full"
                  style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--neon-purple)), transparent)', boxShadow: '0 0 8px hsl(var(--neon-purple) / 0.5)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon className={cn(
                'w-3 h-3 transition-all duration-200',
                isActive
                  ? 'text-[hsl(var(--neon-purple))] drop-shadow-[0_0_6px_hsl(var(--neon-purple)/0.6)]'
                  : 'text-muted-foreground/50'
              )} />
              <span className={cn('hidden md:inline', isActive ? 'text-foreground' : '')}>{tab.label}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={toggleBottomPanel}
          className="text-muted-foreground/40 hover:text-[hsl(var(--neon-purple))] hover:shadow-[0_0_8px_hsl(var(--neon-purple)/0.2)] transition-all duration-300 p-1 shrink-0 rounded-lg hover:bg-[hsl(var(--neon-purple)/0.06)]"
        >
          {bottomPanelCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {!bottomPanelCollapsed && (
          <motion.div
            key={bottomDockTab}
            variants={tabContentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex-1 min-h-0"
          >
            <ScrollArea className="h-full scrollbar-neon">
              <div className="p-3">
                {bottomDockTab === 'recent' && <RecentPromptsTab />}
                {bottomDockTab === 'queue' && <QueueTab />}
                {bottomDockTab === 'progress' && <ProgressTab />}
                {bottomDockTab === 'notifications' && <NotificationsTab />}
                {bottomDockTab === 'downloads' && <DownloadsTab />}
                {bottomDockTab === 'history' && <HistoryTab />}
                {bottomDockTab === 'assets' && <AssetsTab />}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}