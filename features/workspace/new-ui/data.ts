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
export const sportsShoeShapes: Shape3D[] = [
  // Shoe Outsole
  { type: 'box', position: [0, -1.0, 0.05], rotation: [0, 0, 0], scale: [0.65, 0.12, 1.8], color: '#FFA500', roughness: 0.9, metalness: 0.0, name: 'outsole' },
  // Shoe Midsole cushioning
  { type: 'box', position: [0, -0.9, 0.0], rotation: [0, 0, 0], scale: [0.7, 0.15, 1.75], color: '#FFFFFF', roughness: 0.95, metalness: 0.0, name: 'midsole' },
  // Front Toe box
  { type: 'sphere', position: [0, -0.72, 0.65], rotation: [0, 0, 0], scale: [0.65, 0.4, 0.65], color: '#1F2937', roughness: 0.9, metalness: 0.0, name: 'toe_mesh' },
  // Midfoot lateral walls
  { type: 'box', position: [0, -0.68, 0.05], rotation: [0, 0, 0], scale: [0.66, 0.45, 0.9], color: '#111827', roughness: 0.8, metalness: 0.1, name: 'midfoot_panel' },
  // Heel counter
  { type: 'sphere', position: [0, -0.6, -0.65], rotation: [0, 0, 0], scale: [0.6, 0.6, 0.6], color: '#1F2937', roughness: 0.7, metalness: 0.2, name: 'heel_cup' },
  // Ankle collar cushion
  { type: 'torus', position: [0, -0.3, -0.45], rotation: [0.35, 0, 0], scale: [0.45, 0.45, 0.4], color: '#FFA500', roughness: 0.95, metalness: 0.0, name: 'ankle_collar' },
  // Tongue
  { type: 'box', position: [0, -0.42, 0.1], rotation: [-0.4, 0, 0], scale: [0.4, 0.6, 0.15], color: '#FFA500', roughness: 0.9, metalness: 0.0, name: 'shoe_tongue' },
  // Swoosh/Stripe Left/Right
  { type: 'box', position: [-0.34, -0.62, 0.05], rotation: [0.2, 0.1, -0.2], scale: [0.03, 0.15, 0.65], color: '#FFFFFF', roughness: 0.4, metalness: 0.1, name: 'logo_lateral' },
  { type: 'box', position: [0.34, -0.62, 0.05], rotation: [0.2, -0.1, 0.2], scale: [0.03, 0.15, 0.65], color: '#FFFFFF', roughness: 0.4, metalness: 0.1, name: 'logo_medial' },
];

// Geometric primitives structure for 'Futuristic Car'
export const futuristicCarShapes: Shape3D[] = [
  // Main chassis floor
  { type: 'box', position: [0, -0.7, 0], rotation: [0, 0, 0], scale: [1.6, 0.15, 3.2], color: '#1A1A1A', roughness: 0.8, metalness: 0.6, name: 'chassis' },
  // Front aerodynamic splitter
  { type: 'box', position: [0, -0.72, 1.65], rotation: [0, 0, 0], scale: [1.55, 0.08, 0.3], color: '#F5A623', roughness: 0.2, metalness: 0.9, name: 'front_splitter' },
  // Main lower body
  { type: 'box', position: [0, -0.52, 0.05], rotation: [0, 0, 0], scale: [1.56, 0.35, 3.0], color: '#121212', roughness: 0.3, metalness: 0.9, name: 'car_body_lower' },
  // Hood / Engine cover
  { type: 'box', position: [0, -0.38, 0.95], rotation: [-0.15, 0, 0], scale: [1.45, 0.18, 1.2], color: '#1C1C1C', roughness: 0.2, metalness: 0.8, name: 'car_hood' },
  // Streamlined Cabin glass dome
  { type: 'sphere', position: [0, -0.2, -0.25], rotation: [0, 0, 0], scale: [1.25, 0.55, 1.55], color: '#F5A623', roughness: 0.05, metalness: 0.95, name: 'cabin_cockpit' },
  // Rear boot/haunches
  { type: 'box', position: [0, -0.35, -1.15], rotation: [0.08, 0, 0], scale: [1.5, 0.25, 0.9], color: '#121212', roughness: 0.3, metalness: 0.9, name: 'rear_haunches' },
  // Spoiler Wing
  { type: 'box', position: [0, -0.1, -1.45], rotation: [0.05, 0, 0], scale: [1.55, 0.04, 0.25], color: '#F5A623', roughness: 0.2, metalness: 0.9, name: 'spoiler_blade' },
  { type: 'box', position: [-0.68, -0.25, -1.42], rotation: [0, 0, 0], scale: [0.04, 0.3, 0.15], color: '#111111', roughness: 0.3, metalness: 0.8, name: 'spoiler_strut_l' },
  { type: 'box', position: [0.68, -0.25, -1.42], rotation: [0, 0, 0], scale: [0.04, 0.3, 0.15], color: '#111111', roughness: 0.3, metalness: 0.8, name: 'spoiler_strut_r' },
  // Wheels (4 Cylinders)
  { type: 'cylinder', position: [-0.85, -0.65, 0.95], rotation: [0, 0, Math.PI / 2], scale: [0.6, 0.32, 0.6], color: '#2A2A2A', roughness: 0.7, metalness: 0.2, name: 'wheel_fl' },
  { type: 'cylinder', position: [0.85, -0.65, 0.95], rotation: [0, 0, Math.PI / 2], scale: [0.6, 0.32, 0.6], color: '#2A2A2A', roughness: 0.7, metalness: 0.2, name: 'wheel_fr' },
  { type: 'cylinder', position: [-0.88, -0.62, -0.95], rotation: [0, 0, Math.PI / 2], scale: [0.65, 0.35, 0.65], color: '#2A2A2A', roughness: 0.7, metalness: 0.2, name: 'wheel_rl' },
  { type: 'cylinder', position: [0.88, -0.62, -0.95], rotation: [0, 0, Math.PI / 2], scale: [0.65, 0.35, 0.65], color: '#2A2A2A', roughness: 0.7, metalness: 0.2, name: 'wheel_rr' },
];

