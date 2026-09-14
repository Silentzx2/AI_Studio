import { create } from 'zustand';

export type AnimationStudioMode = 'animate' | 'rigging' | 'retarget' | 'motion_ai' | 'blend' | 'library';
export type InspectorTab = 'properties' | 'rigging' | 'animation';
export type ViewportGizmoTool = 'select' | 'move' | 'rotate' | 'scale' | 'bone' | 'weight';
export type ViewportRenderMode = 'solid' | 'wireframe' | 'skeleton';
export type CameraPreset = 'perspective' | 'front' | 'side' | 'top';

export interface AnimationClipItem {
  id: string;
  name: string;
  category: 'Idle' | 'Walk' | 'Run' | 'Jump' | 'Actions' | 'Custom';
  duration: number; // in seconds
  fps: number;
  keyframesCount: number;
  tracks?: string[];
  url?: string;
  isBuiltin?: boolean;
}

export interface TimelineTrack {
  id: string;
  name: string;
  keyframeTimes: number[]; // time in seconds where keyframes exist
  isMuted?: boolean;
  isLocked?: boolean;
  color?: string;
}

export interface BoneItem {
  name: string;
  parent: string | null;
  position: [number, number, number];
  rotation: [number, number, number];
}

export const DEFAULT_BONES: BoneItem[] = [
  { name: 'Hips', parent: null, position: [0, 1.0, 0], rotation: [0, 0, 0] },
  { name: 'Spine', parent: 'Hips', position: [0, 1.2, 0], rotation: [0, 0, 0] },
  { name: 'Chest', parent: 'Spine', position: [0, 1.45, 0], rotation: [0, 0, 0] },
  { name: 'Neck', parent: 'Chest', position: [0, 1.62, 0], rotation: [0, 0, 0] },
  { name: 'Head', parent: 'Neck', position: [0, 1.78, 0], rotation: [0, 0, 0] },
  { name: 'UpperArm_L', parent: 'Chest', position: [0.25, 1.42, 0], rotation: [0, 0, -20] },
  { name: 'LowerArm_L', parent: 'UpperArm_L', position: [0.55, 1.40, 0], rotation: [0, 0, 0] },
  { name: 'Hand_L', parent: 'LowerArm_L', position: [0.82, 1.38, 0], rotation: [0, 0, 0] },
  { name: 'UpperArm_R', parent: 'Chest', position: [-0.25, 1.42, 0], rotation: [0, 0, 20] },
  { name: 'LowerArm_R', parent: 'UpperArm_R', position: [-0.55, 1.40, 0], rotation: [0, 0, 0] },
  { name: 'Hand_R', parent: 'LowerArm_R', position: [-0.82, 1.38, 0], rotation: [0, 0, 0] },
  { name: 'UpperLeg_L', parent: 'Hips', position: [0.15, 0.95, 0], rotation: [0, 0, 0] },
  { name: 'LowerLeg_L', parent: 'UpperLeg_L', position: [0.15, 0.50, 0], rotation: [0, 0, 0] },
  { name: 'Foot_L', parent: 'LowerLeg_L', position: [0.15, 0.08, 0.12], rotation: [0, 0, 0] },
  { name: 'UpperLeg_R', parent: 'Hips', position: [-0.15, 0.95, 0], rotation: [0, 0, 0] },
  { name: 'LowerLeg_R', parent: 'UpperLeg_R', position: [-0.15, 0.50, 0], rotation: [0, 0, 0] },
  { name: 'Foot_R', parent: 'LowerLeg_R', position: [-0.15, 0.08, 0.12], rotation: [0, 0, 0] },
];

export const FACIAL_BONES: BoneItem[] = [
  { name: 'Head', parent: null, position: [0, 1.78, 0], rotation: [0, 0, 0] },
  { name: 'Jaw', parent: 'Head', position: [0, 1.68, 0.08], rotation: [0, 0, 0] },
  { name: 'Eye_L', parent: 'Head', position: [0.04, 1.80, 0.08], rotation: [0, 0, 0] },
  { name: 'Eye_R', parent: 'Head', position: [-0.04, 1.80, 0.08], rotation: [0, 0, 0] },
  { name: 'Eyebrow_L', parent: 'Head', position: [0.04, 1.84, 0.08], rotation: [0, 0, 0] },
  { name: 'Eyebrow_R', parent: 'Head', position: [-0.04, 1.84, 0.08], rotation: [0, 0, 0] },
];

