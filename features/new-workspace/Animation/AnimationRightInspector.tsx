'use client';

import React, { useState } from 'react';
import {
  Info,
  Move,
  Film,
  Sliders,
  Eye,
  Bone,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  GitBranch,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Layers,
  Wand2,
  Play,
} from 'lucide-react';
import { useWorkspace } from '../store/WorkspaceContext';
import { useAnimationStore, InspectorTab } from '@/stores/useAnimationStore';
import { useViewerStore } from '@/stores/useViewerStore';
import { toast } from 'sonner';

export const AnimationRightInspector: React.FC = () => {
  const { currentAsset, updateAssetProperties, selectAsset } = useWorkspace();
  const {
    inspectorTab,
    setInspectorTab,
    transform,
    setTransform,
    currentAnimationId,
    setCurrentAnimationId,
    animations,
    duration,
    fps,
    playbackSpeed,
    setPlaybackSpeed,
    isLooping,
    setIsLooping,
    hasRootMotion,
    setHasRootMotion,
    hasFootLock,
    setHasFootLock,
    displayOptions,
    toggleDisplayOption,
    rigStatus,
    setRigStatus,
    rigProfile,
    setRigProfile,
    rigOptions,
    setRigOptions,
    bones,
    selectedBone,
    setSelectedBone,
    boneRotations,
    setBoneRotation,
    resetPose,
    mirrorPose,
    isPlacingBone,
    setIsPlacingBone,
    addBone,
    deleteBone,
    updateBonePosition,
    updateBoneParent,
    updateBoneName,
    loadRigPreset,
    activeViewportTool,
    setActiveViewportTool,
    motionAiPrompt,
    setMotionAiPrompt,
    motionAiDuration,
    setMotionAiDuration,
    motionAiFps,
    setMotionAiFps,
    motionAiSeed,
    setMotionAiSeed,
    motionAiIsGenerating,
    setMotionAiIsGenerating,
    motionAiStage,
    setMotionAiStage,
    motionAiProgress,
    setMotionAiProgress,
    motionAiError,
    setMotionAiError,
    blendState,
    setBlendState,
    addAnimation,
    addKeyframeToTrack,
    currentTime,
    tracks,
    setIsPlaying,
  } = useAnimationStore();

  // Accordion collapsed state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    modelInfo: true,
    transform: true,
    animSettings: true,
    display: true,
    autoRig: true,
    manualRig: true,
    motionAi: true,
    poseEditor: true,
    mixer: true,
  });

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const activeClip = animations.find((a) => a.id === currentAnimationId) || animations[0];
  const activeBone = bones.find((b) => b.name === selectedBone) || null;

  // REAL AUTO RIG PIPELINE TRIGGER (Blender Rigify / clay.blender.ops.rig_asset)
  const handleRunAutoRig = async () => {
    setRigStatus('rigging');
    toast.info('Starting Auto-Rigging...', {
      description: `Analyzing mesh and generating ${rigProfile} skeleton in Blender`,
    });

    try {
      const sourceUrl = currentAsset?.source?.localUrl || currentAsset?.source?.viewUrl;
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'rigging',
          workspace: 'animation',
          source_mesh_url: sourceUrl || undefined,
          rig_type: rigProfile,
          options: rigOptions,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || 'Failed to initialize auto-rig job');
      }

      const postResult = await res.json();
      const jobId = postResult?.data?.job_id;

      if (!jobId) throw new Error('Auto-rig job was not created by the backend');
      let completedJob: any = null;
      for (let attempts = 0; attempts < 60; attempts++) {
        await new Promise((r) => setTimeout(r, 1200));
        const pollRes = await fetch(`/api/v1/generation/${jobId}/status`);
        if (!pollRes.ok) throw new Error(`Auto-rig status request failed (${pollRes.status})`);
        const pollData = await pollRes.json();
        const job = pollData?.data;
        if (!job?.status) throw new Error('Backend returned an invalid auto-rig status response');
        if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.error_message || `Auto-rig ${job.status}`);
        if (job.status === 'completed') { completedJob = job; break; }
      }
      if (!completedJob) throw new Error('Auto-rig timed out before the backend reported completion');
      const result = completedJob.result;
      const riggedUrl = result?.active_model_url || result?.model_url || result?.download_urls?.glb;
      if (!riggedUrl) throw new Error('Auto-rig completed without a rigged artifact URL');
      if (currentAsset) {
        updateAssetProperties(currentAsset.id, {
          source: {
            filename: currentAsset.source?.filename || `${currentAsset.name || 'model'}_rigged.glb`,
            subfolder: currentAsset.source?.subfolder || '',
            ...currentAsset.source,
            viewUrl: riggedUrl,
            localUrl: riggedUrl,
            type: currentAsset.source?.type || 'output',
          },
          tags: Array.from(new Set([...(currentAsset.tags || []), 'rigged', 'server-backed'])),
        });
        selectAsset(currentAsset.id);
      }
      setRigStatus('rigged');
      toast.success('Auto-Rigging Complete!', {
        description: `${rigProfile} rig validated • ${result?.rig_bones || result?.bones || 0} bones`,
      });
    } catch (err) {
      setRigStatus('failed');
      toast.error('Auto-Rigging failed', {
        description: err instanceof Error ? err.message : 'Unknown error during rigging',
      });
    }
  };

  // REAL ARDY MOTION GENERATION TRIGGER
  const handleGenerateMotion = async () => {
    if (!motionAiPrompt.trim()) {
      toast.error('Please enter a motion description');
      return;
    }

    setMotionAiIsGenerating(true);
    setMotionAiStage('Connecting to ARDY motion diffusion...');
    setMotionAiProgress(10);
    setMotionAiError(null);

    toast.info('Synthesizing motion with ARDY...', {
      description: motionAiPrompt,
    });

    try {
      const res = await fetch('/api/v1/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'animation',
          workspace: 'animation',
          provider: 'ardy',
          prompt: motionAiPrompt.trim(),
          duration: motionAiDuration,
          fps: motionAiFps,
          seed: motionAiSeed ?? undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || errJson?.message || 'Failed to submit motion generation');
      }

      const postResult = await res.json();
      const jobId = postResult?.data?.job_id;

      if (!jobId) throw new Error('Motion job was not created by the backend');
      let completedJob: any = null;
      for (let attempts = 0; attempts < 60; attempts++) {
        await new Promise((r) => setTimeout(r, 1200));
        const pollRes = await fetch(`/api/v1/generation/${jobId}/status`);
        if (!pollRes.ok) throw new Error(`Motion status request failed (${pollRes.status})`);
        const pollData = await pollRes.json();
        const job = pollData?.data;
        if (!job?.status) throw new Error('Backend returned an invalid motion status response');
        setMotionAiProgress(job.progress || Math.min(20 + attempts * 8, 95));
        setMotionAiStage(job.stage || job.message || 'Sampling ARDY motion diffusion...');
        if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.error_message || `Motion generation ${job.status}`);
        if (job.status === 'completed') { completedJob = job; break; }
      }
      if (!completedJob) throw new Error('Motion generation timed out before the backend reported completion');
      const artifact = completedJob.result?.artifact;
      const motionJsonUrl = artifact?.motion_json_url || completedJob.result?.download_urls?.json;
      const motionUrl = artifact?.motion_npz_url || completedJob.result?.download_urls?.npz;
      if (!motionJsonUrl || !motionUrl) throw new Error('Motion job completed without canonical motion artifact URLs');
      if (artifact?.synthetic) throw new Error('Synthetic motion output is not accepted as a production result');
      if (!artifact?.joint_names?.length) throw new Error('Motion result is missing joint metadata for retargeting');

      setMotionAiProgress(100);
      setMotionAiStage('Ready');

      const newClip = {
        id: `anim-ardy-${jobId}`,
        name: motionAiPrompt.slice(0, 24) + (motionAiPrompt.length > 24 ? '...' : ''),
        category: 'Custom' as const,
        duration: artifact.duration || motionAiDuration,
        fps: artifact.fps || motionAiFps,
        keyframesCount: artifact.frame_count || Math.round(motionAiDuration * motionAiFps),
        url: motionUrl,
        motionJsonUrl,
        artifactType: 'motion' as const,
        skeletonId: artifact.skeleton_id,
        jointNames: artifact.joint_names,
      };
      addAnimation(newClip);
      setCurrentAnimationId(newClip.id);

      toast.success('Motion Generated Successfully!', {
        description: `Synthesized with ARDY • ${motionAiDuration}s clip added to Timeline`,
      });
    } catch (err) {
      setMotionAiError(err instanceof Error ? err.message : 'Generation failed');
      toast.error('Motion generation failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setMotionAiIsGenerating(false);
    }
  };

  const viewerStore = useViewerStore();
  const realVerts = currentAsset?.vertices || viewerStore.modelStats?.vertices || 0;
  const realFaces = currentAsset?.faces || currentAsset?.triangles || viewerStore.modelStats?.triangles || 0;
  const realMats = currentAsset?.materials?.length || 1;
  const currentBoneRot = (selectedBone && boneRotations[selectedBone]) || [0, 0, 0];

  return (
    <div className="w-full lg:w-[320px] h-full bg-[hsl(var(--surface-0))] lg:border-l border-white/[0.08] flex flex-col flex-shrink-0 select-none overflow-hidden">
      {/* SLEEK INSPECTOR HEADER */}
      <div className="h-10 px-3 bg-[hsl(var(--surface-0))] border-b border-white/[0.08] flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          {inspectorTab === 'rigging' && <Bone className="w-3.5 h-3.5 text-primary" />}
          {inspectorTab === 'animation' && <Sparkles className="w-3.5 h-3.5 text-primary" />}
          {inspectorTab === 'properties' && <Sliders className="w-3.5 h-3.5 text-primary" />}
          <span>{inspectorTab === 'animation' ? 'Motion AI & Pose' : inspectorTab === 'rigging' ? 'Armature & Rig' : 'Model Properties'}</span>
        </span>
        <div className="flex items-center gap-1 bg-[hsl(var(--surface-1))] p-0.5 rounded-lg border border-white/[0.06]">
          {(['properties', 'rigging', 'animation'] as InspectorTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setInspectorTab(tab)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize transition-colors cursor-pointer ${
                inspectorTab === tab
                  ? 'bg-primary text-black shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab === 'animation' ? 'Motion' : tab === 'properties' ? 'Props' : 'Rig'}
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT (Scrollable) */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/[0.06] scrollbar-thin scrollbar-thumb-white/10">
        {/* ========================================================= */}
        {/* TAB 1: PROPERTIES                                         */}
        {/* ========================================================= */}
        {inspectorTab === 'properties' && (
          <>
            {/* 1. Model Info Accordion */}
            <div className="p-3">
              <button
                onClick={() => toggleSection('modelInfo')}
                className="w-full flex items-center justify-between text-xs font-bold text-zinc-300 mb-2 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-primary" /> Model Info
                </span>
                {openSections.modelInfo ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
              </button>

              {openSections.modelInfo && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-2.5 p-2 bg-[hsl(var(--surface-1))] border border-white/[0.06] rounded-xl">
                    <div className="w-10 h-10 rounded-lg bg-[hsl(var(--surface-0))] border border-white/[0.08] flex items-center justify-center text-primary flex-shrink-0">
                      <Bone className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold text-white truncate">
                        {currentAsset?.name || viewerStore.loadedModelName || 'character.glb'}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                        <Check className="w-3 h-3" /> {rigStatus === 'rigged' ? 'Rigged & Ready' : 'Rig Required'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="p-2 bg-[hsl(var(--surface-1))] border border-white/[0.06] rounded-lg">
                      <div className="text-[10px] text-zinc-500 uppercase font-semibold">Vertices</div>
                      <div className="text-xs font-bold text-zinc-200 mt-0.5 font-mono">
                        {realVerts > 0 ? realVerts.toLocaleString() : '—'}
                      </div>
                    </div>
                    <div className="p-2 bg-[hsl(var(--surface-1))] border border-white/[0.06] rounded-lg">
                      <div className="text-[10px] text-zinc-500 uppercase font-semibold">Faces</div>
                      <div className="text-xs font-bold text-zinc-200 mt-0.5 font-mono">
                        {realFaces > 0 ? realFaces.toLocaleString() : '—'}
                      </div>
                    </div>
                    <div className="p-2 bg-[hsl(var(--surface-1))] border border-white/[0.06] rounded-lg">
                      <div className="text-[10px] text-zinc-500 uppercase font-semibold">Materials</div>
                      <div className="text-xs font-bold text-zinc-200 mt-0.5 font-mono">
                        {realMats}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Transform Accordion */}
            <div className="p-3">
              <button
                onClick={() => toggleSection('transform')}
                className="w-full flex items-center justify-between text-xs font-bold text-zinc-300 mb-2 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Move className="w-3.5 h-3.5 text-primary" /> Transform
                </span>
                {openSections.transform ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
              </button>

              {openSections.transform && (
                <div className="space-y-2 pt-1">
                  {/* Position */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold text-zinc-400">Position</div>
                    <div className="grid grid-cols-3 gap-1">
                      {['X', 'Y', 'Z'].map((axis, i) => (
                        <div key={axis} className="flex items-center bg-[hsl(var(--surface-1))] border border-white/[0.06] rounded-lg px-2 py-1">
                          <span className="text-[10px] font-bold text-zinc-500 mr-1.5">{axis}</span>
                          <input
                            type="number"
                            step="0.1"
                            value={transform.position[i]}
                            onChange={(e) => {
                              const pos = [...transform.position] as [number, number, number];
                              pos[i] = parseFloat(e.target.value) || 0;
                              setTransform({ position: pos });
                            }}
                            className="w-full bg-transparent text-xs text-white focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Rotation */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold text-zinc-400">Rotation (deg)</div>
                    <div className="grid grid-cols-3 gap-1">
                      {['X', 'Y', 'Z'].map((axis, i) => (
                        <div key={axis} className="flex items-center bg-[hsl(var(--surface-1))] border border-white/[0.06] rounded-lg px-2 py-1">
                          <span className="text-[10px] font-bold text-zinc-500 mr-1.5">{axis}</span>
                          <input
                            type="number"
                            step="1"
                            value={transform.rotation[i]}
                            onChange={(e) => {
                              const rot = [...transform.rotation] as [number, number, number];
                              rot[i] = parseFloat(e.target.value) || 0;
                              setTransform({ rotation: rot });
                            }}
                            className="w-full bg-transparent text-xs text-white focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Scale */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold text-zinc-400">Scale</div>
                    <div className="grid grid-cols-3 gap-1">
                      {['X', 'Y', 'Z'].map((axis, i) => (
                        <div key={axis} className="flex items-center bg-[hsl(var(--surface-1))] border border-white/[0.06] rounded-lg px-2 py-1">
                          <span className="text-[10px] font-bold text-zinc-500 mr-1.5">{axis}</span>
                          <input
                            type="number"
                            step="0.05"
                            value={transform.scale[i]}
                            onChange={(e) => {
                              const scl = [...transform.scale] as [number, number, number];
                              scl[i] = parseFloat(e.target.value) || 1;
                              setTransform({ scale: scl });
                            }}
                            className="w-full bg-transparent text-xs text-white focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Animation Settings Accordion */}
            <div className="p-3">
              <button
                onClick={() => toggleSection('animSettings')}
                className="w-full flex items-center justify-between text-xs font-bold text-zinc-300 mb-2 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-primary" /> Animation Settings
                </span>
                {openSections.animSettings ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
              </button>

              {openSections.animSettings && (
                <div className="space-y-2.5 pt-1">
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Current Animation</label>
                    <select
                      value={currentAnimationId}
                      onChange={(e) => setCurrentAnimationId(e.target.value)}
                      className="w-full bg-[hsl(var(--surface-1))] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-primary/40"
                    >
                      {animations.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.duration}s)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-[hsl(var(--surface-1))] border border-white/[0.06] rounded-lg">
                      <span className="text-[10px] text-zinc-500 block">Duration</span>
                      <span className="font-mono font-bold text-zinc-200">{duration.toFixed(2)} s</span>
                    </div>
                    <div className="p-2 bg-[hsl(var(--surface-1))] border border-white/[0.06] rounded-lg">
                      <span className="text-[10px] text-zinc-500 block">Frame Rate</span>
                      <span className="font-mono font-bold text-zinc-200">{fps} FPS</span>
                    </div>
                  </div>

                  {/* Playback Speed */}
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 block mb-1">
                      Playback Speed ({playbackSpeed}x)
                    </label>
                    <div className="flex gap-1">
                      {[0.25, 0.5, 1.0, 1.5, 2.0].map((spd) => (
                        <button
                          key={spd}
                          onClick={() => setPlaybackSpeed(spd)}
                          className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                            playbackSpeed === spd
                              ? 'bg-primary text-black'
                              : 'bg-[hsl(var(--surface-1))] text-zinc-400 hover:text-white border border-white/[0.04]'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                      <span>Loop Animation</span>
                      <input
                        type="checkbox"
                        checked={isLooping}
                        onChange={(e) => setIsLooping(e.target.checked)}
                        className="w-4 h-4 rounded bg-[hsl(var(--surface-1))] border-white/[0.2] accent-primary"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                      <span>Root Motion</span>
                      <input
                        type="checkbox"
                        checked={hasRootMotion}
                        onChange={(e) => setHasRootMotion(e.target.checked)}
                        className="w-4 h-4 rounded bg-[hsl(var(--surface-1))] border-white/[0.2] accent-primary"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                      <span>Foot Lock (Zero Skating)</span>
                      <input
                        type="checkbox"
                        checked={hasFootLock}
                        onChange={(e) => setHasFootLock(e.target.checked)}
                        className="w-4 h-4 rounded bg-[hsl(var(--surface-1))] border-white/[0.2] accent-primary"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Display Accordion */}
            <div className="p-3">
              <button
                onClick={() => toggleSection('display')}
                className="w-full flex items-center justify-between text-xs font-bold text-zinc-300 mb-2 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-primary" /> Display
                </span>
                {openSections.display ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
              </button>

              {openSections.display && (
                <div className="space-y-1.5 pt-1">
                  <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                    <span>Show Skeleton Bones</span>
                    <input
                      type="checkbox"
                      checked={displayOptions.showSkeleton}
                      onChange={() => toggleDisplayOption('showSkeleton')}
                      className="w-4 h-4 rounded bg-[hsl(var(--surface-1))] border-white/[0.2] accent-primary"
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                    <span>Show Ground Grid</span>
                    <input
                      type="checkbox"
                      checked={displayOptions.showGrid}
                      onChange={() => toggleDisplayOption('showGrid')}
                      className="w-4 h-4 rounded bg-[hsl(var(--surface-1))] border-white/[0.2] accent-primary"
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                    <span>Show Ground Disc</span>
                    <input
                      type="checkbox"
                      checked={displayOptions.showGround}
                      onChange={() => toggleDisplayOption('showGround')}
                      className="w-4 h-4 rounded bg-[hsl(var(--surface-1))] border-white/[0.2] accent-primary"
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                    <span>Show IK Targets</span>
                    <input
                      type="checkbox"
                      checked={displayOptions.showIKTargets}
                      onChange={() => toggleDisplayOption('showIKTargets')}
                      className="w-4 h-4 rounded bg-[hsl(var(--surface-1))] border-white/[0.2] accent-primary"
                    />
                  </label>
                </div>
              )}
            </div>
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 2: RIGGING                                            */}
        {/* ========================================================= */}
        {inspectorTab === 'rigging' && (
          <>
            {/* Auto Rig Section */}
            <div className="p-3">
              <button
                onClick={() => toggleSection('autoRig')}
                className="w-full flex items-center justify-between text-xs font-bold text-zinc-300 mb-2 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Bone className="w-3.5 h-3.5 text-primary" /> Auto Rig (One-Click)
                </span>
                {openSections.autoRig ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
              </button>

              {openSections.autoRig && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Armature Template / Preset</label>
                    <select
                      value={rigProfile}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setRigProfile(val);
                        if (val === 'facial') loadRigPreset('facial');
                        else if (val === 'generic') loadRigPreset('tail');
                        else loadRigPreset('humanoid');
                        toast.success(`Loaded ${val} armature template`);
                      }}
                      className="w-full bg-[hsl(var(--surface-1))] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-primary/40"
                    >
                      <option value="humanoid">Humanoid (Biped — 17 Bones)</option>
                      <option value="facial">Facial Rig (6 Bones: Head, Jaw, Eyes)</option>
                      <option value="generic">Tail / Spine Chain (5 Bones)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                      <span>Automatic Bone Placement</span>
                      <input
                        type="checkbox"
                        checked={rigOptions.autoBonePlacement}
                        onChange={(e) => setRigOptions({ autoBonePlacement: e.target.checked })}
                        className="w-4 h-4 rounded bg-[hsl(var(--surface-1))] border-white/[0.2] accent-primary"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                      <span>Automatic Vertex Weights</span>
                      <input
                        type="checkbox"
                        checked={rigOptions.autoWeights}
                        onChange={(e) => setRigOptions({ autoWeights: e.target.checked })}
                        className="w-4 h-4 rounded bg-[hsl(var(--surface-1))] border-white/[0.2] accent-primary"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                      <span>Generate Inverse Kinematics (IK)</span>
                      <input
                        type="checkbox"
                        checked={rigOptions.generateIK}
                        onChange={(e) => setRigOptions({ generateIK: e.target.checked })}
                        className="w-4 h-4 rounded bg-[hsl(var(--surface-1))] border-white/[0.2] accent-primary"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer">
                      <span>Validate Rig Hierarchy</span>
                      <input
                        type="checkbox"
                        checked={rigOptions.validateRig}
                        onChange={(e) => setRigOptions({ validateRig: e.target.checked })}
                        className="w-4 h-4 rounded bg-[hsl(var(--surface-1))] border-white/[0.2] accent-primary"
                      />
                    </label>
                  </div>

                  <button
                    onClick={handleRunAutoRig}
                    disabled={rigStatus === 'rigging'}
                    className="w-full py-2.5 rounded-xl bg-primary hover:bg-[hsl(var(--primary)/0.9)] text-black font-bold text-xs transition-all shadow-[0_2px_12px_rgba(249,207,0,0.25)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Bone className="w-4 h-4" />
                    {rigStatus === 'rigging' ? 'Running Blender Auto-Rig...' : 'Auto Rig Model'}
                  </button>
                </div>
              )}
            </div>

            {/* Manual Rig Section */}
            <div className="p-3">
              <button
                onClick={() => toggleSection('manualRig')}
                className="w-full flex items-center justify-between text-xs font-bold text-zinc-300 mb-2 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-primary" /> Manual Bone Tools
                </span>
                {openSections.manualRig ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
              </button>

              {openSections.manualRig && (
                <div className="space-y-2.5 pt-1">
                  {/* Click-to-Place Bone Toggle */}
                  <button
                    onClick={() => {
                      const next = !isPlacingBone;
                      setIsPlacingBone(next);
                      setActiveViewportTool(next ? 'bone' : 'select');
                      if (next) {
                        toast.info('Click-to-Place Joint Active', {
                          description: 'Click anywhere on 3D character mesh to drop a joint node',
                        });
                      }
                    }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isPlacingBone
                        ? 'bg-primary text-black shadow-[0_0_12px_rgba(249,207,0,0.4)] animate-pulse'
                        : 'bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] text-zinc-200 border border-white/[0.08]'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5 text-primary" />
                    {isPlacingBone ? 'Click on 3D Mesh to Place (Active)' : 'Place Bone on 3D Mesh'}
                  </button>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => {
                        if (!selectedBone || !activeBone) {
                          toast.warning('Select a parent bone first');
                          return;
                        }
                        const parentPos = activeBone.position || [0, 1.0, 0];
                        const newPos: [number, number, number] = [
                          parentPos[0],
                          parseFloat((parentPos[1] + 0.15).toFixed(3)),
                          parentPos[2],
                        ];
                        addBone({
                          name: `${selectedBone}_child`,
                          parent: selectedBone,
                          position: newPos,
                          rotation: [0, 0, 0],
                        });
                        toast.success(`Extruded child bone from ${selectedBone}`);
                      }}
                      className="p-1.5 rounded-lg bg-[hsl(var(--surface-1))] hover:bg-[hsl(var(--surface-2))] border border-white/[0.06] text-xs text-zinc-300 font-semibold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <GitBranch className="w-3 h-3 text-sky-400" /> Extrude Child
                    </button>
                    <button
                      onClick={() => {
                        if (!selectedBone) {
                          toast.warning('Select a bone to delete');
                          return;
                        }
                        deleteBone(selectedBone);
                        toast.success(`Deleted bone ${selectedBone}`);
                      }}
                      className="p-1.5 rounded-lg bg-[hsl(var(--surface-1))] hover:bg-[hsl(var(--surface-2))] border border-white/[0.06] text-xs text-zinc-300 font-semibold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3 text-rose-400" /> Delete Bone
                    </button>
                    <button
                      onClick={() => {
                        mirrorPose();
                        toast.info('Mirrored arm/leg rotations across X-axis');
                      }}
                      className="p-1.5 rounded-lg bg-[hsl(var(--surface-1))] hover:bg-[hsl(var(--surface-2))] border border-white/[0.06] text-xs text-zinc-300 font-semibold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3 text-sky-400" /> Mirror Bones
                    </button>
                    <button
                      onClick={() => {
                        resetPose();
                        toast.info('Reset all bone rotations to default');
                      }}
                      className="p-1.5 rounded-lg bg-[hsl(var(--surface-1))] hover:bg-[hsl(var(--surface-2))] border border-white/[0.06] text-xs text-zinc-300 font-semibold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3 text-amber-400" /> Reset Pose
                    </button>
                  </div>

                  {/* Bone Hierarchy List */}
                  <div className="mt-2 border border-white/[0.06] rounded-xl bg-[hsl(var(--surface-1))] p-2 max-h-36 overflow-y-auto">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Armature Hierarchy ({bones.length})</div>
                    {bones.map((b) => (
                      <div
                        key={b.name}
                        onClick={() => setSelectedBone(b.name)}
                        className={`text-xs px-2 py-1 rounded-md flex items-center justify-between cursor-pointer transition-colors ${
                          selectedBone === b.name
                            ? 'bg-primary text-black font-bold'
                            : 'text-zinc-300 hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className="truncate">{b.name}</span>
                        <span className="text-[9px] opacity-60">{b.parent ? `↳ ${b.parent}` : 'Root'}</span>
                      </div>
                    ))}
                  </div>

                  {/* Selected Bone Properties Panel */}
                  {activeBone && (
                    <div className="mt-3 p-2.5 bg-[hsl(var(--surface-1))] border border-primary/30 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                          Joint: {activeBone.name}
                        </span>
                        <span className="text-[9px] text-zinc-500 font-mono">
                          Parent: {activeBone.parent || 'Root'}
                        </span>
                      </div>

                      {/* Rename Bone */}
                      <div>
                        <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Rename Joint</label>
                        <input
                          type="text"
                          defaultValue={activeBone.name}
                          key={activeBone.name}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val && val !== activeBone.name) {
                              updateBoneName(activeBone.name, val);
                              toast.success(`Renamed joint to ${val}`);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="w-full bg-[hsl(var(--surface-0))] border border-white/[0.1] rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-primary"
                        />
                      </div>

                      {/* Parent Selector */}
                      <div>
                        <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Parent Bone</label>
                        <select
                          value={activeBone.parent || ''}
                          onChange={(e) => {
                            updateBoneParent(activeBone.name, e.target.value || null);
                            toast.info(`Parent set to ${e.target.value || 'Root'}`);
                          }}
                          className="w-full bg-[hsl(var(--surface-0))] border border-white/[0.1] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-primary"
                        >
                          <option value="">None (Root Bone)</option>
                          {bones
                            .filter((b) => b.name !== activeBone.name)
                            .map((b) => (
                              <option key={b.name} value={b.name}>
                                {b.name}
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* 3D Coordinates (X, Y, Z meters) */}
                      <div>
                        <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-400 mb-1">
                          <span>3D Position (Meters)</span>
                          <span className="text-[9px] text-zinc-500">Live 3D Gizmo</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['X', 'Y', 'Z'] as const).map((axis, axisIdx) => {
                            const val = activeBone.position[axisIdx];
                            return (
                              <div key={axis} className="bg-[hsl(var(--surface-0))] border border-white/[0.08] rounded-lg p-1 text-center">
                                <div className="text-[9px] font-bold text-zinc-400 flex items-center justify-between px-1">
                                  <span>{axis}</span>
                                  <div className="flex gap-0.5">
                                    <button
                                      onClick={() => {
                                        const newPos = [...activeBone.position] as [number, number, number];
                                        newPos[axisIdx] = parseFloat((val - 0.02).toFixed(3));
                                        updateBonePosition(activeBone.name, newPos);
                                      }}
                                      className="px-1 text-[8px] bg-white/5 hover:bg-white/10 rounded cursor-pointer"
                                    >
                                      -
                                    </button>
                                    <button
                                      onClick={() => {
                                        const newPos = [...activeBone.position] as [number, number, number];
                                        newPos[axisIdx] = parseFloat((val + 0.02).toFixed(3));
                                        updateBonePosition(activeBone.name, newPos);
                                      }}
                                      className="px-1 text-[8px] bg-white/5 hover:bg-white/10 rounded cursor-pointer"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={val}
                                  onChange={(e) => {
                                    const num = parseFloat(e.target.value) || 0;
                                    const newPos = [...activeBone.position] as [number, number, number];
                                    newPos[axisIdx] = parseFloat(num.toFixed(3));
                                    updateBonePosition(activeBone.name, newPos);
                                  }}
                                  className="w-full bg-transparent text-center font-mono text-xs text-white focus:outline-none"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Rig Status Card */}
            <div className="p-3">
              <div className="p-3 bg-[hsl(var(--surface-1))] border border-white/[0.08] rounded-xl space-y-1.5 text-xs">
                <div className="text-[10px] font-bold text-zinc-500 uppercase">Armature Diagnostics</div>
                <div className="flex justify-between text-zinc-300">
                  <span>Status:</span>
                  <span className="text-emerald-400 font-semibold capitalize">{rigStatus}</span>
                </div>
                <div className="flex justify-between text-zinc-300">
                  <span>Skeleton Profile:</span>
                  <span className="font-semibold capitalize">{rigProfile}</span>
                </div>
                <div className="flex justify-between text-zinc-300">
                  <span>Bone Count:</span>
                  <span className="font-mono font-bold text-primary">{bones.length} bones</span>
                </div>
                <div className="flex justify-between text-zinc-300">
                  <span>Skinning Type:</span>
                  <span className="text-zinc-400">{'Automatic (Deforming)'}</span>
                </div>
                <div className="flex justify-between text-zinc-300">
                  <span>IK Solvers:</span>
                  <span className="text-emerald-400 font-semibold">{bones.length} bones · {rigProfile}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ========================================================= */}
        {/* TAB 3: ANIMATION & MOTION AI (ARDY)                       */}
        {/* ========================================================= */}
        {inspectorTab === 'animation' && (
          <>
            {/* Motion AI (ARDY) Section */}
            <div className="p-3">
              <button
                onClick={() => toggleSection('motionAi')}
                className="w-full flex items-center justify-between text-xs font-bold text-zinc-300 mb-2 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> AI Motion Generator
                </span>
                {openSections.motionAi ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
              </button>

              {openSections.motionAi && (
                <div className="space-y-3 pt-1">
                  {/* ARDY Engine Pill (Mandatory: NO model selector) */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-[hsl(var(--surface-1))] border border-white/[0.06] rounded-lg">
                    <span className="text-[11px] text-zinc-400">Engine</span>
                    <span className="text-xs font-bold text-primary flex items-center gap-1">
                      <Wand2 className="w-3 h-3" /> Motion AI • ARDY
                    </span>
                  </div>

                  {/* Prompt Textarea */}
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 block mb-1">
                      Motion Description Prompt
                    </label>
                    <textarea
                      value={motionAiPrompt}
                      onChange={(e) => setMotionAiPrompt(e.target.value)}
                      rows={3}
                      placeholder="e.g. Character walks forward and waves with the right hand."
                      className="w-full p-2.5 bg-[hsl(var(--surface-1))] border border-white/[0.08] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-primary/50 resize-none"
                    />

                    {/* Quick Prompt Presets */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {[
                        'Walk forward and wave',
                        'Jump and roll forward',
                        'Combat ready stance',
                        'Sprint and slide stop',
                      ].map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setMotionAiPrompt(preset)}
                          className="px-2 py-0.5 rounded text-[9px] bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Duration Slider */}
                  <div>
                    <div className="flex justify-between text-[10px] font-semibold text-zinc-400 mb-1">
                      <span>Duration</span>
                      <span className="font-mono text-zinc-200">{motionAiDuration.toFixed(1)} s</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="10.0"
                      step="0.5"
                      value={motionAiDuration}
                      onChange={(e) => setMotionAiDuration(parseFloat(e.target.value))}
                      className="w-full h-1 bg-[#282B33] rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  {/* Generate Button */}
                  <button
                    onClick={handleGenerateMotion}
                    disabled={motionAiIsGenerating}
                    className="w-full py-2.5 rounded-xl bg-primary hover:bg-[hsl(var(--primary)/0.9)] text-black font-bold text-xs transition-all shadow-[0_2px_12px_rgba(249,207,0,0.25)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    {motionAiIsGenerating ? 'Synthesizing with ARDY...' : 'Generate Motion'}
                  </button>

                  {/* Real Status Progression */}
                  {motionAiIsGenerating && (
                    <div className="p-2.5 bg-[hsl(var(--surface-1))] border border-white/[0.06] rounded-xl space-y-1.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-zinc-400">{motionAiStage}</span>
                        <span className="font-mono font-bold text-primary">{motionAiProgress}%</span>
                      </div>
                      <div className="h-1 bg-[hsl(var(--surface-0))] rounded-full overflow-hidden">
                        <div
                          style={{ width: `${motionAiProgress}%` }}
                          className="h-full bg-primary transition-all duration-300"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pose Editor Section */}
            <div className="p-3">
              <button
                onClick={() => toggleSection('poseEditor')}
                className="w-full flex items-center justify-between text-xs font-bold text-zinc-300 mb-2 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Move className="w-3.5 h-3.5 text-primary" /> Pose Editor
                </span>
                {openSections.poseEditor ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
              </button>

              {openSections.poseEditor && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Active Joint / Bone</label>
                    <select
                      value={selectedBone || 'Hips'}
                      onChange={(e) => setSelectedBone(e.target.value)}
                      className="w-full bg-[hsl(var(--surface-1))] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-primary/40"
                    >
                      {bones.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Joint Rotations */}
                  <div className="space-y-2">
                    {['Pitch (X)', 'Yaw (Y)', 'Roll (Z)'].map((label, idx) => (
                      <div key={label}>
                        <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                          <span>{label}</span>
                          <span className="font-mono text-zinc-200">{currentBoneRot[idx]}°</span>
                        </div>
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          step="5"
                          value={currentBoneRot[idx]}
                          onChange={(e) => {
                            if (!selectedBone) return;
                            const newRot = [...currentBoneRot] as [number, number, number];
                            newRot[idx] = parseInt(e.target.value);
                            setBoneRotation(selectedBone, newRot);
                          }}
                          className="w-full h-1 bg-[#282B33] rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      onClick={() => {
                        let targetTrackId = 'track-body';
                        const bName = selectedBone || '';
                        if (bName.includes('Arm') || bName.includes('Hand')) targetTrackId = 'track-arms';
                        else if (bName.includes('Leg') || bName.includes('Foot')) targetTrackId = 'track-legs';
                        else if (bName.includes('Head') || bName.includes('Jaw') || bName.includes('Eye')) targetTrackId = 'track-face';
                        else if (bName.includes('Hips')) targetTrackId = 'track-root';

                        const targetTrack = tracks.find((t) => t.id === targetTrackId);
                        if (targetTrack?.isLocked) {
                          toast.error(`Cannot add keyframe`, {
                            description: `${targetTrack.name} track is locked. Unlock it in the timeline to record poses.`,
                          });
                          return;
                        }
                        addKeyframeToTrack(targetTrackId, currentTime);
                        toast.success('Keyframe Added', {
                          description: `Recorded ${bName || 'pose'} on ${targetTrack?.name || 'Body'} track at ${currentTime.toFixed(2)}s`,
                        });
                      }}
                      className="py-2 rounded-lg bg-[hsl(var(--surface-2))] hover:bg-[#2C3038] text-xs font-bold text-primary border border-primary/30 transition-colors cursor-pointer"
                    >
                      + Add Keyframe
                    </button>
                    <button
                      onClick={resetPose}
                      className="py-2 rounded-lg bg-[hsl(var(--surface-1))] hover:bg-[hsl(var(--surface-2))] text-xs font-semibold text-zinc-300 border border-white/[0.06] transition-colors cursor-pointer"
                    >
                      Reset Pose
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Animation Mixer / Blending Section */}
            <div className="p-3">
              <button
                onClick={() => toggleSection('mixer')}
                className="w-full flex items-center justify-between text-xs font-bold text-zinc-300 mb-2 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" /> Animation Mixer
                </span>
                {openSections.mixer ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
              </button>

              {openSections.mixer && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Animation A</label>
                    <select
                      value={blendState.animA}
                      onChange={(e) => setBlendState({ animA: e.target.value })}
                      className="w-full bg-[hsl(var(--surface-1))] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    >
                      {animations.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Animation B</label>
                    <select
                      value={blendState.animB}
                      onChange={(e) => setBlendState({ animB: e.target.value })}
                      className="w-full bg-[hsl(var(--surface-1))] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    >
                      {animations.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] font-semibold text-zinc-400 mb-1">
                      <span>Blend Weight</span>
                      <span className="font-mono text-zinc-200">{Math.round(blendState.weight * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={blendState.weight}
                      onChange={(e) => setBlendState({ weight: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-[#282B33] rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  <button
                    onClick={() => {
                      const clipA = animations.find((a) => a.id === blendState.animA);
                      const clipB = animations.find((a) => a.id === blendState.animB);
                      setIsPlaying(true);
                      toast.success('Previewing Blend Transition', {
                        description: `Blending ${Math.round((1 - blendState.weight) * 100)}% ${clipA?.name || 'Clip A'} + ${Math.round(blendState.weight * 100)}% ${clipB?.name || 'Clip B'}`,
                      });
                    }}
                    className="w-full py-2 rounded-lg bg-[hsl(var(--surface-2))] hover:bg-[#2C3038] text-xs font-bold text-white transition-colors cursor-pointer"
                  >
                    Preview Blend Transition
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
