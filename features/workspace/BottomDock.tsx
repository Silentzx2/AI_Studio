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
import { useAppStore } from '@/stores/useAppStore';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { Badge } from '@/components/premium/Badge';
import { toast } from 'sonner';
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

/* ── Tab Content Components ─────────────────────────── */

function RecentPromptsTab() {
  const recentPrompts = useAppStore((s) => s.recentPrompts);

  const handleClick = useCallback((text: string) => {
    toast('Loaded prompt', { description: text.length > 50 ? text.slice(0, 50) + '...' : text });
  }, []);

  const fmtTime = useCallback((d: Date) => {
    const diff = new Date().getTime() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }, []);

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
            'bg-[hsl(var(--neon-green))] shadow-[0_0_6px_hsl(var(--neon-green)/0.5)]'
          )} />
          {/* Text */}
          <span className="flex-1 text-muted-foreground/70 group-hover:text-foreground/90 truncate transition-colors">
            {p.text}
          </span>
          {/* Model chip */}
          <span className="chip shrink-0 text-[10px] px-1.5 py-px rounded-md bg-[hsl(var(--surface-2)/0.6)] text-muted-foreground/60 border border-[hsl(var(--border)/0.2)]">
            {p.mode}
          </span>
          {/* Time */}
          <span className="text-[10px] text-muted-foreground/30 shrink-0 tabular-nums w-14 text-right">
            {fmtTime(p.createdAt)}
          </span>
        </motion.button>
      ))}
      {recentPrompts.length === 0 && (
        <p className="text-xs text-muted-foreground/40 px-3 py-4 text-center">No recent prompts yet</p>
      )}
    </motion.div>
  );
}

function QueueTab() {
  const queueItems = useAppStore((s) =>
    Object.values(s.tasks)
      .filter((t) => t.status === 'queued' || t.status === 'running')
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 10)
  );

  const handleCancel = useCallback((id: string, prompt: string) => {
    toast('Job cancelled', { description: prompt.slice(0, 30) + '...' });
  }, []);

  return (
    <motion.div className="space-y-1.5" variants={listVariants} initial="hidden" animate="visible">
      {queueItems.map((item, idx) => (
        <motion.div
          key={item.id}
          variants={listItemVariants}
          className="card-premium flex items-center gap-3 px-3 py-2.5 rounded-xl"
        >
          {/* Position badge */}
          <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-md bg-[hsl(var(--neon-purple)/0.15)] border border-[hsl(var(--neon-purple)/0.3)] text-[10px] font-bold text-[hsl(var(--neon-purple))] tabular-nums shadow-[0_0_8px_hsl(var(--neon-purple)/0.1)]">
            {idx + 1}
          </span>
          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground/80 truncate font-medium">{item.label}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="chip text-[10px] px-1.5 py-px rounded-md bg-[hsl(var(--surface-2)/0.6)] text-muted-foreground/50 border border-[hsl(var(--border)/0.15)]">
                {item.type}
              </span>
              <span className="text-[10px] text-muted-foreground/30 flex items-center gap-1">
                <Wifi className="w-2.5 h-2.5" />{item.status}
              </span>
            </div>
          </div>
          {/* Cancel button */}
          <button
            onClick={() => handleCancel(item.id, item.label)}
            className="shrink-0 p-1 rounded-md text-muted-foreground/30 hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.1)] hover:shadow-[0_0_8px_hsl(0_70%_50%/0.1)] transition-all duration-200"
          >
            <X className="w-3 h-3" />
          </button>
        </motion.div>
      ))}
      {queueItems.length === 0 && (
        <p className="text-xs text-muted-foreground/40 px-3 py-4 text-center">Queue is empty</p>
      )}
    </motion.div>
  );
}

function ProgressTab() {
  const currentJob = useAppStore((s) => s.currentJob);
  const runningTasks = useAppStore((s) =>
    Object.values(s.tasks).filter((t) => t.status === 'running')
  );

  const activeJobs = currentJob
    ? [
        {
          id: currentJob.id,
          prompt: currentJob.config?.prompt || 'Generation in progress',
          model: currentJob.config?.model || 'unknown',
          progress: currentJob.progress || 0,
          stage: currentJob.status,
        },
        ...runningTasks.map((t) => ({
          id: t.id,
          prompt: t.label,
          model: t.type,
          progress: t.progress,
          stage: t.status,
        })),
      ].filter((j, i, arr) => arr.findIndex((x) => x.id === j.id) === i)
    : runningTasks.map((t) => ({
        id: t.id,
        prompt: t.label,
        model: t.type,
        progress: t.progress,
        stage: t.status,
      }));

  const handleCancel = useCallback((id: string, prompt: string) => {
    toast('Generation cancelled', { description: prompt.slice(0, 30) + '...' });
  }, []);

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
              {Math.round(job.progress)}%
            </span>
          </div>
        </motion.div>
      ))}
      {activeJobs.length === 0 && (
        <p className="text-xs text-muted-foreground/40 px-3 py-4 text-center">No active jobs</p>
      )}
    </motion.div>
  );
}

