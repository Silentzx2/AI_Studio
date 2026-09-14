'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  MousePointer,
  Move,
  RotateCw,
  Maximize,
  Bone,
  Brush,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  ChevronDown,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Lock,
  Eye,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { MeshViewer } from '../Viewport/MeshViewer';
import { useWorkspace } from '../store/WorkspaceContext';
import { useAnimationStore, ViewportGizmoTool } from '@/stores/useAnimationStore';
import { SimpleTooltip } from '@/components/ui/simple-tooltip';

export const AnimationViewportStage: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const { currentAsset } = useWorkspace();
  const {
    activeViewportTool,
    setActiveViewportTool,
    isPlaying,
    togglePlay,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    duration,
    fps,
    setFps,
    timeFormat,
    setTimeFormat,
    timelineZoom,
    setTimelineZoom,
    tracks,
    rigStatus,
    activeMode,
    selectedBone,
    setSelectedBone,
    setRigStatus,
    isPlacingBone,
    setIsPlacingBone,
  } = useAnimationStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [fpsDropdownOpen, setFpsDropdownOpen] = useState(false);

  // Playback timer effect for NLA Timeline
  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      const { currentTime, duration, isLooping, playbackSpeed } = useAnimationStore.getState();
      let next = currentTime + delta * playbackSpeed;
      if (next >= duration) {
        if (isLooping) {
          next = 0;
        } else {
          next = duration;
          setIsPlaying(false);
        }
      }
      setCurrentTime(next);

      if (useAnimationStore.getState().isPlaying) {
        animId = requestAnimationFrame(loop);
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, setIsPlaying, setCurrentTime]);

  // Handle Timeline Scrubbing
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    handleTimelineScrub(e);
  };

  const handleTimelineScrub = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const progress = x / rect.width;
      const newTime = progress * duration;
      setCurrentTime(newTime);
    },
    [duration, setCurrentTime]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isScrubbing) handleTimelineScrub(e);
    };
    const onMouseUp = () => setIsScrubbing(false);

    if (isScrubbing) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isScrubbing, handleTimelineScrub]);

  // Format time readout
  const formatTime = (seconds: number) => {
    if (timeFormat === 'frames') {
      return `F ${Math.round(seconds * fps)}`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
  };

  const currentScrubPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex-1 h-full flex flex-col min-w-0 bg-[#0F1014] overflow-hidden select-none">
      {/* 3D VIEWPORT CANVAS AREA (Reuses shared MeshViewer) */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-[#16181D]">
        <MeshViewer showOverlayUI={false} className="w-full h-full" />

        {/* RIGGING WORKSPACE TOP TOOLBAR (Visible in Rigging mode) */}
        {activeMode === 'rigging' && (
          <div className="absolute top-3 left-16 right-16 z-10 flex items-center justify-between pointer-events-none">
            {/* Rigging Status Badge */}
            <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 bg-[#121418]/95 backdrop-blur-md border border-[#F9CF00]/30 rounded-xl shadow-lg">
              <Bone className="w-4 h-4 text-[#F9CF00]" />
              <div className="flex flex-col">
                <span className="text-[9px] font-black tracking-wider text-[#F9CF00] uppercase">Rigging Workspace</span>
                <span className="text-[11px] font-bold text-white">Humanoid Biped (17 Joints)</span>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="pointer-events-auto flex items-center gap-1.5 p-1 bg-[#121418]/95 backdrop-blur-md border border-white/[0.08] rounded-xl shadow-lg">
              <button
                onClick={() => {
                  toast.success('Armature auto-fitted to character bounds', {
                    description: 'Bone lengths and joint positions aligned with mesh volume',
                  });
                }}
                className="px-2.5 py-1 rounded-lg bg-[#1C1F26] hover:bg-[#252933] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 border border-white/[0.06] transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Auto-Fit Rig</span>
              </button>

              <div className="h-4 w-px bg-white/10" />

              <div className="px-2 py-1 rounded-lg bg-[#1C1F26] text-emerald-400 text-xs font-semibold flex items-center gap-1 border border-white/[0.06]">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>X-Mirror: ON</span>
              </div>

              <div className="h-4 w-px bg-white/10" />

              <button
                onClick={() => {
                  setRigStatus('rigged');
                  toast.success('Skinning Complete (Auto-Weights)', {
                    description: 'Heat diffusion weights calculated for 17 deforming bones',
                  });
                }}
                className="px-3 py-1 rounded-lg bg-[#F9CF00] hover:bg-[#ffe033] text-black text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Bind Skin</span>
              </button>
            </div>

            {/* Active Bone Pill */}
            <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 bg-[#121418]/95 backdrop-blur-md border border-white/[0.08] rounded-xl shadow-lg">
              <span className="text-[10px] text-zinc-400 font-semibold uppercase">Active Joint:</span>
              <span className="text-xs font-bold text-[#F9CF00] font-mono">
                {selectedBone || 'Click joint in 3D'}
              </span>
            </div>
          </div>
        )}

        {/* CLICK TO PLACE BONE PROMPT BANNER */}
        {isPlacingBone && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-3 px-4 py-2 bg-[#121418]/95 backdrop-blur-md border border-[#F9CF00] rounded-xl shadow-2xl animate-pulse">
            <Bone className="w-4 h-4 text-[#F9CF00]" />
            <span className="text-xs text-white font-medium">
              Click anywhere on the 3D model surface to place joint node{' '}
              <span className="font-mono text-[#F9CF00]">↳ Parent: {selectedBone || 'Hips (Root)'}</span>
            </span>
            <button
              onClick={() => {
                setIsPlacingBone(false);
                setActiveViewportTool('select');
              }}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {/* LEFT VIEWPORT TOOL STRIP */}
        <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 p-1 bg-[#16181D]/90 backdrop-blur-md border border-white/[0.08] rounded-xl shadow-xl">
          {[
            { id: 'select', icon: <MousePointer className="w-4 h-4" />, label: 'Select (Q)' },
            { id: 'move', icon: <Move className="w-4 h-4" />, label: 'Move (W)' },
            { id: 'rotate', icon: <RotateCw className="w-4 h-4" />, label: 'Rotate (E)' },
            { id: 'scale', icon: <Maximize className="w-4 h-4" />, label: 'Scale (R)' },
            { id: 'bone', icon: <Bone className="w-4 h-4" />, label: 'Bone Tool (B)' },
            { id: 'weight', icon: <Brush className="w-4 h-4" />, label: 'Paint Weights (P)' },
          ].map((tool) => {
            const isActive = activeViewportTool === tool.id || (tool.id === 'bone' && isPlacingBone);
            return (
              <SimpleTooltip key={tool.id} side="right" label={tool.label}>
                <button
                  onClick={() => {
                    setActiveViewportTool(tool.id as ViewportGizmoTool);
                    if (tool.id === 'bone') {
                      setIsPlacingBone(true);
                      toast.info('Click on 3D character to place joint node');
                    } else {
                      setIsPlacingBone(false);
                    }
                  }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#F9CF00] text-black shadow-md'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  {tool.icon}
                </button>
              </SimpleTooltip>
            );
          })}
        </div>

        {/* TOP RIGHT FULLSCREEN TOGGLE */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <SimpleTooltip label="Toggle Fullscreen">
            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  containerRef.current?.requestFullscreen?.();
                  setIsFullscreen(true);
                } else {
                  document.exitFullscreen?.();
                  setIsFullscreen(false);
                }
              }}
              className="p-2 rounded-xl bg-[#16181D]/90 backdrop-blur-md border border-white/[0.08] text-zinc-400 hover:text-white transition-all cursor-pointer shadow-md"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </SimpleTooltip>
        </div>

        {/* RIGGING VISUAL LEGEND (Visible in Rigging mode) */}
        {activeMode === 'rigging' && (
          <div className="absolute bottom-3 right-3 z-10 pointer-events-none">
            <div className="px-3 py-1.5 bg-[#121418]/90 backdrop-blur-md border border-white/[0.08] rounded-xl flex items-center gap-3 text-[10px] font-semibold text-zinc-300 shadow-lg">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#00F5D4]" /> Joint Node
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-0.5 bg-[#F9CF00]" /> Bone Armature
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#F9CF00] ring-2 ring-[#F9CF00]/40" /> Selected
              </span>
            </div>
          </div>
        )}

        {/* ACTIVE RIG STATUS PILL (Floating Bottom-Left above Timeline) */}
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
          <div className="px-3 py-1 bg-[#121418]/90 backdrop-blur-md border border-white/[0.08] rounded-full flex items-center gap-2 shadow-lg">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-zinc-300">
              {rigStatus === 'rigged' ? 'Humanoid Biped Rig Active' : 'Unrigged Mesh Target'}
            </span>
          </div>
        </div>
      </div>

      {/* MULTI-TRACK NLA TIMELINE (Docked at Bottom of Viewport) */}
      <div className="h-[160px] bg-[#121418] border-t border-white/[0.08] flex flex-col flex-shrink-0">
        {/* Playback Control Bar */}
        <div className="h-9 px-3 bg-[#16181D] border-b border-white/[0.06] flex items-center justify-between">
          {/* Left: Transport Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentTime(0)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label="Skip to start"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={togglePlay}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                isPlaying
                  ? 'bg-[#F9CF00] text-black font-bold shadow-[0_0_12px_rgba(249,207,0,0.3)]'
                  : 'bg-[#22252C] text-white hover:bg-[#2C3038]'
              }`}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentTime(0);
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label="Stop"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentTime(duration)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label="Skip to end"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Time / Duration Readout */}
            <div className="ml-3 font-mono text-xs font-bold text-zinc-200 bg-[#0F1014] px-2.5 py-1 rounded-md border border-white/[0.06]">
              <span className="text-[#F9CF00]">{formatTime(currentTime)}</span>
              <span className="text-zinc-600 mx-1.5">/</span>
              <span className="text-zinc-400">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right: Timeline Settings (FPS, Time Format, Zoom) */}
          <div className="flex items-center gap-3">
            {/* FPS Selector */}
            <div className="relative">
              <button
                onClick={() => setFpsDropdownOpen(!fpsDropdownOpen)}
                className="flex items-center gap-1 text-[11px] font-semibold text-zinc-300 hover:text-white px-2 py-1 rounded-md bg-[#1E2129] border border-white/[0.06] cursor-pointer"
              >
                <span>{fps} FPS</span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>
              {fpsDropdownOpen && (
                <div className="absolute right-0 bottom-full mb-1 w-24 bg-[#1E2129] border border-white/[0.1] rounded-lg shadow-xl p-1 z-30">
                  {[20, 24, 30, 60].map((f) => (
                    <button
                      key={f}
                      onClick={() => {
                        setFps(f);
                        setFpsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                        fps === f ? 'bg-[#F9CF00] text-black font-bold' : 'text-zinc-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      {f} FPS
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Time / Frames toggle */}
            <button
              onClick={() => setTimeFormat(timeFormat === 'time' ? 'frames' : 'time')}
              className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded bg-[#1E2129] border border-white/[0.06] cursor-pointer"
            >
              {timeFormat === 'time' ? 'Time' : 'Frames'}
            </button>

            {/* Zoom Slider */}
            <div className="flex items-center gap-1.5">
              <ZoomOut className="w-3 h-3 text-zinc-500" />
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={timelineZoom}
                onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
                className="w-16 h-1 bg-[#282B33] rounded-lg appearance-none cursor-pointer accent-[#F9CF00]"
              />
              <ZoomIn className="w-3 h-3 text-zinc-500" />
            </div>
          </div>
        </div>

        {/* Tracks Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Track Headers Column */}
          <div className="w-36 bg-[#14161B] border-r border-white/[0.06] flex flex-col divide-y divide-white/[0.04] text-[11px]">
            <div className="h-6 px-3 flex items-center font-bold text-zinc-500 text-[10px] uppercase">
              Tracks
            </div>
            {tracks.map((track) => (
              <div
                key={track.id}
                className="h-6 px-3 flex items-center justify-between text-zinc-300 hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: track.color }} />
                  <span className="truncate font-medium">{track.name}</span>
                </div>
                <div className="flex items-center gap-1 text-zinc-600 opacity-60 hover:opacity-100">
                  <Eye className="w-2.5 h-2.5 cursor-pointer hover:text-white" />
                  <Lock className="w-2.5 h-2.5 cursor-pointer hover:text-white" />
                </div>
              </div>
            ))}
          </div>

          {/* Timeline Ruler & Lanes (Scrubber) */}
          <div
            ref={timelineRef}
            onMouseDown={handleTimelineMouseDown}
            className="flex-1 relative overflow-x-hidden overflow-y-auto cursor-crosshair divide-y divide-white/[0.04]"
          >
            {/* Time Ruler */}
            <div className="h-6 bg-[#16181D] relative border-b border-white/[0.06]">
              {Array.from({ length: 11 }).map((_, i) => {
                const sec = (i * 0.25).toFixed(2);
                const pct = (parseFloat(sec) / duration) * 100;
                if (pct > 100) return null;
                return (
                  <div
                    key={sec}
                    style={{ left: `${pct}%` }}
                    className="absolute top-0 bottom-0 flex flex-col justify-between border-l border-white/[0.1] pl-1 pointer-events-none"
                  >
                    <span className="text-[9px] font-mono text-zinc-500">{sec}s</span>
                    <div className="w-px h-1.5 bg-white/[0.15]" />
                  </div>
                );
              })}
            </div>

            {/* Lanes for each track */}
            {tracks.map((track) => {
              let clipBg = 'bg-blue-600/25 border-blue-500/40 text-blue-300';
              let clipLabel = '';
              let clipWidth = '100%';
              if (track.name === 'Character') {
                clipBg = 'bg-purple-600/35 border-purple-500/50 text-purple-200';
                clipLabel = 'Motion Track';
                clipWidth = '95%';
              } else if (track.name === 'Body') {
                clipBg = 'bg-blue-600/30 border-blue-500/40 text-blue-200';
                clipWidth = '80%';
              } else if (track.name === 'Arms') {
                clipBg = 'bg-emerald-600/30 border-emerald-500/40 text-emerald-200';
                clipWidth = '75%';
              } else if (track.name === 'Legs') {
                clipBg = 'bg-teal-600/30 border-teal-500/40 text-teal-200';
                clipWidth = '90%';
              } else if (track.name === 'Face') {
                clipBg = 'bg-amber-600/30 border-amber-500/40 text-amber-200';
                clipWidth = '40%';
              } else if (track.name === 'Root') {
                clipBg = 'bg-sky-600/25 border-sky-500/40 text-sky-200';
                clipWidth = '85%';
              } else if (track.name === 'IK') {
                clipBg = 'bg-rose-600/25 border-rose-500/40 text-rose-200';
                clipWidth = '90%';
              }

              return (
                <div key={track.id} className="h-6 relative bg-[#121418] hover:bg-white/[0.01]">
                  <div
                    style={{ left: '0%', width: clipWidth }}
                    className={`absolute top-1 bottom-1 rounded-md border flex items-center px-2 pointer-events-none transition-all ${clipBg}`}
                  >
                    {clipLabel && (
                      <span className="text-[10px] font-bold truncate">
                        {clipLabel}
                      </span>
                    )}
                  </div>

                  {track.keyframeTimes.map((time) => {
                    const pct = duration > 0 ? (time / duration) * 100 : 0;
                    return (
                      <div
                        key={time}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border border-white shadow-sm transition-transform hover:scale-150 cursor-pointer z-10"
                        style={{
                          left: `${pct}%`,
                          backgroundColor: track.color || '#F9CF00',
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}

            {/* Vertical Playhead Scrubber Line */}
            <div
              style={{ left: `${currentScrubPercent}%` }}
              className="absolute top-0 bottom-0 w-0.5 bg-[#F9CF00] z-20 pointer-events-none shadow-[0_0_8px_rgba(249,207,0,0.8)]"
            >
              <div className="w-3.5 h-3.5 -ml-[6px] -mt-1 bg-[#F9CF00] rounded-sm rotate-45 flex items-center justify-center shadow-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
