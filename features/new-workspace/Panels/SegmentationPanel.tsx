import React from 'react';
import { Layers3, Sparkles, MousePointer2, Wand2, AlertCircle } from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const SegmentationPanel: React.FC = () => {
  const {
    segmentationSettings,
    setSegmentationSettings,
    runSegmentationGeneration,
    isExecuting,
    currentAsset,
    systemStats
  } = useWorkspace();

  const parts = ['Whole Character', 'Head', 'Torso', 'Left Arm', 'Right Arm', 'Legs', 'Accessory'];

  return (
    <div id="panel-segmentation" className="flex flex-col h-full overflow-y-auto px-3 py-3 space-y-3 text-xs select-none">
      <div className="flex items-center gap-2 pb-1">
        <Layers3 className="w-4 h-4 text-[#f5c518]" />
        <div>
          <h2 className="text-xs font-bold text-[#f3f4f6]">Segmentation</h2>
          <p className="text-[10px] text-[#9ca3af]">Isolate editable regions from the selected mesh.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 p-1 rounded-xl bg-[#111216] border border-[#232731]">
        {(['auto', 'manual'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setSegmentationSettings(prev => ({ ...prev, mode }))}
            className={`py-2 rounded-lg font-semibold capitalize transition-all ${
              segmentationSettings.mode === mode ? 'bg-[#f5c518] text-[#111216]' : 'text-[#8e95a5] hover:text-[#f3f4f6]'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {systemStats.status !== 'online' && (
        <div className="p-2.5 rounded-xl bg-[#1a1214] border border-[#ef4444]/30 text-[10px] text-[#fca5a5] flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Backend offline — segmentation requires a running FastAPI server.</span>
        </div>
      )}

      <div className="space-y-2">
        <span className="font-medium text-[#cbd5e1]">Target</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(['full', 'character', 'part'] as const).map(target => (
            <button
              key={target}
              onClick={() => setSegmentationSettings(prev => ({ ...prev, target }))}
              className={`px-2 py-2 rounded-lg border text-[10px] font-medium capitalize transition-colors ${
                segmentationSettings.target === target
                  ? 'bg-[#f5c518]/15 border-[#f5c518]/60 text-[#f5c518]'
                  : 'bg-[#181a20] border-[#282c37] text-[#cbd5e1] hover:border-[#f5c518]/30'
              }`}
            >
              {target === 'full' ? 'Full Mesh' : target}
            </button>
          ))}
        </div>
      </div>

      {segmentationSettings.target === 'part' && (
        <div className="space-y-2">
          <span className="font-medium text-[#cbd5e1]">Selected Part</span>
          <select
            value={segmentationSettings.selectedPart}
            onChange={e => setSegmentationSettings(prev => ({ ...prev, selectedPart: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-[#181a20] border border-[#282c37] text-[#e5e7eb] outline-none focus:border-[#f5c518]"
          >
            {parts.map(part => <option key={part}>{part}</option>)}
          </select>
        </div>
      )}

      <div className="p-3 rounded-xl bg-[#14161c] border border-[#232731] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[#9ca3af]">Current asset</span>
          <span className="text-[#f5c518] font-mono truncate max-w-[150px]">{currentAsset?.name ?? 'Unavailable'}</span>
        </div>
        <label className="flex items-center justify-between gap-3">
          <span className="text-[#cbd5e1]">Preserve textures</span>
          <input
            type="checkbox"
            checked={segmentationSettings.preserveTextures}
            onChange={e => setSegmentationSettings(prev => ({ ...prev, preserveTextures: e.target.checked }))}
            className="accent-[#f5c518]"
          />
        </label>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[#cbd5e1]">Mask feather</span>
            <span className="font-mono text-[#f5c518]">{segmentationSettings.feather.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="0.5"
            step="0.01"
            value={segmentationSettings.feather}
            onChange={e => setSegmentationSettings(prev => ({ ...prev, feather: Number(e.target.value) }))}
            className="w-full accent-[#f5c518]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button className="py-2.5 rounded-xl bg-[#14161c] border border-[#252834] text-[#cbd5e1] hover:border-[#f5c518]/40 flex items-center justify-center gap-2">
          <MousePointer2 className="w-3.5 h-3.5" /> Select
        </button>
        <button className="py-2.5 rounded-xl bg-[#14161c] border border-[#252834] text-[#cbd5e1] hover:border-[#f5c518]/40 flex items-center justify-center gap-2">
          <Wand2 className="w-3.5 h-3.5" /> Auto Select
        </button>
      </div>

      <div className="mt-auto space-y-2 pt-2">
        {systemStats.status !== 'online' && (
          <div className="text-[10px] text-[#6b7280] leading-relaxed">
            Connect to a running FastAPI backend to run segmentation workflows.
          </div>
        )}
        <button
          disabled={isExecuting || systemStats.status !== 'online'}
          onClick={() => void runSegmentationGeneration()}
          className="w-full py-3 rounded-xl bg-[#f5c518] hover:bg-[#eab308] disabled:opacity-50 text-[#111216] font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#f5c518]/20"
        >
          <Sparkles className="w-4 h-4" />
          Segment Mesh
        </button>
      </div>
    </div>
  );
};
