"use client";


import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/premium/GlassCard';
import { MetricCard } from '@/components/premium/MetricCard';
import { NeonButton } from '@/components/premium/NeonButton';
import { ProgressBar } from '@/components/premium/ProgressBar';
import { StatusDot } from '@/components/premium/StatusDot';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  useSystemOverview,
  useSystemStatistics,
  useGenerationHistory,
  useAvailableModels
} from '@/hooks/useBackendData';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  LayoutDashboard,
  Briefcase,
  Box,
  Cpu,
  ListOrdered,
  Download,
  HeartPulse,
  Container,
  Terminal,
  ScrollText,
  Settings,
  TrendingUp,
  TrendingDown,
  Eye,
  RotateCcw,
  Trash2,
  X,
  Search,
  ChevronRight,
  Activity,
  HardDrive,
  Thermometer,
  Server,
  MemoryStick,
  FolderOpen,
  Clock,
  Zap,
  Package,
  Upload,
  Power,
  Save,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type TabId =
  | 'overview'
  | 'jobs'
  | 'models'
  | 'runtime'
  | 'queue'
  | 'downloads'
  | 'health'
  | 'docker'
  | 'terminal'
  | 'logs'
  | 'settings';

type JobStatus = 'completed' | 'processing' | 'failed' | 'queued';
type ModelStatus = 'loaded' | 'available' | 'missing';

// ═══════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════

const NAV_ITEMS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
  { id: 'models', label: 'Models', icon: Box },
  { id: 'runtime', label: 'Runtime', icon: Cpu },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'downloads', label: 'Downloads', icon: Download },
  { id: 'health', label: 'Health', icon: HeartPulse },
  { id: 'docker', label: 'Docker', icon: Container },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const MOCK_RECENT_JOBS = [
  { id: 'JOB-0147', prompt: 'Futuristic cyberpunk cityscape at sunset with neon signs', model: 'Stable Fast 3D', status: 'completed' as JobStatus, duration: '2m 34s', created: '2 min ago' },
  { id: 'JOB-0146', prompt: 'Detailed mechanical gear assembly with metallic textures', model: 'TripoSR', status: 'processing' as JobStatus, duration: '1m 12s', created: '3 min ago' },
  { id: 'JOB-0145', prompt: 'Organic alien plant with bioluminescent features', model: 'CRM-Pixel', status: 'completed' as JobStatus, duration: '3m 01s', created: '8 min ago' },
  { id: 'JOB-0144', prompt: 'Medieval castle with detailed stone architecture', model: 'Stable Fast 3D', status: 'failed' as JobStatus, duration: '0m 45s', created: '12 min ago' },
  { id: 'JOB-0143', prompt: 'Sports car in studio lighting, photorealistic', model: 'TripoSR', status: 'queued' as JobStatus, duration: '—', created: '15 min ago' },
  { id: 'JOB-0142', prompt: 'Fantasy dragon sculpture, high poly detailed', model: 'GS-LRM', status: 'completed' as JobStatus, duration: '4m 22s', created: '18 min ago' },
  { id: 'JOB-0141', prompt: 'Modern kitchen interior with natural lighting', model: 'Stable Fast 3D', status: 'completed' as JobStatus, duration: '2m 58s', created: '25 min ago' },
  { id: 'JOB-0140', prompt: 'Abstract geometric sculpture with metallic finish', model: 'CRM-Pixel', status: 'processing' as JobStatus, duration: '0m 55s', created: '28 min ago' },
  { id: 'JOB-0139', prompt: 'Retro sci-fi raygun with chrome plating', model: 'TripoSR', status: 'queued' as JobStatus, duration: '—', created: '30 min ago' },
  { id: 'JOB-0138', prompt: 'Ancient Greek temple ruins with weathered stone', model: 'GS-LRM', status: 'completed' as JobStatus, duration: '3m 45s', created: '35 min ago' },
];