// Geometric primitives structure for 'Sci-Fi Robot Head'
export const robotHeadShapes: Shape3D[] = [
  // Neck base assembly
  { type: 'cylinder', position: [0, -1.0, 0], rotation: [0, 0, 0], scale: [0.45, 0.4, 0.45], color: '#3A3A3A', roughness: 0.4, metalness: 0.8, name: 'neck_mount' },
  { type: 'torus', position: [0, -0.85, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.38, 0.38, 0.3], color: '#F5A623', roughness: 0.2, metalness: 0.9, name: 'neck_joint' },
  // Main metallic head block
  { type: 'box', position: [0, -0.2, 0], rotation: [0, 0, 0], scale: [1.1, 0.95, 1.1], color: '#1F2022', roughness: 0.2, metalness: 0.85, name: 'head_chassis' },
  // Face plate
  { type: 'box', position: [0, -0.22, 0.52], rotation: [0, 0, 0], scale: [0.95, 0.8, 0.12], color: '#111111', roughness: 0.05, metalness: 0.9, name: 'visor_plate' },
  // Cybernetic Visor Bar (Glow eye)
  { type: 'box', position: [0, -0.15, 0.58], rotation: [0, 0, 0], scale: [0.8, 0.14, 0.08], color: '#F5A623', roughness: 0.1, metalness: 0.9, name: 'glowing_eye' },
  // Side Ear sensors Left/Right
  { type: 'cylinder', position: [-0.58, -0.2, 0], rotation: [0, 0, Math.PI / 2], scale: [0.3, 0.15, 0.3], color: '#333333', roughness: 0.5, metalness: 0.7, name: 'ear_hub_l' },
  { type: 'cylinder', position: [0.58, -0.2, 0], rotation: [0, 0, Math.PI / 2], scale: [0.3, 0.15, 0.3], color: '#333333', roughness: 0.5, metalness: 0.7, name: 'ear_hub_r' },
  { type: 'cone', position: [-0.66, -0.2, 0], rotation: [0, 0, Math.PI / 2], scale: [0.15, 0.2, 0.15], color: '#F5A623', roughness: 0.2, metalness: 0.95, name: 'ear_bolt_l' },
  { type: 'cone', position: [0.66, -0.2, 0], rotation: [0, 0, -Math.PI / 2], scale: [0.15, 0.2, 0.15], color: '#F5A623', roughness: 0.2, metalness: 0.95, name: 'ear_bolt_r' },
  // Crown head plates
  { type: 'box', position: [0, 0.32, -0.1], rotation: [-0.1, 0, 0], scale: [1.0, 0.14, 1.15], color: '#F5A623', roughness: 0.3, metalness: 0.8, name: 'crown_shield' },
  // Antenna mast
  { type: 'cylinder', position: [0, 0.5, -0.1], rotation: [0, 0, 0], scale: [0.06, 0.4, 0.06], color: '#444444', roughness: 0.3, metalness: 0.9, name: 'antenna_rod' },
  { type: 'sphere', position: [0, 0.72, -0.1], rotation: [0, 0, 0], scale: [0.12, 0.12, 0.12], color: '#F5A623', roughness: 0.1, metalness: 0.95, name: 'antenna_tip' },
];