function NotificationsTab() {
  const notifications = useAppStore((s) => {
    const items: { id: string; title: string; message: string; time: string; type: 'success' | 'warning' | 'info'; read: boolean }[] = [];
    const now = Date.now();
    for (const t of Object.values(s.tasks)) {
      if (t.status === 'completed' || t.status === 'failed') {
        const mins = Math.floor((now - t.updatedAt) / 60000);
        items.push({
          id: `task-${t.id}`,
          title: t.status === 'completed' ? 'Task Complete' : 'Task Failed',
          message: t.label,
          time: mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : 'over an hour ago',
          type: t.status === 'completed' ? 'success' : 'warning',
          read: false,
        });
      }
    }
    for (const d of Object.values(s.downloads)) {
      if (d.status === 'completed' || d.status === 'error') {
        items.push({
          id: `dl-${d.id}`,
          title: d.status === 'completed' ? 'Download Complete' : 'Download Failed',
          message: d.name,
          time: 'recent',
          type: d.status === 'completed' ? 'success' : 'warning',
          read: false,
        });
      }
    }
    return items.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 20);
  });

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
      {notifications.length === 0 && (
        <p className="text-xs text-muted-foreground/40 px-3 py-4 text-center">No notifications</p>
      )}
    </motion.div>
  );
}

function DownloadsTab() {
  const downloads = useAppStore((s) => Object.values(s.downloads).slice(0, 10));

  const handleDownload = useCallback((name: string) => {
    toast('Download started', { description: name });
  }, []);

  const fmtSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

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
              <span className="text-[10px] text-muted-foreground/30 tabular-nums">{fmtSize(d.size)}</span>
              <span className="text-[10px] text-muted-foreground/20">·</span>
              <span className="text-[10px] text-muted-foreground/25">{d.status}</span>
            </div>
          </div>
          {/* Status + action */}
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={d.status === 'completed' ? 'success' : 'default'} size="sm" dot>
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
  const historyItems = useAppStore((s) =>
    [...s.jobHistory].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10)
  );

  const fmtTime = (d: Date) => new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

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
              {item.config?.prompt}
            </span>
            <Badge variant="default" size="sm" className="shrink-0 font-mono">
              {item.status}
            </Badge>
          </div>
          {/* Bottom row: badges + stats */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge variant="neon" size="sm">{item.config?.model || 'unknown'}</Badge>
            <Badge variant="default" size="sm">{item.config?.quality}</Badge>
            <span className="text-[10px] text-muted-foreground/25 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />{Math.round(item.progress)}%
            </span>
            <span className="text-[10px] text-muted-foreground/20 ml-auto">
              {fmtTime(item.createdAt)}
            </span>
          </div>
        </motion.div>
      ))}
      {historyItems.length === 0 && (
        <p className="text-xs text-muted-foreground/40 px-3 py-4 text-center">No history yet</p>
      )}
    </motion.div>
  );
}

function AssetsTab() {
  const assets = useAppStore((s) =>
    s.currentProject?.layers.map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      timestamp: l.timestamp,
    })) ?? []
  );

  const handleClick = useCallback((name: string) => {
    toast('Asset selected', { description: name });
  }, []);

  const typeIcon = (type: string) => {
    switch (type) {
      case 'texture': return <ImageIcon className="w-2.5 h-2.5" />;
      case 'rigging':
      case 'animation': return <Package className="w-2.5 h-2.5" />;
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
            📦
          </div>
          {/* Name */}
          <p className="text-[11px] text-foreground/80 font-medium truncate">{asset.name}</p>
          {/* Type + size */}
          <div className="flex items-center gap-1.5 mt-1">
            <Badge variant="default" size="sm" className="gap-0.5">
              {typeIcon(asset.type)}
              {asset.type}
            </Badge>
          </div>
        </motion.button>
      ))}
      {assets.length === 0 && (
        <p className="text-xs text-muted-foreground/40 px-3 py-4 text-center col-span-full">No project assets</p>
      )}
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