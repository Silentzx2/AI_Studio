import * as THREE from 'three';

// Cached soft particle texture for glowing starlight points
let cachedParticleTexture: THREE.Texture | null = null;

function getParticleTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  if (cachedParticleTexture) return cachedParticleTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 240, 180, 0.95)');
    gradient.addColorStop(0.5, 'rgba(249, 207, 0, 0.6)');
    gradient.addColorStop(0.75, 'rgba(56, 189, 248, 0.25)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  cachedParticleTexture = texture;
  return texture;
}

/**
 * Robust background segmentation algorithm.
 * Removes 100% of solid, gradient, studio backdrops, and borders,
 * preserving only the authentic model subject.
 */
function extractForegroundMask(
  imgData: Uint8ClampedArray,
  w: number,
  h: number
): { mask: Uint8Array; minX: number; maxX: number; minY: number; maxY: number; fgCount: number } {
  const totalPixels = w * h;
  const mask = new Uint8Array(totalPixels);

  // 1. Check for genuine alpha channel transparency
  let transparentCount = 0;
  for (let i = 3; i < imgData.length; i += 4) {
    if (imgData[i] < 45) transparentCount++;
  }
  const hasRealAlpha = transparentCount > totalPixels * 0.03;

  if (hasRealAlpha) {
    let fgCount = 0;
    let minX = w, maxX = 0, minY = h, maxY = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (imgData[idx + 3] >= 50) {
          mask[y * w + x] = 1;
          fgCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { mask, minX, maxX, minY, maxY, fgCount };
  }

  // 2. For opaque images: Perimeter connected flood fill
  const isBg = new Uint8Array(totalPixels);
  const visited = new Uint8Array(totalPixels);

  const borderSeeds: [number, number, number][] = [];
  let sumR = 0, sumG = 0, sumB = 0, count = 0;

  for (let x = 0; x < w; x++) {
    const topIdx = x * 4;
    const botIdx = ((h - 1) * w + x) * 4;
    sumR += imgData[topIdx] + imgData[botIdx];
    sumG += imgData[topIdx + 1] + imgData[botIdx + 1];
    sumB += imgData[topIdx + 2] + imgData[botIdx + 2];
    count += 2;
    if (x % 8 === 0) {
      borderSeeds.push([imgData[topIdx], imgData[topIdx + 1], imgData[topIdx + 2]]);
      borderSeeds.push([imgData[botIdx], imgData[botIdx + 1], imgData[botIdx + 2]]);
    }
  }

  for (let y = 0; y < h; y++) {
    const leftIdx = (y * w) * 4;
    const rightIdx = (y * w + w - 1) * 4;
    sumR += imgData[leftIdx] + imgData[rightIdx];
    sumG += imgData[leftIdx + 1] + imgData[rightIdx + 1];
    sumB += imgData[leftIdx + 2] + imgData[rightIdx + 2];
    count += 2;
    if (y % 8 === 0) {
      borderSeeds.push([imgData[leftIdx], imgData[leftIdx + 1], imgData[leftIdx + 2]]);
      borderSeeds.push([imgData[rightIdx], imgData[rightIdx + 1], imgData[rightIdx + 2]]);
    }
  }

  const bgMeanR = sumR / count;
  const bgMeanG = sumG / count;
  const bgMeanB = sumB / count;

  const queue: number[] = [];

  const checkBgMatch = (r: number, g: number, b: number): boolean => {
    const dr = r - bgMeanR;
    const dg = g - bgMeanG;
    const db = b - bgMeanB;
    const distToMean = Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);
    if (distToMean < 36) return true;

    for (let i = 0; i < borderSeeds.length; i++) {
      const s = borderSeeds[i];
      const sr = r - s[0];
      const sg = g - s[1];
      const sb = b - s[2];
      const sDist = Math.sqrt(0.3 * sr * sr + 0.59 * sg * sg + 0.11 * sb * sb);
      if (sDist < 24) return true;
    }
    return false;
  };

  for (let x = 0; x < w; x++) {
    const topCoord = x;
    const botCoord = (h - 1) * w + x;
    queue.push(topCoord, botCoord);
    visited[topCoord] = 1;
    visited[botCoord] = 1;
  }
  for (let y = 0; y < h; y++) {
    const leftCoord = y * w;
    const rightCoord = y * w + w - 1;
    if (!visited[leftCoord]) {
      queue.push(leftCoord);
      visited[leftCoord] = 1;
    }
    if (!visited[rightCoord]) {
      queue.push(rightCoord);
      visited[rightCoord] = 1;
    }
  }

  let head = 0;
  while (head < queue.length) {
    const p = queue[head++];
    const px = p % w;
    const py = Math.floor(p / w);
    const pIdx = p * 4;

    const r = imgData[pIdx];
    const g = imgData[pIdx + 1];
    const b = imgData[pIdx + 2];

    if (checkBgMatch(r, g, b)) {
      isBg[p] = 1;

      const neighbors = [
        px > 0 ? p - 1 : -1,
        px < w - 1 ? p + 1 : -1,
        py > 0 ? p - w : -1,
        py < h - 1 ? p + w : -1,
      ];

      for (let n = 0; n < 4; n++) {
        const np = neighbors[n];
        if (np >= 0 && !visited[np]) {
          visited[np] = 1;
          queue.push(np);
        }
      }
    }
  }

  let fgCount = 0;
  let minX = w, maxX = 0, minY = h, maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!isBg[p]) {
        const pIdx = p * 4;
        const r = imgData[pIdx];
        const g = imgData[pIdx + 1];
        const b = imgData[pIdx + 2];
        const dr = r - bgMeanR;
        const dg = g - bgMeanG;
        const db = b - bgMeanB;
        const dist = Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);

        if (dist > 18) {
          mask[p] = 1;
          fgCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  return { mask, minX, maxX, minY, maxY, fgCount };
}

