'use client';

import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

type Status = 'loading' | 'online' | 'offline';

/**
 * Live backend connectivity indicator for the header. Polls /api/v1/runtime/health
 * so the user always knows whether the studio is talking to the engine (and
 * whether a GPU is available). ponytail: 20s poll, stop on unmount.
 */
export function BackendStatusPill() {
  const [status, setStatus] = useState<Status>('loading');
  const [gpu, setGpu] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch('/api/v1/runtime/health', { cache: 'no-store' });
        if (!res.ok) throw new Error('bad status');
        const json = await res.json();
        const data = json?.data ?? json;
        if (!alive) return;
        setStatus('online');
        setGpu(data?.gpu === undefined ? null : Boolean(data.gpu));
      } catch {
        if (!alive) return;
        setStatus('offline');
        setGpu(null);
      }
    };
    check();
    const id = setInterval(check, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const online = status === 'online';
  const offline = status === 'offline';
  const dot = online
    ? 'bg-[hsl(var(--neon-green))]'
    : offline
      ? 'bg-[hsl(var(--destructive))]'
      : 'bg-[hsl(var(--muted-foreground))]';

  return (
    <div
      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-[10px] font-bold uppercase tracking-wide shrink-0"
      title={online ? 'Backend connected' : offline ? 'Backend unreachable' : 'Checking backend…'}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', dot, online && 'animate-pulse')} />
      <Cpu size={12} className={online ? 'text-[hsl(var(--neon-green))]' : offline ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'} />
      <span className={online ? 'text-[hsl(var(--neon-green))]' : offline ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'}>
        {online ? 'Online' : offline ? 'Offline' : '…'}
      </span>
      {online && gpu !== null && (
        <span className="text-[hsl(var(--muted-foreground))] normal-case">
          · {gpu ? 'GPU' : 'CPU'}
        </span>
      )}
    </div>
  );
}
