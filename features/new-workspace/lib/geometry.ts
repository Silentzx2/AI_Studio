import * as THREE from 'three';
import { BoneNode } from '../types';

/**
 * Creates distinct high-quality procedural 3D meshes for the 3D Viewport
 * matching the reference screenshots.
 */
export function createModelMesh(meshType: string, faceTarget = 50000): THREE.Group {
  const rootGroup = new THREE.Group();
  rootGroup.name = `Model_${meshType}`;

  switch (meshType) {
    case 'goblin':
      buildGoblinMesh(rootGroup, faceTarget);
      break;
    case 'robot':
      buildRobotMesh(rootGroup, faceTarget);
      break;
    case 'statue':
      buildStatueMesh(rootGroup);
      break;
    case 'house':
      buildHouseMesh(rootGroup);
      break;
    case 'dog':
      buildDogMesh(rootGroup);
      break;
    case 'helmet':
      buildHelmetMesh(rootGroup);
      break;
    case 'car':
      buildCarMesh(rootGroup);
      break;
    case 'table':
      buildTableMesh(rootGroup);
      break;
    case 'vase':
      buildVaseMesh(rootGroup);
      break;
    case 'plant':
      buildPlantMesh(rootGroup);
      break;
    default:
      buildGoblinMesh(rootGroup, faceTarget);
  }

  return rootGroup;
}

// 1. Goblin Character (Screenshots 1 & 3)
function buildGoblinMesh(group: THREE.Group, faceTarget: number) {
  // Pedestal base
  const pedestalGeo = new THREE.CylinderGeometry(1.4, 1.6, 0.45, 32);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x9b856e,
    roughness: 0.85,
    metalness: 0.1,
    flatShading: true
  });
  const pedestal = new THREE.Mesh(pedestalGeo, stoneMat);
  pedestal.position.y = -1.2;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  group.add(pedestal);

  // Stepped stone base trim
  const trimGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.1, 32);
  const trim = new THREE.Mesh(trimGeo, stoneMat);
  trim.position.y = -1.4;
  group.add(trim);

  // Goblin Body / Robe
  const bodyGeo = new THREE.ConeGeometry(0.85, 1.4, 12);
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0x6e5b43,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true
  });
  const body = new THREE.Mesh(bodyGeo, clothMat);
  body.position.y = -0.4;
  body.castShadow = true;
  group.add(body);

  // Leather Belt & Buckle
  const beltGeo = new THREE.TorusGeometry(0.72, 0.08, 8, 20);
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x3d2714, roughness: 0.6 });
  const belt = new THREE.Mesh(beltGeo, beltMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = -0.55;
  group.add(belt);

  const buckleGeo = new THREE.BoxGeometry(0.24, 0.2, 0.1);
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xcaa03c, metalness: 0.8, roughness: 0.3 });
  const buckle = new THREE.Mesh(buckleGeo, goldMat);
  buckle.position.set(0, -0.55, 0.72);
  group.add(buckle);

  // Goblin Head - Big stylized low-poly faceted head
  const segs = faceTarget > 40000 ? 16 : 8;
  const headGeo = new THREE.DodecahedronGeometry(0.85, segs > 10 ? 2 : 1);
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x7da14d,
    roughness: 0.65,
    metalness: 0.1,
    flatShading: true
  });
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(0, 0.55, 0);
  head.scale.set(1.15, 0.95, 1.05);
  head.castShadow = true;
  group.add(head);

  // Goblin Pointed Ears (Left & Right)
  const earGeo = new THREE.ConeGeometry(0.35, 1.1, 6);
  const earMat = new THREE.MeshStandardMaterial({
    color: 0x98b868,
    roughness: 0.7,
    flatShading: true
  });

  const leftEar = new THREE.Mesh(earGeo, earMat);
  leftEar.rotation.z = -Math.PI / 3;
  leftEar.rotation.y = -0.2;
  leftEar.position.set(1.0, 0.7, -0.1);
  group.add(leftEar);

  const rightEar = new THREE.Mesh(earGeo, earMat);
  rightEar.rotation.z = Math.PI / 3;
  rightEar.rotation.y = 0.2;
  rightEar.position.set(-1.0, 0.7, -0.1);
  group.add(rightEar);

  // Eyes (Glowing Amber / Orange)
  const eyeGeo = new THREE.SphereGeometry(0.22, 16, 16);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xe67e22,
    emissive: 0xd35400,
    emissiveIntensity: 0.35,
    roughness: 0.2
  });

  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(0.36, 0.6, 0.7);
  group.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(-0.36, 0.6, 0.7);
  group.add(rightEye);

  // Pupils
  const pupilGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
  leftPupil.position.set(0.38, 0.6, 0.88);
  group.add(leftPupil);

  const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
  rightPupil.position.set(-0.38, 0.6, 0.88);
  group.add(rightPupil);

  // Pointed Nose
  const noseGeo = new THREE.ConeGeometry(0.18, 0.45, 5);
  const nose = new THREE.Mesh(noseGeo, earMat);
  nose.rotation.x = Math.PI / 2.2;
  nose.position.set(0, 0.48, 0.85);
  group.add(nose);

  // Sharp Daggers in Hands
  const daggerMat = new THREE.MeshStandardMaterial({ color: 0xc8ced8, metalness: 0.9, roughness: 0.2, flatShading: true });
  const bladeGeo = new THREE.ConeGeometry(0.12, 0.9, 4);

  const leftDagger = new THREE.Mesh(bladeGeo, daggerMat);
  leftDagger.position.set(0.95, -0.25, 0.4);
  leftDagger.rotation.x = Math.PI / 4;
  leftDagger.rotation.z = -0.3;
  group.add(leftDagger);

  const rightDagger = new THREE.Mesh(bladeGeo, daggerMat);
  rightDagger.position.set(-0.95, -0.25, 0.4);
  rightDagger.rotation.x = Math.PI / 4;
  rightDagger.rotation.z = 0.3;
  group.add(rightDagger);
}