export const TAIL_BONES: BoneItem[] = [
  { name: 'Tail_Root', parent: null, position: [0, 0.95, -0.1], rotation: [0, 0, 0] },
  { name: 'Tail_01', parent: 'Tail_Root', position: [0, 0.85, -0.25], rotation: [0, 0, 0] },
  { name: 'Tail_02', parent: 'Tail_01', position: [0, 0.70, -0.42], rotation: [0, 0, 0] },
  { name: 'Tail_03', parent: 'Tail_02', position: [0, 0.52, -0.58], rotation: [0, 0, 0] },
  { name: 'Tail_Tip', parent: 'Tail_03', position: [0, 0.35, -0.72], rotation: [0, 0, 0] },
];

export const INITIAL_ANIMATIONS: AnimationClipItem[] = [
  { id: 'anim-1', name: 'Humanoid Idle', category: 'Idle', duration: 2.4, fps: 24, keyframesCount: 58, isBuiltin: true },
  { id: 'anim-2', name: 'Breathing Idle', category: 'Idle', duration: 3.0, fps: 24, keyframesCount: 72, isBuiltin: true },
  { id: 'anim-3', name: 'Combat Ready Stance', category: 'Idle', duration: 2.0, fps: 24, keyframesCount: 48, isBuiltin: true },
  { id: 'anim-4', name: 'Walking Forward', category: 'Walk', duration: 1.8, fps: 24, keyframesCount: 44, isBuiltin: true },
  { id: 'anim-5', name: 'Cautious Walk', category: 'Walk', duration: 2.2, fps: 24, keyframesCount: 53, isBuiltin: true },
  { id: 'anim-6', name: 'Running Cycle', category: 'Run', duration: 1.2, fps: 24, keyframesCount: 29, isBuiltin: true },
  { id: 'anim-7', name: 'Sprint Forward', category: 'Run', duration: 0.9, fps: 24, keyframesCount: 22, isBuiltin: true },
  { id: 'anim-8', name: 'Jump High', category: 'Jump', duration: 1.5, fps: 24, keyframesCount: 36, isBuiltin: true },
  { id: 'anim-9', name: 'Hop Forward', category: 'Jump', duration: 1.1, fps: 24, keyframesCount: 27, isBuiltin: true },
  { id: 'anim-10', name: 'Wave Right Hand', category: 'Actions', duration: 2.5, fps: 24, keyframesCount: 60, isBuiltin: true },
  { id: 'anim-11', name: 'Punch Combo', category: 'Actions', duration: 1.6, fps: 24, keyframesCount: 38, isBuiltin: true },
  { id: 'anim-12', name: 'Celebrate Victory', category: 'Actions', duration: 3.2, fps: 24, keyframesCount: 77, isBuiltin: true },
];

export const DEFAULT_TRACKS: TimelineTrack[] = [
  { id: 'track-char', name: 'Character', keyframeTimes: [0, 0.4, 0.8, 1.2, 1.6, 2.0], color: '#F9CF00' },
  { id: 'track-body', name: 'Body', keyframeTimes: [0, 0.3, 0.7, 1.1, 1.5, 1.9], color: '#38BDF8' },
  { id: 'track-arms', name: 'Arms', keyframeTimes: [0, 0.25, 0.6, 0.95, 1.3, 1.7, 2.0], color: '#4ADE80' },
  { id: 'track-legs', name: 'Legs', keyframeTimes: [0, 0.2, 0.5, 0.8, 1.1, 1.4, 1.7, 2.0], color: '#FB923C' },
  { id: 'track-face', name: 'Face', keyframeTimes: [0, 0.8, 1.6], color: '#F472B6' },
  { id: 'track-root', name: 'Root', keyframeTimes: [0, 1.0, 2.0], color: '#A78BFA' },
  { id: 'track-ik', name: 'IK', keyframeTimes: [0, 0.5, 1.0, 1.5, 2.0], color: '#E879F9' },
];

interface AnimationState {
  // Navigation & Workspace Mode
  activeMode: AnimationStudioMode;
  setActiveMode: (mode: AnimationStudioMode) => void;

  inspectorTab: InspectorTab;
  setInspectorTab: (tab: InspectorTab) => void;

  // Viewport Interaction
  activeViewportTool: ViewportGizmoTool;
  setActiveViewportTool: (tool: ViewportGizmoTool) => void;
  renderMode: ViewportRenderMode;
  setRenderMode: (mode: ViewportRenderMode) => void;
  cameraPreset: CameraPreset;
  setCameraPreset: (preset: CameraPreset) => void;

  displayOptions: {
    showSkeleton: boolean;
    showGrid: boolean;
    showGround: boolean;
    showIKTargets: boolean;
  };
  setDisplayOptions: (opts: Partial<AnimationState['displayOptions']>) => void;
  toggleDisplayOption: (key: keyof AnimationState['displayOptions']) => void;

  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  setTransform: (transform: Partial<AnimationState['transform']>) => void;

