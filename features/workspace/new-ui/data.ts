/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Shape3D } from '@/types/new-ui';

// Geometric primitives structure for 'Modern Office Chair'
export const officeChairShapes: Shape3D[] = [
  // Wheels/base stars
  { type: 'sphere', position: [0.6, -1.1, 0.6], rotation: [0, 0, 0], scale: [0.18, 0.18, 0.18], color: '#111111', roughness: 0.8, metalness: 0.1, name: 'wheel_fr' },
  { type: 'sphere', position: [-0.6, -1.1, 0.6], rotation: [0, 0, 0], scale: [0.18, 0.18, 0.18], color: '#111111', roughness: 0.8, metalness: 0.1, name: 'wheel_fl' },
  { type: 'sphere', position: [0.6, -1.1, -0.6], rotation: [0, 0, 0], scale: [0.18, 0.18, 0.18], color: '#111111', roughness: 0.8, metalness: 0.1, name: 'wheel_br' },
  { type: 'sphere', position: [-0.6, -1.1, -0.6], rotation: [0, 0, 0], scale: [0.18, 0.18, 0.18], color: '#111111', roughness: 0.8, metalness: 0.1, name: 'wheel_bl' },
  // Five-star base legs
  { type: 'box', position: [0, -1.0, 0], rotation: [0, 0.78, 0], scale: [1.3, 0.08, 0.15], color: '#2A2A2A', roughness: 0.3, metalness: 0.8, name: 'base_beam1' },
  { type: 'box', position: [0, -1.0, 0], rotation: [0, -0.78, 0], scale: [1.3, 0.08, 0.15], color: '#2A2A2A', roughness: 0.3, metalness: 0.8, name: 'base_beam2' },
  // Main pneumatic cylinder
  { type: 'cylinder', position: [0, -0.5, 0], rotation: [0, 0, 0], scale: [0.16, 0.9, 0.16], color: '#1E1E1E', roughness: 0.1, metalness: 0.95, name: 'gas_lift' },
  { type: 'cylinder', position: [0, -0.3, 0], rotation: [0, 0, 0], scale: [0.24, 0.4, 0.24], color: '#333333', roughness: 0.6, metalness: 0.2, name: 'lift_sleeve' },
  // Seat tilt mechanism
  { type: 'box', position: [0, -0.05, 0], rotation: [0, 0, 0], scale: [0.5, 0.15, 0.5], color: '#111111', roughness: 0.7, metalness: 0.4, name: 'under_seat_housing' },
  // Seat Cushion
  { type: 'box', position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1.1, 0.16, 1.1], color: '#1C1C1C', roughness: 0.9, metalness: 0.05, name: 'seat_cushion' },
  // Armrests Left/Right
  { type: 'cylinder', position: [-0.62, 0.3, 0], rotation: [0, 0, 0], scale: [0.08, 0.4, 0.08], color: '#2A2A2A', roughness: 0.3, metalness: 0.8, name: 'arm_support_l' },
  { type: 'cylinder', position: [0.62, 0.3, 0], rotation: [0, 0, 0], scale: [0.08, 0.4, 0.08], color: '#2A2A2A', roughness: 0.3, metalness: 0.8, name: 'arm_support_r' },
  { type: 'box', position: [-0.62, 0.52, 0.05], rotation: [0, 0, 0], scale: [0.15, 0.06, 0.55], color: '#121212', roughness: 0.95, metalness: 0.0, name: 'armrest_pad_l' },
  { type: 'box', position: [0.62, 0.52, 0.05], rotation: [0, 0, 0], scale: [0.15, 0.06, 0.55], color: '#121212', roughness: 0.95, metalness: 0.0, name: 'armrest_pad_r' },
  // Backrest support spine
  { type: 'box', position: [0, 0.4, -0.48], rotation: [0.08, 0, 0], scale: [0.12, 0.9, 0.08], color: '#2A2A2A', roughness: 0.3, metalness: 0.8, name: 'back_spine' },
  // Backrest cushion
  { type: 'box', position: [0, 0.88, -0.48], rotation: [0.06, 0, 0], scale: [1.0, 0.95, 0.12], color: '#1C1C1C', roughness: 0.9, metalness: 0.05, name: 'back_cushion' },
  // Headrest
  { type: 'box', position: [0, 1.42, -0.52], rotation: [0.1, 0, 0], scale: [0.55, 0.25, 0.1], color: '#121212', roughness: 0.8, metalness: 0.0, name: 'headrest' },
];

// Geometric primitives structure for 'Sports Shoe Concept'

// Geometric primitives structure for 'Futuristic Car'

// Geometric primitives structure for 'Sci-Fi Robot Head'