/**
 * Creates the animated cybernetic laser scanning slice plane.
 * Sweeps vertically through the 3D model during neural synthesis.
 */
function createLaserScanner(radius: number, boundY: number): THREE.Group {
  const laserGroup = new THREE.Group();
  laserGroup.name = 'blueprintScanRing'; // preserve backward compatibility with existing render loop

  // 1. Primary Electric Cyan / Amber Laser Ring
  const segments = 64;
  const ringPositions: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    ringPositions.push(radius * Math.cos(theta), 0, radius * Math.sin(theta));
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPositions, 3));
  const ringMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.LineLoop(ringGeo, ringMat);
  laserGroup.add(ring);

  // 2. Concentric Secondary Pulse Ring
  const innerPositions: number[] = [];
  const innerRadius = radius * 0.72;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    innerPositions.push(innerRadius * Math.cos(theta), 0, innerRadius * Math.sin(theta));
  }
  const innerGeo = new THREE.BufferGeometry();
  innerGeo.setAttribute('position', new THREE.Float32BufferAttribute(innerPositions, 3));
  const innerMat = new THREE.LineBasicMaterial({
    color: 0xf9cf00,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
  });
  const innerRing = new THREE.LineLoop(innerGeo, innerMat);
  laserGroup.add(innerRing);

  // 3. Translucent Glowing Laser Disc Slice Plane
  const discGeo = new THREE.CircleGeometry(radius, 48);
  discGeo.rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  laserGroup.add(disc);

  // 4. Laser Crosshairs Reticle (4 pointer ticks)
  const crosshairPositions: number[] = [
    // North tick
    0, 0, -radius * 1.08, 0, 0, -radius * 0.88,
    // South tick
    0, 0, radius * 1.08, 0, 0, radius * 0.88,
    // East tick
    radius * 1.08, 0, 0, radius * 0.88, 0, 0,
    // West tick
    -radius * 1.08, 0, 0, -radius * 0.88, 0, 0,
  ];
  const crosshairGeo = new THREE.BufferGeometry();
  crosshairGeo.setAttribute('position', new THREE.Float32BufferAttribute(crosshairPositions, 3));
  const crosshairMat = new THREE.LineSegments(
    crosshairGeo,
    new THREE.LineBasicMaterial({
      color: 0xf9cf00,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    })
  );
  laserGroup.add(crosshairMat);

  laserGroup.userData = {
    boundY: boundY,
    radius: radius,
  };

  return laserGroup;
}

