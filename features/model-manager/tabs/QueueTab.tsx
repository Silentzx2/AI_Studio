"use client";

import React, { useState } from 'react';
import { Activity, AlertTriangle, Wrench, Loader2, CheckCircle2 } from 'lucide-react';
import { adminService } from '@/services/adminService';
import { toast } from 'sonner';

export function QueueTab({ models }: { models: any[] }) {
  const [repairingIds, setRepairingIds] = useState<Record<string, boolean>>({});
  const [repairedIds, setRepairedIds] = useState<Record<string, boolean>>({});

  const downloading = models.filter(m => m.status === 'downloading');
  const failed = models.filter(m => m.status === 'failed' || m.status === 'error' || Boolean(m.error));

  const handleRepair = async (model: any) => {
    const key = model.id;
    setRepairingIds(prev => ({ ...prev, [key]: true }));

    toast.info(`Attempting repair for ${model.label || model.name || model.id}...`, {
      description: 'Re-initializing runtime environment and running preflight check.',
    });

    try {
      await adminService.repairProvider(model.id);
      setRepairedIds(prev => ({ ...prev, [key]: true }));
      toast.success(`${model.label || model.id} repair initiated`);
    } catch (err: any) {
      toast.error(`Repair failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setRepairingIds(prev => ({ ...prev, [key]: false }));
    }
  };

  if (downloading.length === 0 && failed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-[hsl(var(--surface-2))] rounded-xl border border-[hsl(var(--border))]/[0.3]">
        <Activity className="w-12 h-12 text-[hsl(var(--foreground))]/20 mb-4" />
        <h3 className="text-lg font-medium text-[hsl(var(--foreground))] mb-2">Queue Empty</h3>
        <p className="text-[hsl(var(--foreground))]/50 text-center max-w-sm">No models are currently downloading or installing. Check the Available Models tab to install new models.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Downloading queue */}
      {downloading.map(m => (
        <div key={m.id} className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]/[0.3] rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="font-medium text-[hsl(var(--foreground))]">{m.label}</h4>
              <p className="text-sm text-[hsl(var(--foreground))]/50">Downloading &amp; Extracting...</p>
            </div>
            <span className="text-[hsl(var(--neon-blue))] font-medium">{Math.round((m.progress || 0) * 100)}%</span>
          </div>
          <div className="w-full bg-[hsl(var(--surface-2))] rounded-full h-2">
            <div className="bg-[hsl(var(--neon-blue))] h-2 rounded-full transition-all" style={{ width: `${(m.progress || 0) * 100}%` }}></div>
          </div>
        </div>
      ))}

      {/* Failed / Error models requiring repair */}
      {failed.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--destructive))] flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Failed / Error Tasks ({failed.length})
          </h4>
          {failed.map(m => {
            const isRepairing = Boolean(repairingIds[m.id]);
            const isRepaired = Boolean(repairedIds[m.id]);

            return (
              <div key={m.id} className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--destructive)/0.3)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-[hsl(var(--foreground))] text-sm">{m.label || m.name || m.id}</h4>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]">
                      {m.status || 'failed'}
                    </span>
                  </div>
                  {m.error && (
                    <p className="text-xs text-[hsl(var(--destructive))] font-mono break-all">{m.error}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isRepaired && !isRepairing && (
                    <span className="text-xs text-[hsl(var(--neon-green))] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Repaired
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRepair(m)}
                    disabled={isRepairing}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[hsl(var(--destructive))] text-white hover:bg-[hsl(var(--destructive)/0.85)] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {isRepairing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Repairing...</span>
                      </>
                    ) : (
                      <>
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Try Repair</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
