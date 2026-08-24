export type ToolType = 
  | 'model' 
  | 'segment'
  | 'retopo' 
  | 'remesh' 
  | 'texture' 
  | 'edit' 
  | 'upscale' 
  | 'pbr' 
  | 'animate' 
  | 'rigging';

export interface ActiveTask {
  id: string;
  type: 'text-to-3d' | 'image-to-3d' | 'segment' | 'retopo' | 'texture' | 'animate' | 'rigging';
  title: string;
  promptText?: string;
  inputImage?: string;
  startedAt: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted';
  progress: number; // 0 to 100
  currentStep: string;
  activeNode?: string;
  queuePosition?: number;
  totalPending?: number;
  estimatedRemainingSec?: number;
}

export type MainNavRoute = 'workspace' | 'dashboard' | 'assets' | 'system' | 'settings';

export type ShadingMode = 
  | 'textured' 
  | 'clay' 
  | 'matcap-gold' 
  | 'matcap-normal' 
  | 'matcap-chrome' 
  | 'matcap-ceramic' 
  | 'matcap-turquoise'
  | 'wireframe' 
  | 'xray'
  | 'pbr'
  | 'normals'
  | 'matcap';

export type CameraViewPreset = 'perspective' | 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'ortho';

export interface ModelAsset {
  id: string;
  name: string;
  category: 'all' | 'mesh' | 'texture' | 'generation' | 'animation';
  thumbnail: string;
  source?: { filename: string; subfolder: string; type: string; viewUrl?: string; mime?: string; localUrl?: string; promptId?: string; nodeId?: string };
  previewColor?: string;
  meshType: 'goblin' | 'robot' | 'statue' | 'house' | 'dog' | 'table' | 'helmet' | 'car' | 'vase' | 'plant' | 'custom';
  faces: number;
  vertices: number;
  triangles: number;
  statsAvailable?: boolean;
  topology: 'Triangle' | 'Quad' | 'Adaptive';
  format: 'GLB' | 'OBJ' | 'PLY' | 'FBX' | 'STL' | 'IMAGE' | 'FILE';
  dateCreated: string;
  tags: string[];
  isFavorite?: boolean;
  materialConfig?: MaterialConfig;
  materials?: string[];
  createdAt?: string;
}

export type Asset3D = ModelAsset;

export interface MaterialConfig {
  roughness: number;
  metalness: number;
  color: string;
  wireframe: boolean;
  wireframeColor: string;
  normalScale: number;
  aoIntensity: number;
  style: 'realistic' | 'game' | 'stylized' | 'anime';
}

export interface BoneNode {
  id: string;
  name: string;
  parent: string | null;
  position: [number, number, number];
  rotation: [number, number, number];
  length: number;
  type: 'root' | 'spine' | 'limb' | 'head' | 'accessory';
  children: string[];
}

export interface AnimationTrack {
  id: string;
  name: string;
  type: 'root' | 'bone' | 'morph' | 'transform';
  keyframes: { frame: number; value: number | [number, number, number] }[];
  color: string;
}

export interface SystemStats {
  status: 'online' | 'offline' | 'connecting' | 'error';
  host: string;
  gpu: string;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
  ramUsedGb: number | null;
  ramTotalGb: number | null;
  torchVramUsedGb: number | null;
  torchVramTotalGb: number | null;
  gpuType: string | null;
  gpuIndex: number | null;
  pythonVersion: string | null;
  torchVersion: string | null;
  apiVersion: string | null;
  queueRunning: number;
  queuePending: number;
  activePromptId: string | null;
  activeNode: string | null;
  lastPingMs: number;
}

export interface SegmentationSettings {
  mode: 'auto' | 'manual';
  target: 'full' | 'character' | 'part';
  selectedPart: string;
  feather: number;
  preserveTextures: boolean;
}

export interface RemeshSettings {
  tab: 'auto' | 'manual';
  preset: 'low' | 'medium' | 'high' | 'custom';
  targetFaces: number;
  mode: 'adaptive' | 'uniform';
  preserveShape: boolean;
  preserveSharpEdges: boolean;
  preserveUVs: boolean;
  detailPreservation: number;
  boundaryProtection: number;
  voxelSize: number;
}

export interface TextureSettings {
  workflow: 'texture' | 'pbr';
  mode: 'ai' | 'manual';
  style: 'realistic' | 'game' | 'stylized' | 'anime';
  resolution: '1K' | '2K' | '4K' | '8K';
  referenceImage: string | null;
  prompt: string;
  maps: {
    albedo: boolean;
    normal: boolean;
    roughness: boolean;
    metallic: boolean;
    ao: boolean;
    height: boolean;
  };
}

export interface GenerationSettings {
  mode: 'image-to-3d' | 'text-to-3d';
  image: string | null;
  prompt: string;
  aiModel: string;
  meshQuality: 'low' | 'medium' | 'high' | 'ultra';
  textureQuality: 'low' | 'medium' | 'high' | '8k';
  quadTopology: boolean;
  seed: number;
  guidanceScale: number;
  removeBackground: boolean;
}

export interface AnimateSettings {
  mode: 'animation' | 'rigging';
  type: 'text-to-motion' | 'presets' | 'upload';
  prompt: string;
  preset: 'idle' | 'walk' | 'run' | 'jump' | 'combat' | 'dance' | 'wave';
  intensity: number;
  speed: number;
  loop: boolean;
}

export interface RiggingSettings {
  tab: 'rigging' | 'skinning';
  rigType: 'humanoid' | 'quadruped';
  autoRig: boolean;
  bonesDetection: boolean;
  symmetry: boolean;
  boneSize: number;
  boneCount: number;
}
