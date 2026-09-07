import * as THREE from 'three';

// Cached soft particle texture for glowing starlight points
let cachedParticleTexture: THREE.Texture | null = null;

function getParticleTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  if (cachedParticleTexture) return cachedParticleTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(235, 245, 255, 0.85)');
    gradient.addColorStop(0.7, 'rgba(180, 220, 255, 0.35)');
    gradient.addColorStop(1, 'rgba(120, 180, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  cachedParticleTexture = texture;
  return texture;
}

/**
 * Creates an interactive 3D volumetric point cloud from an uploaded image silhouette,
 * matching Tripo AI's neural synthesis preview.
 */
export async function createPointCloudFromImage(imageUrl: string): Promise<THREE.Points> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const sampleW = 96;
        const aspect = (img.naturalHeight || 1) / (img.naturalWidth || 1);
        const sampleH = Math.max(32, Math.min(96, Math.round(aspect * sampleW)));

        const canvas = document.createElement('canvas');
        canvas.width = sampleW;
        canvas.height = sampleH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(createFallbackPointCloud());
          return;
        }

        ctx.drawImage(img, 0, 0, sampleW, sampleH);
        const imgData = ctx.getImageData(0, 0, sampleW, sampleH).data;

        // Sample corner colors to determine background for opaque images
        const corners = [
          0, // top-left
          (sampleW - 1) * 4, // top-right
          ((sampleH - 1) * sampleW) * 4, // bottom-left
          ((sampleH - 1) * sampleW + sampleW - 1) * 4, // bottom-right
        ];

        let bgR = 0, bgG = 0, bgB = 0;
        for (const idx of corners) {
          bgR += imgData[idx];
          bgG += imgData[idx + 1];
          bgB += imgData[idx + 2];
        }
        bgR /= corners.length;
        bgG /= corners.length;
        bgB /= corners.length;

        // Check if image has genuine transparency
        let hasAlpha = false;
        for (let i = 3; i < imgData.length; i += 4) {
          if (imgData[i] < 200) {
            hasAlpha = true;
            break;
          }
        }

        const isForeground = (x: number, y: number): boolean => {
          const idx = (y * sampleW + x) * 4;
          const a = imgData[idx + 3];
          if (hasAlpha) return a > 35;

          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];
          const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
          return dist > 26;
        };

        // Precompute silhouette mask & distance to edge for 3D thickness
        const mask = new Uint8Array(sampleW * sampleH);
        for (let y = 0; y < sampleH; y++) {
          for (let x = 0; x < sampleW; x++) {
            if (isForeground(x, y)) {
              mask[y * sampleW + x] = 1;
            }
          }
        }

        const positions: number[] = [];
        const colors: number[] = [];

        const scaleX = 2.4;
        const scaleY = 2.4 * (sampleH / sampleW);

        for (let y = 0; y < sampleH; y++) {
          for (let x = 0; x < sampleW; x++) {
            const idx = (y * sampleW + x) * 4;
            if (mask[y * sampleW + x] !== 1) continue;

            // Simple distance to edge calculation (check nearby neighbors)
            let edgeDist = 0;
            for (let r = 1; r <= 5; r++) {
              if (
                x - r < 0 || x + r >= sampleW ||
                y - r < 0 || y + r >= sampleH ||
                mask[y * sampleW + (x - r)] === 0 ||
                mask[y * sampleW + (x + r)] === 0 ||
                mask[(y - r) * sampleW + x] === 0 ||
                mask[(y + r) * sampleW + x] === 0
              ) {
                break;
              }
              edgeDist = r;
            }

            const nx = (x / sampleW - 0.5) * scaleX;
            const ny = -(y / sampleH - 0.5) * scaleY;
            const maxDepth = Math.max(0.08, Math.min(0.55, edgeDist * 0.11));

            const pr = imgData[idx] / 255;
            const pg = imgData[idx + 1] / 255;
            const pb = imgData[idx + 2] / 255;
            const lum = pr * 0.299 + pg * 0.587 + pb * 0.114;

            // Tripo AI glowing silver-white point styling with subtle tint
            const brightness = 0.78 + lum * 0.22;
            const cr = brightness * 0.95 + pr * 0.05;
            const cg = brightness * 0.97 + pg * 0.05;
            const cb = brightness * 1.02 + pb * 0.05;

            // Generate 2 to 3 volumetric points along Z axis
            const pointsPerPixel = edgeDist > 2 ? 3 : 1;
            for (let p = 0; p < pointsPerPixel; p++) {
              const zFraction = (Math.random() * 2 - 1);
              const z = zFraction * maxDepth * Math.sqrt(Math.max(0.1, 1 - (zFraction * 0.2) ** 2));
              const jitterX = (Math.random() - 0.5) * (scaleX / sampleW) * 0.8;
              const jitterY = (Math.random() - 0.5) * (scaleY / sampleH) * 0.8;

              positions.push(nx + jitterX, ny + jitterY, z);
              colors.push(cr, cg, cb);
            }
          }
        }

        // If for any reason silhouette was too sparse, fallback
        if (positions.length < 300) {
          resolve(createFallbackPointCloud());
          return;
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
          opacity: 0.88,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

        const points = new THREE.Points(geometry, material);
        points.name = 'generationPointCloud';
        points.position.y = 0.25;
        resolve(points);
      } catch (err) {
        console.warn('Point cloud creation failed, using fallback:', err);
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
 * Procedural fallback 3D point cloud when no image reference is provided (e.g. text prompt).
 */
export function createFallbackPointCloud(_prompt?: string): THREE.Points {
  const positions: number[] = [];
  const colors: number[] = [];
  const totalPoints = 4200;

  for (let i = 0; i < totalPoints; i++) {
    // Generate organic 3D volumetric torso/sphere cloud
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = Math.cbrt(Math.random()) * 1.15;

    const sinPhi = Math.sin(phi);
    const x = r * sinPhi * Math.cos(theta) * 1.25;
    const y = r * Math.cos(phi) * 0.85;
    const z = r * sinPhi * Math.sin(theta) * 0.85;

    positions.push(x, y, z);

    const brightness = 0.8 + Math.random() * 0.2;
    colors.push(brightness * 0.95, brightness * 0.98, brightness * 1.02);
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
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'generationPointCloud';
  points.position.y = 0.25;
  return points;
}

/**
 * Safely dispose a point cloud object and free WebGL memory.
 */
export function disposePointCloud(points: THREE.Points | null): void {
  if (!points) return;
  points.geometry?.dispose();
  if (Array.isArray(points.material)) {
    points.material.forEach(m => m.dispose());
  } else if (points.material) {
    points.material.dispose();
  }
}
