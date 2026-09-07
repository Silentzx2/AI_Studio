/**
 * In-memory cache for GLB/GLTF array buffers to eliminate download latency
 * when switching or auto-loading newly generated models in the viewer.
 */
const glbBufferCache = new Map<string, ArrayBuffer>();

export function getCachedGLB(url: string): ArrayBuffer | undefined {
  return glbBufferCache.get(url);
}

export function setCachedGLB(url: string, buffer: ArrayBuffer): void {
  // Evict oldest if cache exceeds 30 items to bound memory
  if (glbBufferCache.size > 30) {
    const firstKey = glbBufferCache.keys().next().value;
    if (firstKey) glbBufferCache.delete(firstKey);
  }
  glbBufferCache.set(url, buffer);
}

export async function prefetchGLB(url: string): Promise<ArrayBuffer | null> {
  if (!url) return null;
  const existing = glbBufferCache.get(url);
  if (existing) return existing;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    setCachedGLB(url, buf);
    return buf;
  } catch {
    return null;
  }
}
