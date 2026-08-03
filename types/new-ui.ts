/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Shape3D {
  type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  roughness: number;
  metalness: number;
  name: string;
}

export interface Model3DResponse {
  name: string;
  description: string;
  color: string;
  accentColor: string;
  shapes: Shape3D[];
  estimatedTime: string;
  complexity: string;
  textures: string;
  promptDescription: string;
}

export interface HistoryItem {
  id: string;
  prompt: string;
  name: string;
  timestamp: string;
  format: 'GLB' | 'OBJ' | 'FBX';
  shapes: Shape3D[];
  color: string;
  accentColor: string;
  isFavorite?: boolean;
}

export interface ProgressStep {
  id: 'prompt' | 'ai' | 'geometry' | 'texturing' | 'finalizing';
  label: string;
  status: 'pending' | 'active' | 'completed';
  percentage?: number;
  details?: string;
}

export interface GenerationSettings {
  remesh: boolean;
  removeBackground: boolean;
  autoUvUnwrap: boolean;
  symmetry: boolean;
  outputFormat: 'GLB' | 'OBJ' | 'FBX';
}