// 2. Steampunk Companion Robot (Screenshot 2)
function buildRobotMesh(group: THREE.Group, faceTarget: number) {
  // Circular cobblestone pedestal
  const baseGeo = new THREE.CylinderGeometry(1.35, 1.45, 0.35, 28);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x3d3530, roughness: 0.9, metalness: 0.2, flatShading: true });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = -1.25;
  group.add(base);

  // Robot Body - Weathered Blue Painted Metal
  const robotMat = new THREE.MeshStandardMaterial({
    color: 0x688fa5,
    roughness: 0.45,
    metalness: 0.75,
    flatShading: faceTarget < 30000
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc99438,
    roughness: 0.35,
    metalness: 0.9
  });

  // Torso
  const torsoGeo = new THREE.SphereGeometry(0.78, 20, 20);
  const torso = new THREE.Mesh(torsoGeo, robotMat);
  torso.scale.set(1.0, 1.1, 0.95);
  torso.position.y = -0.3;
  torso.castShadow = true;
  group.add(torso);

  // Chest Dial Gauge
  const dialGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.08, 16);
  const dial = new THREE.Mesh(dialGeo, brassMat);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0, -0.2, 0.75);
  group.add(dial);

  // Head - Dome Spherical with visor
  const headGeo = new THREE.SphereGeometry(0.85, 24, 24);
  const head = new THREE.Mesh(headGeo, robotMat);
  head.scale.set(1.08, 0.95, 1.0);
  head.position.set(0, 0.65, 0);
  head.castShadow = true;
  group.add(head);

  // Antenna
  const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8);
  const pole = new THREE.Mesh(poleGeo, brassMat);
  pole.position.set(0, 1.6, 0);
  group.add(pole);

  const ballGeo = new THREE.SphereGeometry(0.12, 12, 12);
  const ball = new THREE.Mesh(ballGeo, brassMat);
  ball.position.set(0, 1.9, 0);
  group.add(ball);

  // Glowing Yellow Eyes inside dark visor
  const visorGeo = new THREE.BoxGeometry(0.9, 0.4, 0.2);
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.3 });
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 0.65, 0.76);
  group.add(visor);

  const eyeGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0xff8800,
    emissiveIntensity: 0.8,
    roughness: 0.2
  });

  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.rotation.x = Math.PI / 2;
  leftEye.position.set(0.28, 0.65, 0.85);
  group.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.rotation.x = Math.PI / 2;
  rightEye.position.set(-0.28, 0.65, 0.85);
  group.add(rightEye);

  // Segmented arms & hands
  const armGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.8, 12);
  const leftArm = new THREE.Mesh(armGeo, robotMat);
  leftArm.position.set(0.9, -0.3, 0);
  leftArm.rotation.z = -0.25;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, robotMat);
  rightArm.position.set(-0.9, -0.3, 0);
  rightArm.rotation.z = 0.25;
  group.add(rightArm);
}