const MOCK_JOBS_TABLE = [
  { id: 'JOB-0147', prompt: 'Futuristic cyberpunk cityscape at sunset with neon signs', model: 'Stable Fast 3D', status: 'completed' as JobStatus, progress: 100, duration: '2m 34s' },
  { id: 'JOB-0146', prompt: 'Detailed mechanical gear assembly with metallic textures', model: 'TripoSR', status: 'processing' as JobStatus, progress: 67, duration: '1m 12s' },
  { id: 'JOB-0145', prompt: 'Organic alien plant with bioluminescent features', model: 'CRM-Pixel', status: 'completed' as JobStatus, progress: 100, duration: '3m 01s' },
  { id: 'JOB-0144', prompt: 'Medieval castle with detailed stone architecture', model: 'Stable Fast 3D', status: 'failed' as JobStatus, progress: 23, duration: '0m 45s' },
  { id: 'JOB-0143', prompt: 'Sports car in studio lighting, photorealistic', model: 'TripoSR', status: 'queued' as JobStatus, progress: 0, duration: '—' },
  { id: 'JOB-0142', prompt: 'Fantasy dragon sculpture, high poly detailed', model: 'GS-LRM', status: 'completed' as JobStatus, progress: 100, duration: '4m 22s' },
  { id: 'JOB-0141', prompt: 'Modern kitchen interior with natural lighting', model: 'Stable Fast 3D', status: 'completed' as JobStatus, progress: 100, duration: '2m 58s' },
  { id: 'JOB-0140', prompt: 'Abstract geometric sculpture with metallic finish', model: 'CRM-Pixel', status: 'processing' as JobStatus, progress: 34, duration: '0m 55s' },
  { id: 'JOB-0139', prompt: 'Retro sci-fi raygun with chrome plating', model: 'TripoSR', status: 'queued' as JobStatus, progress: 0, duration: '—' },
  { id: 'JOB-0138', prompt: 'Ancient Greek temple ruins with weathered stone', model: 'GS-LRM', status: 'completed' as JobStatus, progress: 100, duration: '3m 45s' },
];

const MOCK_MODELS = [
  { name: 'Stable Fast 3D', type: 'Fast', description: 'High-speed 3D generation with good quality output. Best for rapid prototyping.', status: 'loaded' as ModelStatus, vram: '6.2 GB', size: '4.8 GB' },
  { name: 'TripoSR', type: 'Standard', description: 'Open-source single-image to 3D model. Balanced quality and speed.', status: 'loaded' as ModelStatus, vram: '4.1 GB', size: '2.3 GB' },
  { name: 'CRM-Pixel', type: 'Precision', description: 'Pixel-accurate reconstruction with fine detail preservation.', status: 'available' as ModelStatus, vram: '5.8 GB', size: '3.6 GB' },
  { name: 'GS-LRM', type: 'Quality', description: 'Large reconstruction model for high-fidelity results.', status: 'available' as ModelStatus, vram: '8.4 GB', size: '6.1 GB' },
  { name: 'Zero123++', type: 'Novel', description: 'Zero-shot 3D reconstruction from a single image.', status: 'missing' as ModelStatus, vram: '7.2 GB', size: '5.2 GB' },
  { name: 'ImageDream', type: 'Creative', description: 'Dream-like 3D generation with artistic interpretation.', status: 'missing' as ModelStatus, vram: '5.5 GB', size: '3.9 GB' },
];

const MOCK_QUEUED_JOBS = [
  { position: 1, prompt: 'Sports car in studio lighting, photorealistic', model: 'TripoSR', wait: '~2m' },
  { position: 2, prompt: 'Retro sci-fi raygun with chrome plating', model: 'TripoSR', wait: '~5m' },
  { position: 3, prompt: 'Steampunk clocktower mechanism, detailed gears', model: 'Stable Fast 3D', wait: '~8m' },
  { position: 4, prompt: 'Underwater coral reef scene with tropical fish', model: 'CRM-Pixel', wait: '~11m' },
  { position: 5, prompt: 'Japanese zen garden with cherry blossoms', model: 'GS-LRM', wait: '~14m' },
];

const GPU_DATA = [72, 85, 91, 78, 65, 88, 95, 82, 74, 90, 87, 68];

