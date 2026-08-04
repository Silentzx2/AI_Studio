"use client";


import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Play, ChevronRight, RefreshCw, Copy } from 'lucide-react';
import { GlassCard } from '@/components/premium/GlassCard';
import { Spinner } from '@/components/premium/Spinner';
import { adminService } from '@/services/adminService';
import { NeonButton } from '@/components/premium/NeonButton';
import type { TerminalCommand } from '@/types';
import { toast } from 'sonner';

const PRESET_COMMANDS = [
  { id: 'status', command: 'systemctl status ai-studio', description: 'Check service status' },
  { id: 'logs', command: 'journalctl -u ai-studio -f --no-pager', description: 'View live logs' },
  { id: 'gpu', command: 'nvidia-smi', description: 'GPU status' },
  { id: 'restart', command: 'systemctl restart ai-studio', description: 'Restart service' },
  { id: 'cache', command: 'redis-cli FLUSHALL', description: 'Clear Redis cache' },
  { id: 'disk', command: 'df -h', description: 'Check disk usage' },
  { id: 'docker', command: 'docker ps -a', description: 'List containers' },
  { id: 'workers', command: 'celery -A ai_studio inspect active', description: 'Check active workers' },
];

export function TerminalTab() {
  const [commands, setCommands] = useState<TerminalCommand[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const data = await adminService.commandHistory();
      if (data.length > 0) setCommands(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { setTimeout(() => loadHistory(), 0); }, [loadHistory]);

  useEffect(() => {
    terminalRef.current?.scrollTo(0, terminalRef.current.scrollHeight);
  }, [commands]);

  const runCommand = async (cmd: string) => {
    setRunning(true);
    setInput('');
    try {
      const result = await adminService.runCommand(cmd);
      setCommands((prev) => [...prev, result]);
    } catch (err) {
      const errorCmd: TerminalCommand = {
        // eslint-disable-next-line react-hooks/purity
        id: Math.random().toString(36).slice(2),
        command: cmd,
        output: `Error: ${err instanceof Error ? err.message : 'Command failed'}`,
        // eslint-disable-next-line react-hooks/purity
        timestamp: new Date().toISOString(),
        exit_code: 1,
      };
      setCommands((prev) => [...prev, errorCmd]);
      toast.error('Command execution failed');
    } finally {
      setRunning(false);
    }
  };

  const handleCopy = async () => {
    try {
      const textToCopy = commands.map(cmd => `$ ${cmd.command}\n${cmd.output}`).join('\n\n');
      await navigator.clipboard.writeText(textToCopy);
      toast.success('Terminal output copied to clipboard');
    } catch {
      toast.error('Failed to copy terminal output');
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Terminal</h1>
          <p className="text-sm text-muted-foreground mt-1">Execute system commands</p>
        </div>
        <div className="flex items-center gap-2">
          <NeonButton variant="secondary" size="sm" onClick={handleCopy} disabled={commands.length === 0}>
            <Copy className="w-3.5 h-3.5" /> Copy Output
          </NeonButton>
          <button onClick={loadHistory} className="p-2 rounded-xl glass border border-[hsl(var(--border)/0.5)] text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESET_COMMANDS.map((cmd) => (
          <button
            key={cmd.id}
            onClick={() => runCommand(cmd.command)}
            disabled={running}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass border border-[hsl(var(--border)/0.5)] text-xs text-muted-foreground hover:text-foreground hover:border-[hsl(var(--neon-purple)/0.3)] transition-all disabled:opacity-50"
          >
            <Play className="w-3 h-3" />
            {cmd.description}
          </button>
        ))}
      </div>

      <GlassCard className="p-0 overflow-hidden" delay={0.1}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--border)/0.3)] bg-surface-2/50">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--destructive))]/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--neon-amber))]/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--neon-green))]/60" />
          </div>
          <Terminal className="w-3.5 h-3.5 text-muted-foreground ml-2" />
          <span className="text-xs font-mono text-muted-foreground">admin@ai-studio:~$</span>
        </div>
        <div ref={terminalRef} className="max-h-[500px] min-h-[300px] overflow-y-auto scrollbar-thin font-mono p-4 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="md" />
            </div>
          ) : commands.length === 0 ? (
            <p className="text-xs text-muted-foreground/50">Type a command or select a preset above...</p>
          ) : (
            commands.map((cmd) => (
              <motion.div key={cmd.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs">
                <pre className="text-[hsl(var(--neon-purple))] whitespace-pre-wrap">$ {cmd.command}</pre>
                <pre className={cmd.exit_code === 0 ? 'text-muted-foreground whitespace-pre-wrap' : 'text-[hsl(var(--destructive))] whitespace-pre-wrap'}>{cmd.output}</pre>
              </motion.div>
            ))
          )}
          {running && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner size="sm" />
              <span>Executing...</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-[hsl(var(--border)/0.3)] bg-surface-2/50">
          <ChevronRight className="w-4 h-4 text-[hsl(var(--neon-purple))]" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && input.trim()) runCommand(input.trim()); }}
            placeholder="Type a command..."
            disabled={running}
            className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
        </div>
      </GlassCard>
    </div>
  );
}
