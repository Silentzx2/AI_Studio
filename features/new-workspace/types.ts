import type { JobDiagnostic } from '@/lib/jobDiagnostics';

export type ToolType =
  | 'model'
  | 'segment'
  | 'remesh'
  | 'texture'
  | 'edit'
  | 'upscale'
  | 'pbr'
  | 'environment';

export interface ActiveTask {
  id: string;
  type: 'image-to-3d' | 'segment' | 'remesh' | 'texture';
  title: string;
  inputImage?: string;
  inputImageName?: string;
  startedAt: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted';
  progress: number; // 0 to 100
  currentStep: string;
  activeNode?: string;
  queuePosition?: number;
  totalPending?: number;
  estimatedRemainingSec?: number;
  provider?: string;
  errorMessage?: string;
  diagnostic?: JobDiagnostic | null;
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
  category: 'all' | 'mesh' | 'texture' | 'generation';
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
  artifacts?: {
    source?: string;
    gameReady?: string;
    lods?: string[];
    collision?: string;
    qaReport?: Record<string, unknown>;
  };
  qaScore?: number;
  qaStatus?: 'pass' | 'warn' | 'fail';
  qaWarnings?: string[];
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

export interface EnvironmentSettings {
  ambientIntensity: number;
  keyLightIntensity: number;
  fillLightIntensity: number;
  rimLightIntensity: number;
  exposure: number;
  gridVisible: boolean;
  gridColor: string;
  backgroundColor: string;
  autoRotate: boolean;
  showAxes: boolean;
  showStats: boolean;
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
  modelId: string;
  maps: {
    albedo: boolean;
    normal: boolean;
    roughness: boolean;
    metallic: boolean;
    ao: boolean;
    height: boolean;
  };
  lowVram?: boolean;
}

export interface AutoOptimizeSettings {
  targetPolycount: number;
  fixUVs: boolean;
  preserveDetails: number;
}

export interface GenerationSettings {
  mode: 'image-to-3d';
  image: string | null;
  aiModel: string;
  meshQuality: 'low' | 'medium' | 'high' | 'ultra';
  textureQuality: 'low' | 'medium' | 'high' | '8k';
  quadTopology: boolean;
  seed: number;
  guidanceScale: number;
  removeBackground: boolean;
  lowVram?: boolean;
  vramMode?: 'auto' | 'normal' | 'low';
  autoOptimize: boolean;
  autoOptimizeSettings: AutoOptimizeSettings;
  generateTexture?: boolean;
  gameReady?: boolean;
  targetPlatform?: 'generic' | 'mobile' | 'low' | 'medium' | 'high' | 'cinematic';
  generateLOD?: boolean;
  lodPreset?: 'mobile' | 'low' | 'medium' | 'high' | 'custom';
  lodCount?: number;
  generateCollision?: boolean;
  generatePBR?: boolean;
  preserveDetails?: number;
  repairUVs?: boolean;
  prompt?: string;
  imageName?: string;
}



export interface CompareSettings {
  syncCamera: boolean;
  leftAssetId: string | null;
  rightAssetId: string | null;
  shadingMode: ShadingMode;
  showWireframe: boolean;
  showGrid: boolean;
}
