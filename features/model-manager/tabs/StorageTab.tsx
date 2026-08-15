"use client";

import React from 'react';
import { HardDrive } from 'lucide-react';

export function StorageTab({ models }: { models: any[] }) {
  const installed = models.filter(m => m.installed);
  const totalSize = installed.reduce((acc, m) => acc + (m.size_estimate_gb || (m.size_mb / 1000)), 0);

  return (
    <div className="space-y-6">
      <div className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]/[0.3] rounded-xl p-8 flex flex-col items-center justify-center">
        <HardDrive className="w-12 h-12 text-[hsl(var(--foreground))]/30 mb-4" />
        <h3 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-2">{totalSize.toFixed(1)} GB Used</h3>
        <p className="text-[hsl(var(--foreground))]/50">By installed model weights and environments</p>
      </div>

      <div className="bg-[hsl(var(--surface-2))] border border-[hsl(var(--border))]/[0.3] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[hsl(var(--border))]/[0.3] bg-[hsl(var(--surface-2))]/[0.02]">
          <h4 className="font-medium text-[hsl(var(--foreground))]">Storage Breakdown</h4>
        </div>
        <div className="divide-y divide-white/10">
          {installed.length === 0 ? (
            <div className="p-6 text-center text-[hsl(var(--foreground))]/50">No models installed.</div>
          ) : (
            installed.map(m => (
              <div key={m.id} className="p-4 px-6 flex justify-between items-center">
                <div>
                  <h5 className="font-medium text-[hsl(var(--foreground))]">{m.label}</h5>
                  <p className="text-xs text-[hsl(var(--foreground))]/50">{m.category}</p>
                </div>
                <div className="text-right">
                  <span className="font-medium text-[hsl(var(--foreground))]">{(m.size_estimate_gb || (m.size_mb / 1000)).toFixed(1)} GB</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
