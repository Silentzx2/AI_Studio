"use client";

import React, { useState, useEffect } from 'react';
import { Play, Pause, Trash2, Download, CheckCircle, AlertTriangle, Layers } from 'lucide-react';

export function ModelCard({ model, onAction }: { model: any, onAction: (id: string, action: string) => void }) {
  const [progress, setProgress] = useState(model.progress || 0);
  const [status, setStatus] = useState(model.status);

   
  useEffect(() => {
    if (model.status === 'downloading') {
      const evtSource = new EventSource(`/api/v1/admin/install/stream/${model.id}`);
      evtSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProgress(data.progress);
        setStatus(data.status);
        if (data.status === 'completed' || data.status === 'failed') {
          evtSource.close();
          onAction(model.id, 'refresh');
        }
      };
      return () => evtSource.close();
    }
  }, [model.status, model.id, onAction]);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-lg text-white mb-1">{model.label}</h3>
          <p className="text-sm text-white/50 mb-2">{model.name}</p>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white/10 text-white/80">
            {model.category}
          </span>
        </div>
        {model.installed ? (
          <CheckCircle className="w-5 h-5 text-green-400" />
        ) : (
          <Download className="w-5 h-5 text-white/40" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm text-white/60 mb-2">
        <div className="flex flex-col">
          <span className="text-white/40 text-xs">Size</span>
          <span>{model.size_estimate_gb || (model.size_mb / 1000).toFixed(1)} GB</span>
        </div>
        <div className="flex flex-col">
          <span className="text-white/40 text-xs">VRAM Req.</span>
          <span>{(model.vram_required_mb / 1024).toFixed(1)} GB</span>
        </div>
      </div>

      {status === 'downloading' && (
        <div className="space-y-2 mt-auto">
          <div className="flex justify-between text-xs text-white/60">
            <span>Downloading...</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progress * 100}%` }}></div>
          </div>
        </div>
      )}

      <div className="mt-auto flex gap-2">
        {!model.installed && status !== 'downloading' && (
          <button 
            onClick={() => onAction(model.id, 'install')}
            className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" /> Install
          </button>
        )}
        
        {model.installed && (
          <>
            {model.loaded ? (
              <button 
                onClick={() => onAction(model.id, 'unload')}
                className="flex-1 bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
              >
                <Pause className="w-4 h-4" /> Unload
              </button>
            ) : (
              <button 
                onClick={() => onAction(model.id, 'load')}
                className="flex-1 bg-green-500/20 text-green-400 hover:bg-green-500/30 py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" /> Load
              </button>
            )}
            <button 
              onClick={() => onAction(model.id, 'uninstall')}
              className="bg-red-500/10 text-red-500 hover:bg-red-500/20 p-2 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
