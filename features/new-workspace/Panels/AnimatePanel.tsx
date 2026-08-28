import React, { useRef, useEffect } from 'react';
import { 
  Activity, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Upload, 
  Sparkles,
  Layers
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const AnimatePanel: React.FC = () => {
  const { 
    animateSettings, 
    setAnimateSettings, 
    runAnimateGeneration, 
    isExecuting,
    isPlaying,
    setIsPlaying,
    currentFrame,
    setCurrentFrame,
    totalFrames,
    fps,
    tracks,
    systemStats
  } = useWorkspace();

  const totalFramesRef = useRef(totalFrames);
  useEffect(() => { totalFramesRef.current = totalFrames; }, [totalFrames]);

  const presets = [
    { id: 'idle', label: 'Idle Breathing' },
    { id: 'walk', label: 'Walk Forward' },
    { id: 'run', label: 'Run Sprint' },
    { id: 'combat', label: 'Combat Slash' },
    { id: 'jump', label: 'Jump Land' },
    { id: 'dance', label: 'Victory Dance' },
    { id: 'wave', label: 'Wave Hello' }
  ] as const;

  // Animation playback: advance frames when playing
  React.useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = 1000 / (fps * (animateSettings.speed || 1));
    const interval = setInterval(() => {
      setCurrentFrame(prev => {
        const total = totalFramesRef.current;
        if (total === 0) return prev;
        if (prev >= total) {
          setIsPlaying(false);
          return 0;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => clearInterval(interval);
  }, [isPlaying, fps, animateSettings.speed, setCurrentFrame, setIsPlaying]);

  return (
    <div id="panel-animate" className="flex flex-col h-full overflow-y-auto px-3 py-3 space-y-3 text-xs select-none">
      {/* Title Header */}
      <div className="flex items-center gap-2 pb-1">
        <Activity className="w-4 h-4 text-[#f5c518]" />
        <h2 className="text-xs font-bold text-[#f3f4f6]">Animate</h2>
      </div>

      {/* Animation Types */}
      <div className="grid grid-cols-3 p-1 rounded-xl bg-[#111216] border border-[#232731]">
        {(['presets', 'text-to-motion', 'upload'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setAnimateSettings(prev => ({ ...prev, type: t }))}
            className={`py-2 rounded-lg font-medium capitalize transition-all ${
              animateSettings.type === t
                ? 'bg-[#232732] text-[#f5c518] shadow-sm font-semibold'
                : 'text-[#9ca3af] hover:text-[#e5e7eb]'
            }`}
          >
            {t === 'text-to-motion' ? 'Text 2 Motion' : t}
          </button>
        ))}
      </div>

      {/* Preset Motions Grid */}
      {animateSettings.type === 'presets' && (
        <div className="space-y-1.5">
          <span className="font-medium text-[#cbd5e1]">Motion Presets</span>
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map((p) => {
              const active = animateSettings.preset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setAnimateSettings(prev => ({ ...prev, preset: p.id }))}
                  className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                    active 
                      ? 'bg-[#222733] border-[#f5c518] text-[#f5c518] shadow-md shadow-[#f5c518]/10' 
                      : 'bg-[#14161c] border-[#252834] text-[#9ca3af] hover:text-[#e5e7eb] hover:bg-[#1b1e26]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{p.label}</span>
                    {active && <Sparkles className="w-3 h-3 text-[#f5c518]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Text to Motion Prompt */}
      {animateSettings.type === 'text-to-motion' && (
        <div className="space-y-1.5">
          <span className="font-medium text-[#cbd5e1]">Motion Prompt</span>
          <textarea
            value={animateSettings.prompt}
            onChange={(e) => setAnimateSettings(prev => ({ ...prev, prompt: e.target.value }))}
            placeholder="E.g., crouching sneak and aggressive sword draw..."
            rows={3}
            className="w-full rounded-xl bg-[#111215] border border-[#262933] p-3 text-xs text-[#e5e7eb] focus:border-[#f5c518] outline-none resize-none"
          />
        </div>
      )}

      {/* Upload BVH / FBX */}
      {animateSettings.type === 'upload' && (
        <div className="space-y-1.5">
          <span className="font-medium text-[#cbd5e1]">Upload Motion Capture</span>
          <label className="flex flex-col items-center justify-center h-24 rounded-xl border border-dashed border-[#2f3442] hover:border-[#f5c518]/60 bg-[#14161b] hover:bg-[#181a22] cursor-pointer transition-colors p-3 text-center">
            <Upload className="w-5 h-5 text-[#9ca3af] mb-1" />
            <span className="text-[#e5e7eb] font-medium text-[11px]">Upload BVH or FBX mocap</span>
            <input type="file" accept=".bvh,.fbx" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setAnimateSettings(prev => ({ ...prev, mocapFile: file.name }));
            }} />
          </label>
        </div>
      )}

      {/* Motion Controls: Intensity & Speed */}
      <div className="space-y-3 pt-1">
        <div className="space-y-1">
          <div className="flex justify-between text-[#cbd5e1]">
            <span>Motion Intensity</span>
            <span className="font-mono text-[#f5c518]">{animateSettings.intensity.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="2.0"
            step="0.1"
            value={animateSettings.intensity}
            onChange={(e) => setAnimateSettings(prev => ({ ...prev, intensity: parseFloat(e.target.value) }))}
            className="w-full"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[#cbd5e1]">
            <span>Playback Speed</span>
            <span className="font-mono text-[#f5c518]">{animateSettings.speed.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="2.0"
            step="0.1"
            value={animateSettings.speed}
            onChange={(e) => setAnimateSettings(prev => ({ ...prev, speed: parseFloat(e.target.value) }))}
            className="w-full"
          />
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="pt-2">
        <button
          id="btn-action-generate-animation"
          onClick={runAnimateGeneration}
          disabled={isExecuting}
          className="w-full py-3 rounded-xl bg-[#f5c518] hover:bg-[#eab308] text-[#111216] font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#f5c518]/25 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Activity className="w-4 h-4" />
          <span>{isExecuting ? 'Synthesizing Motion...' : 'Generate Animation'}</span>
        </button>
      </div>

      {/* Interactive Animation Timeline Module */}
      <div className="pt-3 border-t border-[#232732] space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-[#e5e7eb] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#f5c518]" />
            Timeline & Tracks
          </span>
          <div className="flex items-center gap-2 font-mono text-[11px] text-[#8e95a5]">
            <span className="text-[#f5c518] font-bold">{currentFrame}</span> / {totalFrames} F ({fps} FPS)
          </div>
        </div>

        {systemStats.status !== 'online' && (
          <div className="p-2 rounded-lg bg-[#1a1214] border border-[#ef4444]/30 text-[10px] text-[#fca5a5]">
            Backend offline — timeline will populate after a successful animation generation.
          </div>
        )}

        {tracks.length === 0 && systemStats.status === 'online' && (
          <div className="p-2 rounded-lg bg-[#14161c] border border-[#232731] text-[10px] text-[#6b7280] text-center">
            No animation tracks yet — generate an animation to populate the timeline.
          </div>
        )}

        {/* Transport Controls */}
        <div className="flex items-center justify-center gap-2 p-1.5 rounded-xl bg-[#111216] border border-[#232731]">
          <button
            onClick={() => setCurrentFrame(0)}
            disabled={totalFrames === 0}
            className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#20232c] disabled:opacity-40"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={totalFrames === 0}
            className={`px-4 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all disabled:opacity-40 ${
              isPlaying ? 'bg-[#ef4444] text-white' : 'bg-[#f5c518] text-[#111216]'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
          <button
            onClick={() => setCurrentFrame(totalFrames)}
            disabled={totalFrames === 0}
            className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#20232c] disabled:opacity-40"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scrub Slider */}
        <input
          type="range"
          min="0"
          max={totalFrames || 100}
          value={currentFrame}
          onChange={(e) => setCurrentFrame(parseInt(e.target.value))}
          disabled={totalFrames === 0}
          className="w-full"
        />

        {/* Tracks List */}
        {tracks.length > 0 && (
          <div className="space-y-1 pt-1">
            {tracks.map((tr) => (
              <div key={tr.id} className="flex items-center justify-between p-1.5 rounded-lg bg-[#14161c] border border-[#232731]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tr.color }} />
                  <span className="text-[11px] text-[#cbd5e1]">{tr.name}</span>
                </div>
                <span className="text-[10px] text-[#6b7280] font-mono">{tr.keyframes.length} keys</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