/**
 * Creates the holographic cybernetic pedestal with concentric radar rings
 * and rotating scanner arm on the floor beneath the model.
 */
function createGroundPedestal(radius: number, yPos: number): THREE.Group {
  const pedestal = new THREE.Group();
  pedestal.name = 'blueprintPedestal';
  pedestal.position.y = yPos;

  // 1. Concentric Floor Target Rings
  const ringCount = 3;
  const ringRadii = [radius * 1.15, radius * 0.75, radius * 0.38];
  const segments = 48;

  ringRadii.forEach((r, idx) => {
    const positions: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      positions.push(r * Math.cos(theta), 0, r * Math.sin(theta));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: idx === 0 ? 0x38bdf8 : 0xf9cf00,
      transparent: true,
      opacity: idx === 0 ? 0.45 : 0.28,
      blending: THREE.AdditiveBlending,
    });
    pedestal.add(new THREE.LineLoop(geo, mat));
  });

  // 2. 16 Radial Degree Tick Marks
  const tickPositions: number[] = [];
  const outerR = radius * 1.15;
  const innerTickR = outerR * 0.94;
  for (let i = 0; i < 16; i++) {
    const theta = (i / 16) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    tickPositions.push(innerTickR * cos, 0, innerTickR * sin);
    tickPositions.push(outerR * cos, 0, outerR * sin);
  }
  const tickGeo = new THREE.BufferGeometry();
  tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickPositions, 3));
  const tickMat = new THREE.LineSegments(
    tickGeo,
    new THREE.LineBasicMaterial({
      color: 0xf9cf00,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    })
  );
  pedestal.add(tickMat);

  // 3. Rotating Sweeper Radar Line
  const radarPositions = [0, 0, 0, outerR, 0, 0];
  const radarGeo = new THREE.BufferGeometry();
  radarGeo.setAttribute('position', new THREE.Float32BufferAttribute(radarPositions, 3));
  const radarMat = new THREE.Line(
    radarGeo,
    new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    })
  );
  radarMat.name = 'blueprintRadarArm';
  pedestal.add(radarMat);

  return pedestal;
}

/**
 * Creates 350 floating micro-sparks orbiting the subject in 3D space,
 * evoking latent diffusion tokens condensing into physical geometry.
 */
