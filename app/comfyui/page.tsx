'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TopHeader } from '@/features/new-workspace/Header/TopHeader';
import { LeftNavigation } from '@/features/new-workspace/Navigation/LeftNavigation';
import {
  ExternalLink,
  RefreshCw,
  Maximize2,
  Minimize2,
  Trash2,
  ArrowLeft,
  Activity,
  CheckCircle2,
  AlertCircle,
  Cpu,
} from 'lucide-react';

export default function ComfyUIPage() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [comfyUrl, setComfyUrl] = useState<string>('http://127.0.0.1:8188');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [isClearingVram, setIsClearingVram] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Dynamically resolve ComfyUI URL (same-origin proxy for HTTPS, local fallback for HTTP)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.location.protocol === 'https:') {
        // Same-origin reverse proxy avoids mixed content on HTTPS deployments
        setComfyUrl('/comfyui-frame');
      } else {
        const hostname = window.location.hostname || '127.0.0.1';
        setComfyUrl(`http://${hostname}:8188`);
      }
    }
  }, []);

  // Poll ComfyUI health check via backend system endpoint
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/system/info');
      if (res.ok) {
        const json = await res.json();
        const comfyStatus = json?.data?.comfyui?.status || json?.comfyui?.status;
        setIsConnected(comfyStatus === 'online' || comfyStatus === 'connected' || comfyStatus === 'ok');
        setSystemStats(json?.data?.comfyui || json?.comfyui || null);
      } else {
        // Direct probe fallback
        const directRes = await fetch(`${comfyUrl}/system_stats`, { signal: AbortSignal.timeout(3000) });
        if (directRes.ok) {
          const stats = await directRes.json();
          setIsConnected(true);
          setSystemStats(stats);
        } else {
          setIsConnected(false);
        }
      }
    } catch {
      setIsConnected(false);
    }
  }, [comfyUrl]);

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, 5000);
    return () => clearInterval(timer);
  }, [checkHealth]);

  const handleClearVram = async () => {
    setIsClearingVram(true);
    setActionNotice('Freeing VRAM and model caches...');
    try {
      const res = await fetch('/api/v1/runtime/clear-vram', { method: 'POST' });
      if (res.ok) {
        setActionNotice('VRAM and caches successfully cleared.');
      } else {
        setActionNotice('Failed to clear VRAM.');
      }
    } catch {
      setActionNotice('Error connecting to backend.');
    } finally {
      setIsClearingVram(false);
      setTimeout(() => setActionNotice(null), 3000);
      checkHealth();
    }
  };

  const handleReloadIframe = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
      setActionNotice('Reloading ComfyUI interface...');
      setTimeout(() => setActionNotice(null), 2000);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[hsl(var(--surface-0))] text-[#E0E2E8]">
      {/* Top Application Header */}
      {!isFullscreen && (
        <div className="flex-shrink-0 relative z-50">
          <TopHeader />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative bg-[hsl(var(--surface-1))]">
        {/* Left Navigation Rail */}
        {!isFullscreen && (
          <div className="z-30 h-full flex-shrink-0 relative hidden md:block">
            <LeftNavigation />
          </div>
        )}

        {/* Main ComfyUI Studio View */}
        <div ref={containerRef} className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950 relative">
          {/* Subheader Toolbar */}
          <div className="h-10 px-4 bg-[hsl(var(--surface-1))]/90 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between z-20 flex-shrink-0 select-none">
            {/* Left Info & Status */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/workspace')}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-2 py-1 rounded-md hover:bg-white/[0.06] transition-colors"
                title="Return to 3D Workspace"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-medium">Studio</span>
              </button>

              <div className="h-3.5 w-px bg-white/[0.1]" />

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-primary" />
                  ComfyUI Engine
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    isConnected
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}
                  />
                  {isConnected ? 'Connected' : 'Connecting...'}
                </span>
              </div>

              {actionNotice && (
                <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded border border-primary/20 animate-in fade-in">
                  {actionNotice}
                </span>
              )}
            </div>

            {/* Right Action Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleClearVram}
                disabled={isClearingVram}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300 hover:text-white transition-all active:scale-95 disabled:opacity-50"
                title="Clear VRAM and unloaded model memory"
              >
                <Trash2 className={`w-3.5 h-3.5 text-amber-400 ${isClearingVram ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Free VRAM</span>
              </button>

              <button
                onClick={handleReloadIframe}
                className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-white/[0.06] transition-colors active:scale-95"
                title="Reload ComfyUI interface"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              <a
                href={comfyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-white/[0.06] transition-colors"
                title="Open raw ComfyUI in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                onClick={toggleFullscreen}
                className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-white/[0.06] transition-colors active:scale-95"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Embedded ComfyUI Web Canvas */}
          <div className="flex-1 w-full h-full relative overflow-hidden bg-[#18181b]">
            <iframe
              ref={iframeRef}
              src={comfyUrl}
              title="ComfyUI Web Interface"
              className="w-full h-full border-0 absolute inset-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-modals allow-popups"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