// 3. Classical Marble Statue
function buildStatueMesh(group: THREE.Group) {
  const marbleMat = new THREE.MeshStandardMaterial({ color: 0xe0ddd7, roughness: 0.7, metalness: 0.05, flatShading: true });
  
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), marbleMat);
  base.position.y = -1.2;
  group.add(base);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 1.6, 16), marbleMat);
  body.position.y = -0.2;
  group.add(body);

  const chest = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 1), marbleMat);
  chest.position.y = 0.6;
  group.add(chest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), marbleMat);
  head.position.y = 1.35;
  group.add(head);
}

// 4. Medieval House / Cottage
function buildHouseMesh(group: THREE.Group) {
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a7765, roughness: 0.8, flatShading: true });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x7c4331, roughness: 0.6, flatShading: true });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4e3322, roughness: 0.7 });

  const ground = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.8, 0.3, 16), stoneMat);
  ground.position.y = -1.2;
  group.add(ground);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.3), stoneMat);
  walls.position.y = -0.4;
  group.add(walls);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.1, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.75;
  group.add(roof);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), woodMat);
  chimney.position.set(0.45, 0.9, 0.2);
  group.add(chimney);
}

// 5. Stylized Dog / Shiba
function buildDogMesh(group: THREE.Group) {
  const furMat = new THREE.MeshStandardMaterial({ color: 0xd88a38, roughness: 0.7, flatShading: true });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xefede8, roughness: 0.6, flatShading: true });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.8, 8, 12), furMat);
  body.rotation.x = Math.PI / 2.5;
  body.position.set(0, -0.4, 0);
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), furMat);
  head.position.set(0, 0.45, 0.5);
  group.add(head);

  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 8), whiteMat);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.35, 0.95);
  group.add(snout);

  const leftEar = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 4), furMat);
  leftEar.position.set(0.32, 0.85, 0.45);
  leftEar.rotation.z = -0.2;
  group.add(leftEar);

  const rightEar = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 4), furMat);
  rightEar.position.set(-0.32, 0.85, 0.45);
  rightEar.rotation.z = 0.2;
  group.add(rightEar);
}

// 6. Knight Helmet
function buildHelmetMesh(group: THREE.Group) {
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x6e7682, metalness: 0.95, roughness: 0.2, flatShading: true });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.25 });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 20), steelMat);
  dome.scale.set(0.9, 1.1, 1.0);
  dome.position.y = 0.1;
  group.add(dome);

  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 1.4), goldMat);
  crest.position.set(0, 1.15, 0);
  group.add(crest);

  const visor = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.15, 8, 16, Math.PI), steelMat);
  visor.rotation.x = Math.PI / 2;
  visor.position.set(0, 0.1, 0.35);
  group.add(visor);
}

// 7. Sports Car
function buildCarMesh(group: THREE.Group) {
  const paintMat = new THREE.MeshStandardMaterial({ color: 0x225588, metalness: 0.85, roughness: 0.2 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2536, roughness: 0.1, metalness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 3.2), paintMat);
  body.position.y = -0.2;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 1.6), glassMat);
  cabin.position.set(0, 0.25, -0.2);
  group.add(cabin);

  // 4 Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
  const pos: [number, number, number][] = [
    [0.9, -0.35, 0.9],
    [-0.9, -0.35, 0.9],
    [0.9, -0.35, -0.9],
    [-0.9, -0.35, -0.9]
  ];
  pos.forEach(p => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(...p);
    group.add(wheel);
  });
}

// 8. Rustic Table
function buildTableMesh(group: THREE.Group) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3b23, roughness: 0.75 });

  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.4), woodMat);
  top.position.y = 0.2;
  group.add(top);

  const legGeo = new THREE.BoxGeometry(0.16, 1.2, 0.16);
  const legPositions: [number, number, number][] = [
    [1.0, -0.4, 0.55],
    [-1.0, -0.4, 0.55],
    [1.0, -0.4, -0.55],
    [-1.0, -0.4, -0.55]
  ];
  legPositions.forEach(p => {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(...p);
    group.add(leg);
  });
}

