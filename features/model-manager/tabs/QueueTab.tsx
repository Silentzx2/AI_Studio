"use client";

import React from 'react';
import { Activity } from 'lucide-react';

export function QueueTab({ models }: { models: any[] }) {
  const downloading = models.filter(m => m.status === 'downloading');

  if (downloading.length === 0) {
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
      {downloading.map(m => (
        <div key={m.id} className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]/[0.3] rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="font-medium text-[hsl(var(--foreground))]">{m.label}</h4>
              <p className="text-sm text-[hsl(var(--foreground))]/50">Downloading & Extracting...</p>
            </div>
            <span className="text-[hsl(var(--neon-blue))] font-medium">{Math.round((m.progress || 0) * 100)}%</span>
          </div>
          <div className="w-full bg-[hsl(var(--surface-2))] rounded-full h-2">
            <div className="bg-[hsl(var(--neon-blue))] h-2 rounded-full transition-all" style={{ width: `${(m.progress || 0) * 100}%` }}></div>
          </div>
        </div>
      ))}
    </div>
  );
}
