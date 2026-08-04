'use client';

import { motion } from 'framer-motion';
import { Download, FileDown, Lock, CheckCircle2 } from 'lucide-react';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { EXPORT_FORMATS } from '@/constants';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function DownloadArea() {
  const { currentJob } = useGenerationStore();
  const isCompleted = currentJob?.status === 'completed';
  const result = currentJob?.result;

  const handleDownload = (format: string, url?: string) => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `model.${format}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Downloading ${format.toUpperCase()}...`, { description: 'Your model will be downloaded shortly.' });
  };

  return (
    <div className="px-3 sm:px-4 py-3 border-t border-[hsl(var(--border)/0.5)] glass shrink-0">
      <div className="flex items-center gap-2 mb-3">
        <Download className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Export</span>
        {!isCompleted && (
          <span className="ml-auto text-[10px] text-muted-foreground/60 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Generate first
          </span>
        )}
        {isCompleted && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-[hsl(var(--neon-green))]">
            <CheckCircle2 className="w-3 h-3" /> Ready
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {EXPORT_FORMATS.map((format, i) => {
          const downloadUrl = result?.downloadUrls[format.id];
          const enabled = isCompleted && !!downloadUrl;
          return (
            <motion.button
              key={format.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => enabled && handleDownload(format.id, downloadUrl)}
              disabled={!enabled}
              className={cn(
                'group flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-center transition-all duration-200 touch-target',
                enabled ? 'bg-surface-2/50 border-[hsl(var(--border)/0.5)] hover:border-[hsl(var(--neon-purple)/0.4)] hover:bg-[hsl(var(--neon-purple)/0.05)] cursor-pointer' : 'bg-surface-2/30 border-[hsl(var(--border)/0.3)] cursor-not-allowed opacity-40'
              )}
            >
              <FileDown className={cn('w-4 h-4 transition-colors', enabled ? 'text-muted-foreground group-hover:text-[hsl(var(--neon-purple))]' : 'text-muted-foreground/40')} />
              <span className={cn('text-[11px] font-bold tracking-wide', enabled ? 'text-foreground' : 'text-muted-foreground/40')}>{format.label}</span>
              <span className="text-[9px] text-muted-foreground/60 leading-tight hidden sm:block">{format.description}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