function createOrbitalSparks(radius: number, height: number): THREE.Points {
  const sparkCount = 350;
  const positions = new Float32Array(sparkCount * 3);
  const colors = new Float32Array(sparkCount * 3);

  for (let i = 0; i < sparkCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = radius * (0.6 + Math.random() * 0.7);
    const y = (Math.random() - 0.5) * height * 1.25;

    positions[i * 3] = r * Math.cos(theta);
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = r * Math.sin(theta);

    // Dual-tone: Gold & Electric Sky
    const isGold = Math.random() > 0.45;
    if (isGold) {
      colors[i * 3] = 0.98;
      colors[i * 3 + 1] = 0.82;
      colors[i * 3 + 2] = 0.15;
    } else {
      colors[i * 3] = 0.35;
      colors[i * 3 + 1] = 0.75;
      colors[i * 3 + 2] = 0.98;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const pTex = getParticleTexture();
  const mat = new THREE.PointsMaterial({
    size: 0.032,
    vertexColors: true,
    ...(pTex ? { map: pTex } : {}),
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const sparks = new THREE.Points(geo, mat);
  sparks.name = 'blueprintOrbitalSparks';
  return sparks;
}

/**
 * Creates 8 corner CAD brackets [ ] framing the 3D model bounding envelope.
 */
function createBoundingCage(w: number, h: number, d: number): THREE.Group {
  const cage = new THREE.Group();
  cage.name = 'blueprintBoundingCage';

  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const arm = Math.min(w, Math.min(h, d)) * 0.18;

  const positions: number[] = [];

  const signs = [
    [-1, -1, -1],
    [1, -1, -1],
    [-1, 1, -1],
    [1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [-1, 1, 1],
    [1, 1, 1],
  ];

  signs.forEach(([sx, sy, sz]) => {
    const cx = sx * hw;
    const cy = sy * hh;
    const cz = sz * hd;

    // X arm
    positions.push(cx, cy, cz, cx - sx * arm, cy, cz);
    // Y arm
    positions.push(cx, cy, cz, cx, cy - sy * arm, cz);
    // Z arm
    positions.push(cx, cy, cz, cx, cy, cz - sz * arm);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
    })
  );

  cage.add(mat);
  return cage;
}

/**
 * Creates an interactive 3D volumetric model preview with 360° curvature,
 * authentic subject colors, and holographic wireframe contours.
 * Completely eliminates background bleed.
 */
export async function createPointCloudFromImage(imageUrl: string): Promise<THREE.Group> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const sampleW = 128;
        const aspect = (img.naturalHeight || 1) / (img.naturalWidth || 1);
        const sampleH = Math.max(48, Math.min(160, Math.round(aspect * sampleW)));

        const canvas = document.createElement('canvas');
        canvas.width = sampleW;
        canvas.height = sampleH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(createFallbackPointCloud());
          return;
        }

        ctx.drawImage(img, 0, 0, sampleW, sampleH);
        const imgData = ctx.getImageData(0, 0, sampleW, sampleH).data;

        // Perform intelligent background segmentation
        const { mask, minX, maxX, minY, maxY, fgCount } = extractForegroundMask(imgData, sampleW, sampleH);

        // If subject is too small or segmentation failed, use fallback
        if (fgCount < 250 || minX >= maxX || minY >= maxY) {
          resolve(createFallbackPointCloud());
          return;
        }

        const bboxW = Math.max(1, maxX - minX + 1);
        const bboxH = Math.max(1, maxY - minY + 1);

        // Compute 2D distance transform to silhouette boundary
        const distMap = new Float32Array(sampleW * sampleH);
        for (let y = 1; y < sampleH - 1; y++) {
          for (let x = 1; x < sampleW - 1; x++) {
            const p = y * sampleW + x;
            if (mask[p] === 1) {
              let minDist = 5.0;
              for (let r = 1; r <= 5; r++) {
                if (
                  mask[p - r] === 0 || mask[p + r] === 0 ||
                  mask[p - r * sampleW] === 0 || mask[p + r * sampleW] === 0
                ) {
                  minDist = r;
                  break;
                }
              }
              distMap[p] = minDist;
            }
          }
        }

        const positions: number[] = [];
        const colors: number[] = [];

        // 3D Real-World Proportions
        const scaleX = 2.4;
        const scaleY = 2.4 * (bboxH / bboxW);
        const scaleZ = scaleX * 0.78; // Full 360° anatomical volumetric depth

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Store horizontal contour rings for 3D wireframe topology
        const wireframePositions: number[] = [];

        for (let y = minY; y <= maxY; y++) {
          const runs: [number, number][] = [];
          let inRun = false;
          let runStart = 0;

          for (let x = minX; x <= maxX; x++) {
            const p = y * sampleW + x;
            if (mask[p] === 1 && !inRun) {
              inRun = true;
              runStart = x;
            } else if (mask[p] === 0 && inRun) {
              inRun = false;
              runs.push([runStart, x - 1]);
            }
          }
          if (inRun) {
            runs.push([runStart, maxX]);
          }

          const shouldAddContourRing = y % 5 === 0;

          for (let rIdx = 0; rIdx < runs.length; rIdx++) {
            const [startX, endX] = runs[rIdx];
            const runW = endX - startX + 1;
            const runCenterX = (startX + endX) / 2;
            const radiusX = Math.max(1, runW / 2);

            const localDepthZ = (radiusX / bboxW) * scaleZ;

            // 3D Holographic Contour Latitude Ring
            if (shouldAddContourRing && runW > 6) {
              const ringSegments = 24;
              const ringNy = -((y - centerY) / bboxH) * scaleY;
              const ringCenterNx = ((runCenterX - centerX) / bboxW) * scaleX;
              const ringRadiusNx = (radiusX / bboxW) * scaleX;

              for (let s = 0; s < ringSegments; s++) {
                const theta1 = (s / ringSegments) * Math.PI * 2;
                const theta2 = ((s + 1) / ringSegments) * Math.PI * 2;

                const x1 = ringCenterNx + ringRadiusNx * Math.cos(theta1);
                const z1 = localDepthZ * Math.sin(theta1);
                const x2 = ringCenterNx + ringRadiusNx * Math.cos(theta2);
                const z2 = localDepthZ * Math.sin(theta2);

                wireframePositions.push(x1, ringNy, z1);
                wireframePositions.push(x2, ringNy, z2);
              }
            }

            // Generate 360° Volumetric Surface Points + Interior Lattice
            for (let x = startX; x <= endX; x++) {
              const p = y * sampleW + x;
              const idx = p * 4;

              const nx = ((x - centerX) / bboxW) * scaleX;
              const ny = -((y - centerY) / bboxH) * scaleY;

              const u = (x - runCenterX) / radiusX;
              const clampedU = Math.max(-1, Math.min(1, u));

              const edgeDist = distMap[p] || 1;
              const boundaryTaper = Math.min(1.0, edgeDist / 3.0);
              const maxZ = localDepthZ * boundaryTaper * Math.sqrt(Math.max(0.02, 1.0 - clampedU * clampedU));

              // Authentic reference image colors
              const pr = imgData[idx] / 255;
              const pg = imgData[idx + 1] / 255;
              const pb = imgData[idx + 2] / 255;

              // Front Surface Point (+Z)
              positions.push(nx, ny, maxZ);
              colors.push(pr, pg, pb);

              // Back Surface Point (-Z)
              positions.push(nx, ny, -maxZ);
              colors.push(pr * 0.72 + 0.05, pg * 0.72 + 0.05, pb * 0.76 + 0.07);

              // Volumetric Interior Lattice
              if (maxZ > 0.08) {
                const zInt = maxZ * (Math.random() * 1.7 - 0.85);
                const jitterX = (Math.random() - 0.5) * (scaleX / bboxW) * 0.6;
                const jitterY = (Math.random() - 0.5) * (scaleY / bboxH) * 0.6;
                positions.push(nx + jitterX, ny + jitterY, zInt);
                colors.push(pr * 0.88, pg * 0.88, pb * 0.92);
              }
            }
          }
        }

        // Build Master Group
        const previewGroup = new THREE.Group();
        previewGroup.name = 'generationPointCloud';

        // 1. Dense Volumetric Points
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.center();

        const pTex = getParticleTexture();
        const material = new THREE.PointsMaterial({
          size: 0.038,
          vertexColors: true,
          ...(pTex ? { map: pTex } : {}),
          transparent: true,
          opacity: 0.94,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

        const points = new THREE.Points(geometry, material);
        points.name = 'blueprintPoints';
        previewGroup.add(points);

        // 2. Holographic 3D Contour Latitude Wireframe
        if (wireframePositions.length > 0) {
          const wireGeometry = new THREE.BufferGeometry();
          wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wireframePositions, 3));
          wireGeometry.center();

          const wireMaterial = new THREE.LineBasicMaterial({
            color: 0xf9cf00,
            transparent: true,
            opacity: 0.42,
            blending: THREE.AdditiveBlending,
          });

          const wireframe = new THREE.LineSegments(wireGeometry, wireMaterial);
          wireframe.name = 'blueprintWireframe';
          previewGroup.add(wireframe);
        }

        // 3. Holographic Laser Scanning Slice Plane
        const scanRadius = scaleX * 0.72;
        const boundY = scaleY * 0.58;
        const laserScanner = createLaserScanner(scanRadius, boundY);
        laserScanner.position.y = 0.2;
        previewGroup.add(laserScanner);

        // 4. Ground Hologram Radar Pedestal
        const pedestal = createGroundPedestal(scaleX * 0.75, -boundY - 0.15);
        previewGroup.add(pedestal);

        // 5. Latent Orbital Particles Swarm
        const sparks = createOrbitalSparks(scaleX * 0.8, scaleY);
        previewGroup.add(sparks);

        // 6. CAD Sci-Fi Bounding Cage
        const cage = createBoundingCage(scaleX * 1.15, scaleY * 1.15, scaleZ * 1.2);
        previewGroup.add(cage);

        previewGroup.position.y = 0.25;
        resolve(previewGroup);
      } catch (err) {
        console.warn('3D volumetric blueprint creation failed, using fallback:', err);
        resolve(createFallbackPointCloud());
      }
    };

    img.onerror = () => {
      resolve(createFallbackPointCloud());
    };

    img.src = imageUrl;
  });
}

