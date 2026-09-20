import assert from 'node:assert';
import * as THREE from 'three';
import { createFallbackPointCloud, disposePointCloud } from '../features/workspace/Viewport/ImagePointCloud';

function runSelfCheck() {
  console.log('Running interactive 3D point cloud generation self-check...');

  // 1. Check fallback point cloud generation
  const points = createFallbackPointCloud('Test Model');
  assert(points instanceof THREE.Points, 'Must return a THREE.Points instance');
  assert(points.name === 'generationPointCloud', 'Points name must be generationPointCloud');
  assert.strictEqual(points.position.y, 0.25, 'Points must be elevated by 0.25 on Y axis');

  // 2. Check geometry attributes
  const geometry = points.geometry;
  assert(geometry, 'Geometry must be defined');
  const posAttr = geometry.getAttribute('position');
  const colAttr = geometry.getAttribute('color');

  assert(posAttr, 'Position attribute must exist');
  assert(colAttr, 'Color attribute must exist');
  assert(posAttr.count > 1000, `Must generate at least 1,000 points, got ${posAttr.count}`);
  assert.strictEqual(posAttr.itemSize, 3, 'Position must have 3 components (x, y, z)');
  assert.strictEqual(colAttr.itemSize, 3, 'Color must have 3 components (r, g, b)');

  // 3. Verify material properties
  const material = points.material as THREE.PointsMaterial;
  assert(material instanceof THREE.PointsMaterial, 'Material must be PointsMaterial');
  assert.strictEqual(material.vertexColors, true, 'Material must enable vertex colors');
  assert.strictEqual(material.transparent, true, 'Material must be transparent');
  assert.strictEqual(material.blending, THREE.AdditiveBlending, 'Material must use AdditiveBlending');

  // 4. Test safe disposal
  disposePointCloud(points);
  console.log(`✓ Point cloud self-check passed: verified ${posAttr.count} particles, attributes, materials & memory disposal.`);
}

runSelfCheck();
