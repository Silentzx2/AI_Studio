export type WorldGenMood =
  | 'fantasy'
  | 'sci-fi'
  | 'cyberpunk'
  | 'post-apocalyptic'
  | 'medieval'
  | 'tropical';

export type WorldGenShape =
  | 'flat'
  | 'hills'
  | 'mountains'
  | 'archipelago'
  | 'canyon';

export type WorldGenStyle = 'realistic' | 'stylized' | 'low-poly' | 'voxel';

export type GenerationPreset = 'balanced' | 'speed' | 'quality';

export interface EnvironmentUpload {
  name: string;
  previewUrl: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface WorldGenSettings {
  prompt: string;
  mood: WorldGenMood;
  shape: WorldGenShape;
  style: WorldGenStyle;
  preset: GenerationPreset;
  resolution: '1K' | '2K' | '4K';
  seed: number;
  guidance: number;
  size: number;
  density: number;
  autoOptimize: boolean;
  textureAtlas: boolean;
  environmentUpload: EnvironmentUpload | null;
  referenceImage?: EnvironmentUpload | null;
}

export type ViewportMode = 'world' | 'terrain' | 'wireframe';
