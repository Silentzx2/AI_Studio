"use client";

import React, { useState, useEffect } from 'react';
import { Play, Pause, Trash2, Download, CheckCircle } from 'lucide-react';
import { RippleButton, SlidingNumber } from '@/components/animate-ui';

export function ModelCard({ model, onAction }: { model: any, onAction: (id: string, action: string) => void }) {
  const [progress, setProgress] = useState<number>(model.download_progress?.percent ?? model.progress ?? 0);
  const [status, setStatus] = useState(model.download_progress?.status ?? model.status);

  useEffect(() => {
    if (model.status === 'downloading' || status === 'downloading' || status === 'starting') {
      const evtSource = new EventSource(`/api/v1/admin/install/stream/${model.id}`);
      evtSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        // Backend sends percent as 0-100 (not a fraction); use it directly.
        setProgress(data.percent ?? data.progress ?? 0);
        setStatus(data.status);
        if (data.status === 'completed' || data.status === 'failed') {
          evtSource.close();
          onAction(model.id, 'refresh');
        }
      };
      return () => evtSource.close();
    }
  }, [model.status, model.id, status, onAction]);

  return (
    <div className="bg-[#14161A] border border-white/[0.08] hover:border-white/[0.16] rounded-xl p-5 flex flex-col gap-4 transition-all duration-200 shadow-sm">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-lg text-white mb-1">{model.label}</h3>
          <p className="text-sm text-zinc-400 mb-2">{model.name}</p>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white/[0.06] text-zinc-300">
            {model.category}
          </span>
        </div>
        {model.installed ? (
          <CheckCircle className="w-5 h-5 text-emerald-400" />
        ) : (
          <Download className="w-5 h-5 text-zinc-500" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm text-zinc-400 mb-2">
        <div className="flex flex-col">
          <span className="text-zinc-500 text-xs">Size</span>
          <span className="text-zinc-200 font-mono text-xs">{model.size_estimate_gb || (model.size_mb ? (model.size_mb / 1000).toFixed(1) : '0.0')} GB</span>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500 text-xs">VRAM Req.</span>
          <span className="text-zinc-200 font-mono text-xs">{model.vram_required_mb ? (model.vram_required_mb / 1024).toFixed(1) : '0.0'} GB</span>
        </div>
      </div>

      {/* Show progress during any active install phase */}
      {(status === 'downloading' || status === 'starting' || status === 'installing') && (
        <div className="space-y-2 mt-auto">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>
              {status === 'starting' ? 'Starting installation…'
               : status === 'installing' ? 'Installing dependencies…'
               : 'Downloading…'}
            </span>
            <div className="flex items-center gap-0.5 text-zinc-200 font-mono">
              <SlidingNumber value={Math.round(progress)} />
              <span>%</span>
            </div>
          </div>
          <div className="w-full bg-[#0D0E10] rounded-full h-1.5 overflow-hidden">
            <div className="bg-[#F9CF00] h-1.5 rounded-full transition-all duration-300"
                 style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}></div>
          </div>
        </div>
      )}

      <div className="mt-auto flex gap-2">
        {!model.installed && status !== 'downloading' && (
          <RippleButton 
            onClick={() => onAction(model.id, 'install')}
            variant="primary"
            className="flex-1 h-9 text-xs"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Install
          </RippleButton>
        )}
        
        {model.installed && (
          <>
            {model.loaded ? (
              <RippleButton 
                onClick={() => onAction(model.id, 'unload')}
                variant="secondary"
                className="flex-1 h-9 text-xs text-amber-300 border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20"
              >
                <Pause className="w-3.5 h-3.5 mr-1.5" /> Unload
              </RippleButton>
            ) : (
              <RippleButton 
                onClick={() => onAction(model.id, 'load')}
                variant="secondary"
                className="flex-1 h-9 text-xs text-emerald-400 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20"
              >
                <Play className="w-3.5 h-3.5 mr-1.5" /> Load
              </RippleButton>
            )}
            <RippleButton 
              onClick={() => onAction(model.id, 'uninstall')}
              variant="destructive"
              className="h-9 px-3 bg-red-950/40 text-red-400 border border-red-900/40 hover:bg-red-900/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </RippleButton>
          </>
        )}
      </div>
    </div>
  );
}
