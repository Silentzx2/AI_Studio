"use client";

import React from 'react';
import { Activity } from 'lucide-react';

export function QueueTab({ models }: { models: any[] }) {
  const downloading = models.filter(m => m.status === 'downloading');

  if (downloading.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white/5 rounded-xl border border-white/10">
        <Activity className="w-12 h-12 text-white/20 mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">Queue Empty</h3>
        <p className="text-white/50 text-center max-w-sm">No models are currently downloading or installing. Check the Available Models tab to install new models.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {downloading.map(m => (
        <div key={m.id} className="bg-white/5 border border-white/10 rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="font-medium text-white">{m.label}</h4>
              <p className="text-sm text-white/50">Downloading & Extracting...</p>
            </div>
            <span className="text-blue-400 font-medium">{Math.round((m.progress || 0) * 100)}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(m.progress || 0) * 100}%` }}></div>
          </div>
        </div>
      ))}
    </div>
  );
}
