import React from 'react';
import { Bone, Sparkles, Upload, Wand2 } from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';

export const RiggingPanel: React.FC = () => {
  const {
    riggingSettings,
    setRiggingSettings,
    runRiggingGeneration,
    isExecuting,
    bones,
    selectedBoneId,
    setSelectedBoneId
  } = useWorkspace();

  return (
    <div id="panel-rigging" className="flex flex-col h-full overflow-y-auto px-4 py-3.5 space-y-4 text-xs select-none">
      <div className="flex items-center gap-2 pb-1">
        <Bone className="w-4 h-4 text-[#f5c518]" />
        <div>
          <h2 className="text-sm font-bold text-[#f3f4f6]">Rigging</h2>
          <p className="text-[10px] text-[#9ca3af]">Prepare the current mesh for skeletal animation.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 p-1 rounded-xl bg-[#111216] border border-[#232731]">
        {(['rigging', 'skinning'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setRiggingSettings(prev => ({ ...prev, tab }))}
            className={`py-2 rounded-lg font-semibold capitalize transition-all ${
              riggingSettings.tab === tab ? 'bg-[#f5c518] text-[#111216]' : 'text-[#8e95a5] hover:text-[#f3f4f6]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <span className="font-medium text-[#cbd5e1]">Rig Type</span>
        <div className="grid grid-cols-2 gap-1.5">
          {(['humanoid', 'quadruped'] as const).map(type => (
            <button
              key={type}
              onClick={() => setRiggingSettings(prev => ({ ...prev, rigType: type }))}
              className={`px-2 py-2.5 rounded-lg border text-[10px] font-medium capitalize transition-colors ${
                riggingSettings.rigType === type
                  ? 'bg-[#f5c518]/15 border-[#f5c518]/60 text-[#f5c518]'
                  : 'bg-[#181a20] border-[#282c37] text-[#cbd5e1] hover:border-[#f5c518]/30'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <button
        className="w-full py-3 rounded-xl bg-[#181a20] border border-[#282c37] text-[#cbd5e1] hover:border-[#f5c518]/40 flex items-center justify-center gap-2"
        type="button"
      >
        <Wand2 className="w-4 h-4 text-[#f5c518]" /> Auto Rig
      </button>

      <div className="p-3 rounded-xl bg-[#14161c] border border-[#232731] space-y-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-[#cbd5e1]">Bone detection</span>
          <input
            type="checkbox"
            checked={riggingSettings.bonesDetection}
            onChange={e => setRiggingSettings(prev => ({ ...prev, bonesDetection: e.target.checked }))}
            className="accent-[#f5c518]"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-[#cbd5e1]">Symmetry</span>
          <input
            type="checkbox"
            checked={riggingSettings.symmetry}
            onChange={e => setRiggingSettings(prev => ({ ...prev, symmetry: e.target.checked }))}
            className="accent-[#f5c518]"
          />
        </label>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[#cbd5e1]">Bone size</span>
            <span className="font-mono text-[#f5c518]">{riggingSettings.boneSize.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.25"
            max="2"
            step="0.05"
            value={riggingSettings.boneSize}
            onChange={e => setRiggingSettings(prev => ({ ...prev, boneSize: Number(e.target.value) }))}
            className="w-full accent-[#f5c518]"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[#cbd5e1]">Bone count</span>
            <span className="font-mono text-[#f5c518]">{riggingSettings.boneCount}</span>
          </div>
          <input
            type="range"
            min="12"
            max="96"
            step="1"
            value={riggingSettings.boneCount}
            onChange={e => setRiggingSettings(prev => ({ ...prev, boneCount: Number(e.target.value) }))}
            className="w-full accent-[#f5c518]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[#cbd5e1]">Bone hierarchy</span>
          <span className="text-[10px] text-[#6b7280]">{bones.length} bones</span>
        </div>
        <div className="rounded-xl border border-[#232731] bg-[#14161c] max-h-44 overflow-y-auto p-2 space-y-1">
          {bones.map(bone => (
            <button
              key={bone.id}
              onClick={() => setSelectedBoneId(bone.id)}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] transition-colors ${
                selectedBoneId === bone.id ? 'bg-[#f5c518]/15 text-[#f5c518]' : 'text-[#cbd5e1] hover:bg-[#1e222c]'
              }`}
            >
              {bone.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto space-y-2 pt-2">
        <button className="w-full py-2.5 rounded-xl bg-[#14161c] border border-[#252834] text-[#cbd5e1] hover:border-[#f5c518]/40 flex items-center justify-center gap-2">
          <Upload className="w-3.5 h-3.5" /> Reference / Rig File
        </button>
        <div className="text-[10px] text-[#6b7280] leading-relaxed">
          The rigging controls are prepared for a real generation workflow and do not simulate successful rig generation.
        </div>
        <button
          disabled={isExecuting}
          onClick={() => void runRiggingGeneration()}
          className="w-full py-3 rounded-xl bg-[#f5c518] hover:bg-[#eab308] disabled:opacity-50 text-[#111216] font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#f5c518]/20"
        >
          <Sparkles className="w-4 h-4" />
          Generate Rig
        </button>
      </div>
    </div>
  );
};