  // Timeline & Playback
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  duration: number;
  setDuration: (duration: number) => void;
  fps: number;
  setFps: (fps: number) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  isLooping: boolean;
  setIsLooping: (loop: boolean) => void;
  hasRootMotion: boolean;
  setHasRootMotion: (val: boolean) => void;
  hasFootLock: boolean;
  setHasFootLock: (val: boolean) => void;
  timeFormat: 'time' | 'frames';
  setTimeFormat: (fmt: 'time' | 'frames') => void;
  timelineZoom: number;
  setTimelineZoom: (zoom: number) => void;
  tracks: TimelineTrack[];
  setTracks: (tracks: TimelineTrack[]) => void;
  addKeyframeToTrack: (trackId: string, time: number) => void;
  deleteKeyframeFromTrack: (trackId: string, time: number) => void;

  // Animation Library
  animations: AnimationClipItem[];
  currentAnimationId: string;
  setCurrentAnimationId: (id: string) => void;
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  addAnimation: (clip: AnimationClipItem) => void;

  // Rigging Engine
  rigStatus: 'not_rigged' | 'preparing' | 'rigging' | 'rigged' | 'failed';
  setRigStatus: (status: AnimationState['rigStatus']) => void;
  rigProfile: 'humanoid' | 'quadruped' | 'generic';
  setRigProfile: (profile: 'humanoid' | 'quadruped' | 'generic') => void;
  rigOptions: {
    autoBonePlacement: boolean;
    autoWeights: boolean;
    generateIK: boolean;
    validateRig: boolean;
  };
  setRigOptions: (opts: Partial<AnimationState['rigOptions']>) => void;
  bones: BoneItem[];
  setBones: (bones: BoneItem[]) => void;
  selectedBone: string | null;
  setSelectedBone: (boneName: string | null) => void;
  boneRotations: Record<string, [number, number, number]>;
  setBoneRotation: (boneName: string, rot: [number, number, number]) => void;
  resetPose: () => void;
  mirrorPose: () => void;
  isPlacingBone: boolean;
  setIsPlacingBone: (isPlacing: boolean) => void;
  addBone: (bone: BoneItem) => void;
  deleteBone: (boneName: string) => void;
  updateBonePosition: (boneName: string, position: [number, number, number]) => void;
  updateBoneParent: (boneName: string, parent: string | null) => void;
  updateBoneName: (oldName: string, newName: string) => void;
  loadRigPreset: (preset: 'humanoid' | 'facial' | 'tail') => void;

  // Retargeting
  retargetMapping: Record<string, string>;
  setRetargetMapping: (mapping: Record<string, string>) => void;
  autoMapBones: () => void;

  // Motion AI (ARDY)
  motionAiPrompt: string;
  setMotionAiPrompt: (prompt: string) => void;
  motionAiDuration: number;
  setMotionAiDuration: (duration: number) => void;
  motionAiFps: number;
  setMotionAiFps: (fps: number) => void;
  motionAiSeed: number | null;
  setMotionAiSeed: (seed: number | null) => void;
  motionAiIsGenerating: boolean;
  setMotionAiIsGenerating: (val: boolean) => void;
  motionAiStage: string;
  setMotionAiStage: (stage: string) => void;
  motionAiProgress: number;
  setMotionAiProgress: (prog: number) => void;
  motionAiError: string | null;
  setMotionAiError: (err: string | null) => void;

  // Animation Blending
  blendState: {
    animA: string;
    animB: string;
    weight: number; // 0.0 to 1.0
    transitionDuration: number; // in seconds
  };
  setBlendState: (blend: Partial<AnimationState['blendState']>) => void;

  // Modals
  isExportModalOpen: boolean;
  setIsExportModalOpen: (open: boolean) => void;
}