// 9. Ceramic Vase
function buildVaseMesh(group: THREE.Group) {
  const vaseMat = new THREE.MeshStandardMaterial({ color: 0x9e6c4e, roughness: 0.35, metalness: 0.1 });
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = (t - 0.5) * 2.4;
    const r = Math.sin(t * Math.PI) * 0.75 + 0.25;
    points.push(new THREE.Vector2(r, y));
  }
  const vaseGeo = new THREE.LatheGeometry(points, 24);
  const vase = new THREE.Mesh(vaseGeo, vaseMat);
  group.add(vase);
}

// 10. Plant
function buildPlantMesh(group: THREE.Group) {
  const potMat = new THREE.MeshStandardMaterial({ color: 0x824d32, roughness: 0.8 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e6b38, roughness: 0.6, side: THREE.DoubleSide });

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.45, 0.8, 16), potMat);
  pot.position.y = -0.8;
  group.add(pot);

  // Leaves radiating outwards
  const leafGeo = new THREE.PlaneGeometry(0.4, 1.2, 4, 8);
  for (let i = 0; i < 8; i++) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.rotation.y = (i / 8) * Math.PI * 2;
    leaf.rotation.x = 0.45 + (i % 2) * 0.2;
    leaf.position.set(0, -0.2, 0);
    group.add(leaf);
  }
}

/**
 * Standard humanoid bone skeleton structure for rigging & animation
 */
export const DEFAULT_HUMANOID_SKELETON: BoneNode[] = [
  { id: 'root', name: 'Root', parent: null, position: [0, -1.0, 0], rotation: [0, 0, 0], length: 0.3, type: 'root', children: ['hips'] },
  { id: 'hips', name: 'Hips / Pelvis', parent: 'root', position: [0, -0.4, 0], rotation: [0, 0, 0], length: 0.3, type: 'spine', children: ['spine', 'leg_left', 'leg_right'] },
  { id: 'spine', name: 'Spine', parent: 'hips', position: [0, 0.1, 0], rotation: [0, 0, 0], length: 0.4, type: 'spine', children: ['chest'] },
  { id: 'chest', name: 'Chest', parent: 'spine', position: [0, 0.5, 0], rotation: [0, 0, 0], length: 0.35, type: 'spine', children: ['neck', 'arm_left', 'arm_right'] },
  { id: 'neck', name: 'Neck', parent: 'chest', position: [0, 0.85, 0], rotation: [0, 0, 0], length: 0.2, type: 'head', children: ['head'] },
  { id: 'head', name: 'Head', parent: 'neck', position: [0, 1.1, 0], rotation: [0, 0, 0], length: 0.3, type: 'head', children: [] },
  { id: 'arm_left', name: 'Arm.L (Shoulder -> Hand)', parent: 'chest', position: [0.5, 0.6, 0], rotation: [0, 0, -0.4], length: 0.6, type: 'limb', children: ['hand_left'] },
  { id: 'hand_left', name: 'Hand.L', parent: 'arm_left', position: [0.95, 0.1, 0], rotation: [0, 0, 0], length: 0.25, type: 'limb', children: [] },
  { id: 'arm_right', name: 'Arm.R (Shoulder -> Hand)', parent: 'chest', position: [-0.5, 0.6, 0], rotation: [0, 0, 0.4], length: 0.6, type: 'limb', children: ['hand_right'] },
  { id: 'hand_right', name: 'Hand.R', parent: 'arm_right', position: [-0.95, 0.1, 0], rotation: [0, 0, 0], length: 0.25, type: 'limb', children: [] },
  { id: 'leg_left', name: 'Leg.L (Thigh -> Foot)', parent: 'hips', position: [0.3, -0.7, 0], rotation: [0, 0, 0], length: 0.7, type: 'limb', children: ['foot_left'] },
  { id: 'foot_left', name: 'Foot.L', parent: 'leg_left', position: [0.35, -1.2, 0.1], rotation: [0, 0, 0], length: 0.25, type: 'limb', children: [] },
  { id: 'leg_right', name: 'Leg.R (Thigh -> Foot)', parent: 'hips', position: [-0.3, -0.7, 0], rotation: [0, 0, 0], length: 0.7, type: 'limb', children: ['foot_right'] },
  { id: 'foot_right', name: 'Foot.R', parent: 'leg_right', position: [-0.35, -1.2, 0.1], rotation: [0, 0, 0], length: 0.25, type: 'limb', children: [] }
];