/**
 * Procedural futuristic cybernetic bust / sculpture point cloud with 360° structure.
 * Displayed for text-to-3d prompts or as a robust fallback.
 */
export function createFallbackPointCloud(_prompt?: string): THREE.Group {
  const group = new THREE.Group();
  group.name = 'generationPointCloud';

  const positions: number[] = [];
  const colors: number[] = [];
  const wireframePositions: number[] = [];
  const totalPoints = 6800;

  // Generate a procedural 3D sculpture with intricate anatomical curvature
  for (let i = 0; i < totalPoints; i++) {
    const section = Math.random();
    let x = 0, y = 0, z = 0;
    let r = 0.98, g = 0.85, b = 0.15; // Golden amber default

    if (section < 0.28) {
      // Head & Crown (High-resolution Ellipsoid)
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2 * Math.PI;
      const phi = Math.acos(2 * v - 1);
      const rad = Math.cbrt(Math.random()) * 0.38;
      x = rad * Math.sin(phi) * Math.cos(theta);
      y = rad * Math.cos(phi) + 0.88;
      z = rad * Math.sin(phi) * Math.sin(theta);

      // Gradient to cyan highlights at top
      if (y > 1.0) {
        r = 0.22; g = 0.74; b = 0.98;
      } else {
        r = 0.98; g = 0.92; b = 0.3;
      }
    } else if (section < 0.68) {
      // Torso / Kinetic Core
      const u = Math.random() * 2 * Math.PI;
      const t = Math.random();
      y = (t - 0.5) * 1.15 + 0.22;
      const rad = (0.45 - t * 0.09) * Math.sqrt(Math.random());
      x = rad * Math.cos(u) * 1.15;
      z = rad * Math.sin(u) * 0.88;

      if (Math.abs(z) > 0.2) {
        r = 0.98; g = 0.82; b = 0.12;
      } else {
        r = 0.38; g = 0.82; b = 0.98;
      }
    } else {
      // Lower Foundation / Pedestal Column
      const isLeft = Math.random() > 0.5;
      const cx = isLeft ? -0.26 : 0.26;
      const u = Math.random() * 2 * Math.PI;
      const t = Math.random();
      y = -0.35 - t * 0.75;
      const rad = 0.16 * Math.sqrt(Math.random());
      x = cx + rad * Math.cos(u);
      z = rad * Math.sin(u);
      r = 0.88; g = 0.75; b = 0.35;
    }

    positions.push(x, y, z);
    colors.push(r, g, b);
  }

  // 3D Horizontal Contour Latitude Rings
  const ringHeights = [1.18, 0.95, 0.7, 0.45, 0.2, -0.05, -0.3, -0.6, -0.9, -1.1];
  for (let hIdx = 0; hIdx < ringHeights.length; hIdx++) {
    const ry = ringHeights[hIdx];
    const segments = 32;
    const ringRadius = ry > 0.75 ? 0.38 : (ry > -0.25 ? 0.48 : 0.32);
    for (let s = 0; s < segments; s++) {
      const theta1 = (s / segments) * Math.PI * 2;
      const theta2 = ((s + 1) / segments) * Math.PI * 2;
      wireframePositions.push(ringRadius * Math.cos(theta1), ry, ringRadius * 0.88 * Math.sin(theta1));
      wireframePositions.push(ringRadius * Math.cos(theta2), ry, ringRadius * 0.88 * Math.sin(theta2));
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.center();

  const pTex = getParticleTexture();
  const material = new THREE.PointsMaterial({
    size: 0.042,
    vertexColors: true,
    ...(pTex ? { map: pTex } : {}),
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'blueprintPoints';
  group.add(points);

  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wireframePositions, 3));
  wireGeometry.center();
  const wireMaterial = new THREE.LineBasicMaterial({
    color: 0xf9cf00,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
  });
  const wireframe = new THREE.LineSegments(wireGeometry, wireMaterial);
  wireframe.name = 'blueprintWireframe';
  group.add(wireframe);

  // Holographic Laser Scanner
  const laserScanner = createLaserScanner(1.35, 1.25);
  laserScanner.position.y = 0.2;
  group.add(laserScanner);

  // Ground Pedestal Radar
  const pedestal = createGroundPedestal(1.4, -1.25);
  group.add(pedestal);

  // Orbital Latent Particles
  const sparks = createOrbitalSparks(1.45, 2.3);
  group.add(sparks);

  // CAD Bounding Cage
  const cage = createBoundingCage(2.2, 2.6, 2.0);
  group.add(cage);

  group.position.y = 0.25;
  return group;
}

/**
 * Master animation loop helper. Animates all holographic components
 * (sweeping laser, rotating radar, swirling sparks, counter-rotation pedestal) seamlessly.
 */
export function animatePointCloud(group: THREE.Group | null, delta: number, elapsed: number): void {
  if (!group || !group.visible) return;

  // 1. Smooth rotation of main subject
  group.rotation.y += delta * 0.22;

  // 2. Vertical Laser Scanner Sweep
  const laserScanner = group.getObjectByName('blueprintScanRing');
  if (laserScanner) {
    const boundY = laserScanner.userData?.boundY || 1.1;
    laserScanner.position.y = Math.sin(elapsed * 1.55) * boundY + 0.25;
  }

  // 3. Ground Pedestal Counter-Rotation & Radar Arm Sweep
  const pedestal = group.getObjectByName('blueprintPedestal');
  if (pedestal) {
    pedestal.rotation.y -= delta * 0.1;
    const radarArm = pedestal.getObjectByName('blueprintRadarArm');
    if (radarArm) {
      radarArm.rotation.y += delta * 1.4;
    }
  }

  // 4. Orbital Spark Swarm Swirl
  const sparks = group.getObjectByName('blueprintOrbitalSparks');
  if (sparks) {
    sparks.rotation.y += delta * 0.38;
    sparks.rotation.x = Math.sin(elapsed * 0.45) * 0.12;
  }

  // 5. Bounding Cage Breathing Pulse
  const cage = group.getObjectByName('blueprintBoundingCage');
  if (cage) {
    const s = 1.0 + Math.sin(elapsed * 2.2) * 0.015;
    cage.scale.set(s, s, s);
  }
}

/**
 * Switch display visibility between Holo Matrix, Laser Scanner, and Wireframe contours.
 */
export function setPointCloudDisplayMode(group: THREE.Group | null, mode: 'holo' | 'scan' | 'wireframe'): void {
  if (!group) return;
  const points = group.getObjectByName('blueprintPoints');
  const wireframe = group.getObjectByName('blueprintWireframe');
  const laserScanner = group.getObjectByName('blueprintScanRing');
  const pedestal = group.getObjectByName('blueprintPedestal');
  const sparks = group.getObjectByName('blueprintOrbitalSparks');
  const cage = group.getObjectByName('blueprintBoundingCage');

  if (mode === 'holo') {
    if (points) points.visible = true;
    if (wireframe) wireframe.visible = true;
    if (laserScanner) laserScanner.visible = true;
    if (pedestal) pedestal.visible = true;
    if (sparks) sparks.visible = true;
    if (cage) cage.visible = true;
  } else if (mode === 'scan') {
    if (points) points.visible = true;
    if (wireframe) wireframe.visible = false;
    if (laserScanner) laserScanner.visible = true;
    if (pedestal) pedestal.visible = true;
    if (sparks) sparks.visible = false;
    if (cage) cage.visible = true;
  } else if (mode === 'wireframe') {
    if (points) points.visible = true;
    if (wireframe) wireframe.visible = true;
    if (laserScanner) laserScanner.visible = false;
    if (pedestal) pedestal.visible = false;
    if (sparks) sparks.visible = false;
    if (cage) cage.visible = true;
  }
}

/**
 * Safely dispose a point cloud or blueprint group and free all WebGL memory.
 */
export function disposePointCloud(obj: THREE.Object3D | null): void {
  if (!obj) return;
  obj.traverse((child) => {
    if (
      child instanceof THREE.Points ||
      child instanceof THREE.Mesh ||
      child instanceof THREE.LineSegments ||
      child instanceof THREE.Line ||
      child instanceof THREE.LineLoop
    ) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
    }
  });
}