export const useAnimationStore = create<AnimationState>((set, get) => ({
  activeMode: 'animate',
  setActiveMode: (activeMode) => set({ activeMode }),

  inspectorTab: 'properties',
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),

  activeViewportTool: 'select',
  setActiveViewportTool: (activeViewportTool) => set({ activeViewportTool }),
  renderMode: 'solid',
  setRenderMode: (renderMode) => set({ renderMode }),
  cameraPreset: 'perspective',
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),

  displayOptions: {
    showSkeleton: true,
    showGrid: true,
    showGround: true,
    showIKTargets: false,
  },
  setDisplayOptions: (opts) => set((s) => ({ displayOptions: { ...s.displayOptions, ...opts } })),
  toggleDisplayOption: (key) =>
    set((s) => ({
      displayOptions: { ...s.displayOptions, [key]: !s.displayOptions[key] },
    })),

  transform: {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  setTransform: (tf) => set((s) => ({ transform: { ...s.transform, ...tf } })),

  isPlaying: false,
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  currentTime: 0,
  setCurrentTime: (currentTime) => set({ currentTime }),
  duration: 2.0,
  setDuration: (duration) => set({ duration }),
  fps: 24,
  setFps: (fps) => set({ fps }),
  playbackSpeed: 1.0,
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  isLooping: true,
  setIsLooping: (isLooping) => set({ isLooping }),
  hasRootMotion: false,
  setHasRootMotion: (hasRootMotion) => set({ hasRootMotion }),
  hasFootLock: true,
  setHasFootLock: (hasFootLock) => set({ hasFootLock }),
  timeFormat: 'time',
  setTimeFormat: (timeFormat) => set({ timeFormat }),
  timelineZoom: 1.0,
  setTimelineZoom: (timelineZoom) => set({ timelineZoom }),
  tracks: DEFAULT_TRACKS,
  setTracks: (tracks) => set({ tracks }),
  addKeyframeToTrack: (trackId, time) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId && !t.keyframeTimes.includes(time)
          ? { ...t, keyframeTimes: [...t.keyframeTimes, time].sort((a, b) => a - b) }
          : t
      ),
    })),
  deleteKeyframeFromTrack: (trackId, time) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, keyframeTimes: t.keyframeTimes.filter((kt) => Math.abs(kt - time) > 0.05) } : t
      ),
    })),

  animations: INITIAL_ANIMATIONS,
  currentAnimationId: 'anim-4', // Walking Forward
  setCurrentAnimationId: (currentAnimationId) => {
    const anim = get().animations.find((a) => a.id === currentAnimationId);
    if (anim) {
      set({
        currentAnimationId,
        duration: anim.duration,
        fps: anim.fps,
        currentTime: 0,
      });
    } else {
      set({ currentAnimationId });
    }
  },
  selectedCategory: 'All Animations',
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  addAnimation: (clip) =>
    set((s) => ({
      animations: [clip, ...s.animations],
      currentAnimationId: clip.id,
      duration: clip.duration,
      fps: clip.fps,
    })),

  rigStatus: 'rigged',
  setRigStatus: (rigStatus) => set({ rigStatus }),
  rigProfile: 'humanoid',
  setRigProfile: (rigProfile) => set({ rigProfile }),
  rigOptions: {
    autoBonePlacement: true,
    autoWeights: true,
    generateIK: true,
    validateRig: true,
  },
  setRigOptions: (opts) => set((s) => ({ rigOptions: { ...s.rigOptions, ...opts } })),
  bones: DEFAULT_BONES,
  setBones: (bones) => set({ bones }),
  selectedBone: 'UpperArm_R',
  setSelectedBone: (selectedBone) => set({ selectedBone }),
  boneRotations: {},
  setBoneRotation: (boneName, rot) =>
    set((s) => ({
      boneRotations: { ...s.boneRotations, [boneName]: rot },
    })),
  resetPose: () => set({ boneRotations: {} }),
  mirrorPose: () => {
    const current = get().boneRotations;
    const mirrored: Record<string, [number, number, number]> = {};
    for (const [k, v] of Object.entries(current)) {
      if (k.endsWith('_L')) {
        mirrored[k.replace('_L', '_R')] = [-v[0], v[1], -v[2]];
      } else if (k.endsWith('_R')) {
        mirrored[k.replace('_R', '_L')] = [-v[0], v[1], -v[2]];
      } else {
        mirrored[k] = [-v[0], v[1], -v[2]];
      }
    }
    set({ boneRotations: mirrored });
  },
  isPlacingBone: false,
  setIsPlacingBone: (isPlacingBone) => set({ isPlacingBone }),
  addBone: (bone) =>
    set((s) => {
      let name = bone.name;
      let counter = 1;
      while (s.bones.some((b) => b.name === name)) {
        name = `${bone.name}_${counter++}`;
      }
      const newBone = { ...bone, name };
      return {
        bones: [...s.bones, newBone],
        selectedBone: newBone.name,
      };
    }),
  deleteBone: (boneName) =>
    set((s) => {
      const boneToDelete = s.bones.find((b) => b.name === boneName);
      if (!boneToDelete) return s;
      const parentName = boneToDelete.parent;
      const updatedBones = s.bones
        .filter((b) => b.name !== boneName)
        .map((b) => (b.parent === boneName ? { ...b, parent: parentName } : b));
      return {
        bones: updatedBones,
        selectedBone: parentName || (updatedBones[0]?.name ?? null),
      };
    }),
  updateBonePosition: (boneName, position) =>
    set((s) => ({
      bones: s.bones.map((b) => (b.name === boneName ? { ...b, position } : b)),
    })),
  updateBoneParent: (boneName, parent) =>
    set((s) => ({
      bones: s.bones.map((b) => (b.name === boneName ? { ...b, parent } : b)),
    })),
  updateBoneName: (oldName, newName) =>
    set((s) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldName || s.bones.some((b) => b.name === trimmed)) return s;
      return {
        bones: s.bones.map((b) => {
          if (b.name === oldName) return { ...b, name: trimmed };
          if (b.parent === oldName) return { ...b, parent: trimmed };
          return b;
        }),
        selectedBone: s.selectedBone === oldName ? trimmed : s.selectedBone,
        boneRotations: Object.fromEntries(
          Object.entries(s.boneRotations).map(([k, v]) => [k === oldName ? trimmed : k, v])
        ),
      };
    }),
  loadRigPreset: (preset) =>
    set(() => {
      if (preset === 'facial') {
        return { bones: FACIAL_BONES, selectedBone: 'Head', rigProfile: 'generic' };
      }
      if (preset === 'tail') {
        return { bones: TAIL_BONES, selectedBone: 'Tail_Root', rigProfile: 'generic' };
      }
      return { bones: DEFAULT_BONES, selectedBone: 'Hips', rigProfile: 'humanoid' };
    }),

  retargetMapping: {
    Hips: 'Hips',
    Spine1: 'Spine',
    Chest: 'Chest',
    Neck1: 'Neck',
    Head: 'Head',
    LeftArm: 'UpperArm_L',
    LeftForeArm: 'LowerArm_L',
    LeftHand: 'Hand_L',
    RightArm: 'UpperArm_R',
    RightForeArm: 'LowerArm_R',
    RightHand: 'Hand_R',
    LeftLeg: 'UpperLeg_L',
    LeftFoot: 'LowerLeg_L',
    LeftToeBase: 'Foot_L',
    RightLeg: 'UpperLeg_R',
    RightFoot: 'LowerLeg_R',
    RightToeBase: 'Foot_R',
  },
  setRetargetMapping: (retargetMapping) => set({ retargetMapping }),
  autoMapBones: () => {
    set({
      retargetMapping: {
        Hips: 'Hips',
        Spine1: 'Spine',
        Chest: 'Chest',
        Neck1: 'Neck',
        Head: 'Head',
        LeftArm: 'UpperArm_L',
        LeftForeArm: 'LowerArm_L',
        LeftHand: 'Hand_L',
        RightArm: 'UpperArm_R',
        RightForeArm: 'LowerArm_R',
        RightHand: 'Hand_R',
        LeftLeg: 'UpperLeg_L',
        LeftFoot: 'LowerLeg_L',
        LeftToeBase: 'Foot_L',
        RightLeg: 'UpperLeg_R',
        RightFoot: 'LowerLeg_R',
        RightToeBase: 'Foot_R',
      },
    });
  },

  motionAiPrompt: 'Character walks forward and waves with the right hand.',
  setMotionAiPrompt: (motionAiPrompt) => set({ motionAiPrompt }),
  motionAiDuration: 2.5,
  setMotionAiDuration: (motionAiDuration) => set({ motionAiDuration }),
  motionAiFps: 24,
  setMotionAiFps: (motionAiFps) => set({ motionAiFps }),
  motionAiSeed: null,
  setMotionAiSeed: (motionAiSeed) => set({ motionAiSeed }),
  motionAiIsGenerating: false,
  setMotionAiIsGenerating: (motionAiIsGenerating) => set({ motionAiIsGenerating }),
  motionAiStage: 'idle',
  setMotionAiStage: (motionAiStage) => set({ motionAiStage }),
  motionAiProgress: 0,
  setMotionAiProgress: (motionAiProgress) => set({ motionAiProgress }),
  motionAiError: null,
  setMotionAiError: (motionAiError) => set({ motionAiError }),

  blendState: {
    animA: 'anim-1', // Humanoid Idle
    animB: 'anim-4', // Walking Forward
    weight: 0.5,
    transitionDuration: 0.5,
  },
  setBlendState: (blend) => set((s) => ({ blendState: { ...s.blendState, ...blend } })),

  isExportModalOpen: false,
  setIsExportModalOpen: (isExportModalOpen) => set({ isExportModalOpen }),
}));