const RUNTIME_INFO = [
  { label: 'Python Version', value: '3.11.9', icon: Server, status: 'ok' as const },
  { label: 'CUDA Version', value: '12.4.1', icon: Zap, status: 'ok' as const },
  { label: 'GPU Model', value: 'NVIDIA RTX 4090', icon: Cpu, status: 'ok' as const },
  { label: 'VRAM', value: '24 GB', icon: MemoryStick, status: 'ok' as const },
  { label: 'Disk Space', value: '186 GB / 512 GB', icon: HardDrive, status: 'warning' as const },
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const STATUS_CONFIG: Record<JobStatus, { color: string; bg: string; label: string; pulse?: boolean }> = {
  completed: { color: 'text-[hsl(var(--neon-green))]', bg: 'bg-[hsl(var(--neon-green)/0.1)] border-[hsl(var(--neon-green)/0.25)]', label: 'Completed' },
  processing: { color: 'text-[hsl(var(--neon-blue))]', bg: 'bg-[hsl(var(--neon-blue)/0.1)] border-[hsl(var(--neon-blue)/0.25)]', label: 'Processing', pulse: true },
  failed: { color: 'text-[hsl(var(--destructive))]', bg: 'bg-[hsl(var(--destructive)/0.1)] border-[hsl(var(--destructive)/0.25)]', label: 'Failed' },
  queued: { color: 'text-[hsl(var(--neon-amber))]', bg: 'bg-[hsl(var(--neon-amber)/0.1)] border-[hsl(var(--neon-amber)/0.25)]', label: 'Queued' },
};

const MODEL_STATUS_CONFIG: Record<ModelStatus, { color: string; bg: string; label: string }> = {
  loaded: { color: 'text-[hsl(var(--neon-green))]', bg: 'bg-[hsl(var(--neon-green)/0.1)] border-[hsl(var(--neon-green)/0.25)]', label: 'Loaded' },
  available: { color: 'text-[hsl(var(--neon-blue))]', bg: 'bg-[hsl(var(--neon-blue)/0.1)] border-[hsl(var(--neon-blue)/0.25)]', label: 'Available' },
  missing: { color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-[hsl(var(--surface-3)/0.4)] border-[hsl(var(--border)/0.3)]', label: 'Not Installed' },
};

const MODEL_TYPE_COLORS: Record<string, string> = {
  Fast: 'text-[hsl(var(--neon-cyan))] bg-[hsl(var(--neon-cyan)/0.1)] border-[hsl(var(--neon-cyan)/0.2)]',
  Standard: 'text-[hsl(var(--neon-blue))] bg-[hsl(var(--neon-blue)/0.1)] border-[hsl(var(--neon-blue)/0.2)]',
  Precision: 'text-[hsl(var(--neon-purple))] bg-[hsl(var(--neon-purple)/0.1)] border-[hsl(var(--neon-purple)/0.2)]',
  Quality: 'text-[hsl(var(--neon-green))] bg-[hsl(var(--neon-green)/0.1)] border-[hsl(var(--neon-green)/0.2)]',
  Novel: 'text-[hsl(var(--neon-pink))] bg-[hsl(var(--neon-pink)/0.1)] border-[hsl(var(--neon-pink)/0.2)]',
  Creative: 'text-[hsl(var(--neon-amber))] bg-[hsl(var(--neon-amber)/0.1)] border-[hsl(var(--neon-amber)/0.2)]',
};

function StatusBadge({ status }: { status: JobStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <motion.span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
        cfg.color,
        cfg.bg
      )}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
    >
      {cfg.pulse && (
        <motion.span
          className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-blue))]"
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
      {status === 'completed' && <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-green))]" />}
      {status === 'failed' && <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--destructive))]" />}
      {status === 'queued' && <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-amber))]" />}
      {cfg.label}
    </motion.span>
  );
}

// ═══════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════

function Sidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  return (
    <aside className="w-56 flex-shrink-0 h-full flex flex-col border-r border-[hsl(var(--border)/0.35)] bg-[hsl(var(--surface-1)/0.5)] backdrop-blur-xl">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[hsl(var(--neon-purple))] to-[hsl(var(--neon-blue))] flex items-center justify-center shadow-glow-purple">
          <Box className="w-4 h-4 text-white" />
        </div>
        <span className="text-base font-bold text-gradient">AI 3D Studio</span>
      </div>

      <div className="section-divider mx-4" />

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2.5 space-y-0.5">
        {NAV_ITEMS.map((item, i) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative group',
                isActive
                  ? 'bg-[hsl(var(--neon-purple)/0.1)] text-foreground'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground/80'
              )}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3, ease: 'easeOut' }}
            >
              {/* Active left border accent */}
              {isActive && (
                <motion.div
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-full bg-[hsl(var(--neon-purple))]"
                  layoutId="sidebar-active-indicator"
                  style={{ boxShadow: '0 0 8px hsl(var(--neon-purple)/0.5)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <Icon className={cn(
                'w-4 h-4 flex-shrink-0 transition-colors',
                isActive ? 'text-[hsl(var(--neon-purple))]' : 'text-muted-foreground group-hover:text-foreground/60'
              )} />
              <span>{item.label}</span>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto text-[hsl(var(--neon-purple)/0.6)]" />
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Bottom Status */}
      <div className="px-5 py-4 border-t border-[hsl(var(--border)/0.25)]">
        <div className="flex items-center gap-2.5">
          <StatusDot status="online" size="sm" />
          <span className="text-xs font-medium text-muted-foreground">System Online</span>
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-1 ml-[22px]">Uptime: 14d 7h 32m</p>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════

function OverviewTab() {
  const { overview, loading: overviewLoading } = useSystemOverview();
  const { history, loading: historyLoading } = useGenerationHistory(10);
  const { stats, loading: statsLoading } = useSystemStatistics();

  const totalJobs = overview?.overview?.total_jobs || 0;
  const activeJobs = overview?.overview?.active_jobs || 0;
  const queueLength = overview?.overview?.queued_jobs || 0;
  const completedJobs = overview?.overview?.completed_jobs || 0;
  
  const successRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

  const gpuUsage = stats?.stats?.gpu_utilization || 0;
  
  const recentJobs = history || MOCK_RECENT_JOBS;

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Total Jobs"
          value={overviewLoading ? '...' : totalJobs}
          icon={Briefcase}
          color="purple"
          delay={0}
          trend={{ value: 12, positive: true }}
          sparkline={[820, 910, 980, 1020, 1100, 1180, totalJobs]}
        />
        <MetricCard
          label="Active GPU"
          value={statsLoading ? '...' : gpuUsage}
          unit="%"
          icon={Activity}
          color="blue"
          delay={0.1}
          trend={{ value: 3, positive: true }}
          sparkline={[72, 78, 85, 81, 90, 84, gpuUsage]}
        />
        <MetricCard
          label="Queue Length"
          value={overviewLoading ? '...' : queueLength}
          unit="pending"
          icon={ListOrdered}
          color="cyan"
          delay={0.2}
          trend={{ value: 8, positive: false }}
          sparkline={[15, 18, 12, 20, 25, 19, queueLength]}
        />
        <MetricCard
          label="Success Rate"
          value={overviewLoading ? '...' : successRate.toFixed(1)}
          unit="%"
          icon={TrendingUp}
          color="green"
          delay={0.3}
          trend={{ value: 0.5, positive: true }}
          sparkline={[97.2, 97.8, 98.1, 97.9, 98.3, 98.4, successRate]}
        />
      </div>

      {/* Recent Jobs Table */}
      <GlassCard hover delay={0.4} className="overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between border-b border-[hsl(var(--border)/0.25)]">
          <h3 className="text-sm font-semibold text-foreground">Recent Jobs</h3>
          <NeonButton variant="ghost" color="purple" size="sm">
            View All <ChevronRight className="w-3.5 h-3.5" />
          </NeonButton>
        </div>
        <div className="overflow-x-auto scrollbar-thin max-h-96 overflow-y-auto">
          <table className="table-premium table-row-hover table-header-premium w-full">
            <thead>
              <tr>
                <th>ID</th>
                <th>Prompt</th>
                <th>Model</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job: any, i: number) => (
                <motion.tr
                  key={job.id}
                  className={cn(
                    'border-b border-[hsl(var(--border)/0.15)] last:border-0',
                    i % 2 === 1 && 'bg-[hsl(var(--surface-2)/0.2)]'
                  )}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.05, duration: 0.3 }}
                >
                  <td className="font-mono text-xs text-muted-foreground">{job.id.substring(0, 8)}</td>
                  <td className="max-w-[240px] truncate text-foreground/80">{job.prompt}</td>
                  <td>
                    <span className="chip text-[10px]">{job.provider || job.model}</span>
                  </td>
                  <td>
                    <StatusBadge status={job.status as JobStatus} />
                  </td>
                  <td className="font-mono text-xs text-muted-foreground">{job.duration || '—'}</td>
                  <td className="text-xs text-muted-foreground/70">{job.created_at ? new Date(job.created_at).toLocaleTimeString() : job.created}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* GPU Usage Chart */}
      <GlassCard hover delay={0.5} className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">GPU Usage (Last 12 Hours)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Hourly average utilization</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-3 h-1.5 rounded-full bg-gradient-to-r from-[hsl(var(--neon-purple))] to-[hsl(var(--neon-blue))]" />
            Usage %
          </div>
        </div>
        <div className="flex items-end gap-2 sm:gap-3 h-40">
          {GPU_DATA.map((usage, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <motion.div
                className="w-full rounded-t-md relative overflow-hidden"
                initial={{ height: 0 }}
                animate={{ height: `${(usage / 100) * 140}px` }}
                transition={{ delay: 0.6 + i * 0.06, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                style={{
                  background: `linear-gradient(180deg, hsl(var(--neon-purple)/0.9) 0%, hsl(var(--neon-blue)/0.7) 100%)`,
                  boxShadow: `0 0 12px hsl(var(--neon-purple)/0.15), inset 0 1px 0 hsl(var(--foreground)/0.1)`,
                  minWidth: '8px',
                }}
              >
                {/* Shimmer overlay */}
                <div
                  className="absolute inset-0 opacity-30"
                  style={{
                    background: 'linear-gradient(180deg, hsl(var(--foreground)/0.15) 0%, transparent 60%)',
                  }}
                />
              </motion.div>
              <motion.span
                className="text-[10px] font-mono text-muted-foreground/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 + i * 0.04 }}
              >
                {12 - i}h
              </motion.span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// JOBS TAB
// ═══════════════════════════════════════════════════════════════

function JobsTab() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { history, loading } = useGenerationHistory(50);
  const jobsData = history || MOCK_JOBS_TABLE;

  const filteredJobs = jobsData.filter((job: any) => {
    if (statusFilter !== 'all' && job.status !== statusFilter) return false;
    if (modelFilter !== 'all' && (job.provider || job.model) !== modelFilter) return false;
    if (search && !job.prompt?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <GlassCard delay={0.1} className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              placeholder="Search prompts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-premium pl-9 h-9 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="input-premium w-[160px] h-9 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="dropdown-premium">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
            </SelectContent>
          </Select>
          <Select value={modelFilter} onValueChange={setModelFilter}>
            <SelectTrigger className="input-premium w-[180px] h-9 text-sm">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent className="dropdown-premium">
              <SelectItem value="all">All Models</SelectItem>
              <SelectItem value="Stable Fast 3D">Stable Fast 3D</SelectItem>
              <SelectItem value="TripoSR">TripoSR</SelectItem>
              <SelectItem value="CRM-Pixel">CRM-Pixel</SelectItem>
              <SelectItem value="GS-LRM">GS-LRM</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      {/* Jobs Table */}
      <GlassCard delay={0.2} className="overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin max-h-[480px] overflow-y-auto">
          <table className="table-premium table-row-hover table-header-premium w-full">
            <thead>
              <tr>
                <th>ID</th>
                <th>Prompt</th>
                <th>Model</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Duration</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job: any, i: number) => (
                <motion.tr
                  key={job.id}
                  className={cn(
                    'border-b border-[hsl(var(--border)/0.15)] last:border-0',
                    i % 2 === 1 && 'bg-[hsl(var(--surface-2)/0.2)]'
                  )}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.05, duration: 0.3 }}
                >
                  <td className="font-mono text-xs text-muted-foreground">{job.id.substring(0, 8)}</td>
                  <td className="max-w-[220px] truncate text-foreground/80 text-xs">{job.prompt}</td>
                  <td>
                    <span className="chip text-[10px]">{job.provider || job.model}</span>
                  </td>
                  <td>
                    <StatusBadge status={job.status as JobStatus} />
                  </td>
                  <td className="w-[100px]">
                    {job.status === 'queued' ? (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    ) : (
                      <ProgressBar
                        value={job.progress || 100}
                        size="thin"
                        color={
                          job.status === 'failed' ? 'amber' :
                          job.status === 'completed' ? 'green' :
                          job.status === 'processing' ? 'blue' : 'purple'
                        }
                      />
                    )}
                  </td>
                  <td className="font-mono text-xs text-muted-foreground">{job.duration || '—'}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <motion.button
                        className="p-1.5 rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </motion.button>
                      {job.status === 'failed' && (
                        <motion.button
                          className="p-1.5 rounded-md hover:bg-[hsl(var(--neon-blue)/0.1)] text-muted-foreground hover:text-[hsl(var(--neon-blue))] transition-colors"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </motion.button>
                      )}
                      <motion.button
                        className="p-1.5 rounded-md hover:bg-[hsl(var(--destructive)/0.1)] text-muted-foreground hover:text-[hsl(var(--destructive))] transition-colors"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </motion.button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Pagination */}
      <div className="flex justify-center">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => { e.preventDefault(); setPage(Math.max(1, page - 1)); }}
                className="text-muted-foreground hover:text-foreground hover:bg-white/5"
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                href="#"
                isActive={page === 1}
                onClick={(e) => { e.preventDefault(); setPage(1); }}
                className={cn(
                  page === 1 ? 'bg-[hsl(var(--neon-purple)/0.15)] border-[hsl(var(--neon-purple)/0.3)] text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
              >
                1
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                href="#"
                isActive={page === 2}
                onClick={(e) => { e.preventDefault(); setPage(2); }}
                className={cn(
                  page === 2 ? 'bg-[hsl(var(--neon-purple)/0.15)] border-[hsl(var(--neon-purple)/0.3)] text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
              >
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                href="#"
                isActive={page === 3}
                onClick={(e) => { e.preventDefault(); setPage(3); }}
                className={cn(
                  page === 3 ? 'bg-[hsl(var(--neon-purple)/0.15)] border-[hsl(var(--neon-purple)/0.3)] text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
              >
                3
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => { e.preventDefault(); setPage(Math.min(3, page + 1)); }}
                className="text-muted-foreground hover:text-foreground hover:bg-white/5"
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODELS TAB
// ═══════════════════════════════════════════════════════════════

function ModelsTab() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Model Management</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{MOCK_MODELS.length} models registered, {MOCK_MODELS.filter(m => m.status === 'loaded').length} loaded</p>
        </div>
        <NeonButton variant="outline" color="purple" size="sm" icon={<Upload className="w-3.5 h-3.5" />}>
          Import Model
        </NeonButton>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {MOCK_MODELS.map((model, i) => {
          const statusCfg = MODEL_STATUS_CONFIG[model.status];
          const typeColor = MODEL_TYPE_COLORS[model.type] || MODEL_TYPE_COLORS.Standard;
          return (
            <GlassCard
              key={model.name}
              hover
              delay={i * 0.08}
              className="p-5 glow-border"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, hsl(var(--neon-purple)/0.12), hsl(var(--neon-blue)/0.08))',
                      boxShadow: '0 0 12px hsl(var(--neon-purple)/0.15)',
                    }}
                  >
                    <Package className="w-4 h-4 text-[hsl(var(--neon-purple))]" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{model.name}</h4>
                    <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border', typeColor)}>
                      {model.type}
                    </span>
                  </div>
                </div>
                <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border', statusCfg.color, statusCfg.bg)}>
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    model.status === 'loaded' && 'bg-[hsl(var(--neon-green))]',
                    model.status === 'available' && 'bg-[hsl(var(--neon-blue))]',
                    model.status === 'missing' && 'bg-muted-foreground/40'
                  )} />
                  {statusCfg.label}
                </span>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed mb-4">{model.description}</p>

              <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <MemoryStick className="w-3 h-3" />
                  <span>VRAM: {model.vram}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <HardDrive className="w-3 h-3" />
                  <span>Size: {model.size}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {model.status === 'loaded' ? (
                  <NeonButton variant="outline" color="amber" size="sm" icon={<Power className="w-3 h-3" />}>
                    Unload
                  </NeonButton>
                ) : model.status === 'available' ? (
                  <NeonButton variant="solid" color="purple" size="sm" icon={<Zap className="w-3 h-3" />}>
                    Load
                  </NeonButton>
                ) : (
                  <NeonButton variant="outline" color="blue" size="sm" icon={<Download className="w-3 h-3" />}>
                    Download
                  </NeonButton>
                )}
                {model.status === 'loaded' && (
                  <NeonButton variant="ghost" color="purple" size="sm">
                    Configure
                  </NeonButton>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RUNTIME TAB
// ═══════════════════════════════════════════════════════════════

function RuntimeTab() {
  const [gpuTemp] = useState(72);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">System Information</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Runtime environment details</p>
      </div>

      {/* System Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {RUNTIME_INFO.map((info, i) => {
          const Icon = info.icon;
          return (
            <GlassCard key={info.label} hover delay={i * 0.08} className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-[hsl(var(--surface-2)/0.5)]"
                  style={{
                    boxShadow: info.status === 'warning'
                      ? '0 0 12px hsl(var(--neon-amber)/0.15)'
                      : '0 0 12px hsl(var(--neon-purple)/0.1)',
                  }}
                >
                  <Icon className={cn(
                    'w-4 h-4',
                    info.status === 'warning'
                      ? 'text-[hsl(var(--neon-amber))]'
                      : 'text-[hsl(var(--neon-purple))]'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">{info.label}</p>
                  <p className="text-sm font-semibold text-foreground truncate mt-0.5">{info.value}</p>
                </div>
                <StatusDot status={info.status === 'warning' ? 'warning' : 'online'} size="sm" />
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* GPU Temperature */}
      <GlassCard hover delay={0.4} className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <Thermometer className="w-4 h-4 text-[hsl(var(--neon-amber))]" />
          <h4 className="text-sm font-semibold text-foreground">GPU Temperature</h4>
          <span className="ml-auto text-lg font-bold font-mono text-[hsl(var(--neon-amber))]">{gpuTemp}°C</span>
        </div>
        <div className="relative h-6 rounded-full overflow-hidden bg-[hsl(var(--surface-3)/0.5)]">
          <motion.div
            className="h-full rounded-full relative overflow-hidden"
            initial={{ width: 0 }}
            animate={{ width: `${(gpuTemp / 100) * 100}%` }}
            transition={{ delay: 0.5, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              background: `linear-gradient(90deg, hsl(var(--neon-green)) 0%, hsl(var(--neon-amber)) 60%, hsl(var(--destructive)) 100%)`,
              boxShadow: '0 0 12px hsl(var(--neon-amber)/0.3)',
            }}
          >
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background: 'linear-gradient(180deg, hsl(var(--foreground)/0.2) 0%, transparent 60%)',
              }}
            />
          </motion.div>
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground/50 font-mono">
          <span>0°C</span>
          <span>Safe Zone (0-85°C)</span>
          <span>100°C</span>
        </div>
      </GlassCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// QUEUE TAB
// ═══════════════════════════════════════════════════════════════

function QueueTab() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Job Queue</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{MOCK_QUEUED_JOBS.length} jobs waiting in queue</p>
        </div>
        <NeonButton variant="outline" color="pink" size="sm" icon={<X className="w-3.5 h-3.5" />}>
          Clear All
        </NeonButton>
      </div>

      <div className="space-y-2.5">
        {MOCK_QUEUED_JOBS.map((job, i) => (
          <motion.div
            key={job.position}
            className={cn(
              'card-premium p-4 flex items-center gap-4',
              i % 2 === 1 && 'bg-[hsl(var(--surface-2)/0.15)]'
            )}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
          >
            {/* Position */}
            <div className="w-8 h-8 rounded-lg bg-[hsl(var(--neon-purple)/0.1)] border border-[hsl(var(--neon-purple)/0.2)] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold font-mono text-[hsl(var(--neon-purple))]">#{job.position}</span>
            </div>

            {/* Job Details */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">{job.prompt}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="chip text-[10px]">{job.model}</span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
                  <Clock className="w-3 h-3" />
                  <span>ETA: {job.wait}</span>
                </div>
              </div>
            </div>

            {/* Cancel Button */}
            <motion.button
              className="p-2 rounded-lg hover:bg-[hsl(var(--destructive)/0.1)] text-muted-foreground hover:text-[hsl(var(--destructive))] transition-colors border border-transparent hover:border-[hsl(var(--destructive)/0.2)]"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <X className="w-4 h-4" />
            </motion.button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PLACEHOLDER TABS
// ═══════════════════════════════════════════════════════════════

function PlaceholderTab({ title, icon: Icon, description }: { title: string; icon: React.ComponentType<{ className?: string }>; description: string }) {
  return (
    <div className="empty-state min-h-[300px]">
      <div className="empty-state-icon">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════

function SettingsTab() {
  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Settings</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Configure your AI 3D Studio instance</p>
      </div>

      {/* General Section */}
      <GlassCard hover delay={0.1} className="p-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--neon-purple))] mb-4">General</h4>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">API Port</Label>
              <Input defaultValue="8188" className="input-premium h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Host</Label>
              <Input defaultValue="0.0.0.0" className="input-premium h-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">CORS Origins</Label>
            <Input defaultValue="http://localhost:3000" className="input-premium h-9 text-sm" />
          </div>
        </div>
      </GlassCard>

      <div className="section-divider" />

      {/* Models Section */}
      <GlassCard hover delay={0.2} className="p-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--neon-blue))] mb-4">Models</h4>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Default Model</Label>
            <Select defaultValue="stable-fast-3d">
              <SelectTrigger className="input-premium w-full h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dropdown-premium">
                <SelectItem value="stable-fast-3d">Stable Fast 3D</SelectItem>
                <SelectItem value="triposr">TripoSR</SelectItem>
                <SelectItem value="crm-pixel">CRM-Pixel</SelectItem>
                <SelectItem value="gs-lrm">GS-LRM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Max Concurrent Jobs</Label>
              <Input type="number" defaultValue="3" className="input-premium h-9 text-sm" />
            </div>
            <div className="flex items-end gap-3 pb-0.5">
              <div className="flex items-center justify-between w-full">
                <Label className="text-xs text-muted-foreground">Auto-cleanup</Label>
                <Switch defaultChecked />
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="section-divider" />

      {/* Storage Section */}
      <GlassCard hover delay={0.3} className="p-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--neon-cyan))] mb-4">Storage</h4>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Output Directory</Label>
            <div className="flex items-center gap-2">
              <Input defaultValue="/data/outputs" className="input-premium h-9 text-sm flex-1" />
              <NeonButton variant="ghost" color="purple" size="sm" icon={<FolderOpen className="w-3.5 h-3.5" />}>
                Browse
              </NeonButton>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Max Storage (GB)</Label>
              <Input type="number" defaultValue="100" className="input-premium h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Retention Days</Label>
              <Input type="number" defaultValue="30" className="input-premium h-9 text-sm" />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <NeonButton
          variant="solid"
          color="purple"
          size="md"
          glow
          icon={<Save className="w-4 h-4" />}
        >
          Save Settings
        </NeonButton>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const mainRef = useRef<HTMLDivElement>(null);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab />;
      case 'jobs':
        return <JobsTab />;
      case 'models':
        return <ModelsTab />;
      case 'runtime':
        return <RuntimeTab />;
      case 'queue':
        return <QueueTab />;
      case 'downloads':
        return <PlaceholderTab title="Downloads" icon={Download} description="Manage and track your downloaded 3D models and generated assets." />;
      case 'health':
        return <PlaceholderTab title="Health Check" icon={HeartPulse} description="Monitor system health, API endpoints, and service availability." />;
      case 'docker':
        return <PlaceholderTab title="Docker" icon={Container} description="View and manage Docker containers, images, and volumes." />;
      case 'terminal':
        return <PlaceholderTab title="Terminal" icon={Terminal} description="Access the embedded terminal for advanced system operations." />;
      case 'logs':
        return <PlaceholderTab title="Logs" icon={ScrollText} description="View system logs, error reports, and debug information." />;
      case 'settings':
        return <SettingsTab />;
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full flex bg-mesh-gradient rounded-2xl overflow-hidden border border-[hsl(var(--border)/0.25)]">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content */}
      <main
        ref={mainRef}
        className="flex-1 h-full overflow-y-auto scrollbar-thin p-6"
      >
        {/* Tab Header */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-lg font-bold text-foreground">
            {NAV_ITEMS.find(n => n.id === activeTab)?.label ?? 'Overview'}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeTab === 'overview' && 'System overview and recent activity'}
            {activeTab === 'jobs' && 'Manage and monitor generation jobs'}
            {activeTab === 'models' && 'Configure and manage 3D generation models'}
            {activeTab === 'runtime' && 'Runtime environment information'}
            {activeTab === 'queue' && 'View and manage the job queue'}
            {activeTab === 'settings' && 'System configuration and preferences'}
            {!['overview', 'jobs', 'models', 'runtime', 'queue', 'settings'].includes(activeTab) && 'Coming soon'}
          </p>
        </motion.div>

        {/* Tab Content with Animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}