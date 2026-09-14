/**
 * Manifest-driven model filtering hook.
 *
 * Consumes the runtime options API (which is already manifest-driven)
 * and provides filtered model lists based on declared capabilities.
 *
 * - Mesh-capable: models with supports_image_to_3d OR supports_text_to_3d
 * - Texture-capable: models with supports.texture_generation === true
 *
 * A model is considered "available" when its manifest entry exists AND
 * the registry reports it as available (weights + repo present).
 */
import { useMemo } from 'react';
import { useRuntimeOptions } from './useBackendData';

export interface ManifestModel {
  id: string;
  label: string;
  available?: boolean;
  installed?: boolean;
  status?: string;
  vram_required_mb?: number;
  shape_vram_mb?: number;
  texture_vram_mb?: number;
  supports_texture?: boolean;
  supports_text_to_3d?: boolean;
  supports_image_to_3d?: boolean;
  workspace_compatibility?: string[];
  low_vram_supported?: boolean;
  low_vram_required_mb?: number;
  supports?: {
    text_to_3d?: boolean;
    image_to_3d?: boolean;
    texture_generation?: boolean;
    rigging_animation?: boolean;
    detail_enhancement?: boolean;
    part_separation?: boolean;
  };
}

/**
 * Pre-seeded manifest model catalog loaded directly from backend/runtime/manifests/*.yaml.
 * Ensures models are always known and listed in selectors immediately, even before
 * backend options finish loading or when offline.
 */
export const MANIFEST_MODELS_CATALOG: ManifestModel[] = [
  {
    id: 'hunyuan3d-2.1',
    label: 'Hunyuan3D 2.1',
    available: false,
    installed: false,
    status: 'not_installed',
    vram_required_mb: 29000,
    shape_vram_mb: 10240,
    texture_vram_mb: 29000,
    supports_texture: true,
    supports_text_to_3d: true,
    supports_image_to_3d: true,
    low_vram_supported: true,
    low_vram_required_mb: 8192,
    workspace_compatibility: [],
    supports: {
      text_to_3d: true,
      image_to_3d: true,
      texture_generation: true,
      rigging_animation: false,
      detail_enhancement: false,
      part_separation: false,
    },
  },
  {
    id: 'hunyuan3d-2-mini',
    label: 'Hunyuan3D 2 Mini',
    available: false,
    installed: false,
    status: 'not_installed',
    vram_required_mb: 6144,
    shape_vram_mb: 4096,
    texture_vram_mb: 6144,
    supports_texture: true,
    supports_text_to_3d: false,
    supports_image_to_3d: true,
    low_vram_supported: true,
    low_vram_required_mb: 4096,
    workspace_compatibility: [],
    supports: {
      text_to_3d: false,
      image_to_3d: true,
      texture_generation: true,
      rigging_animation: false,
      detail_enhancement: false,
      part_separation: false,
    },
  },
  {
    id: 'trellis',
    label: 'TRELLIS',
    available: false,
    installed: false,
    status: 'not_installed',
    vram_required_mb: 16000,
    shape_vram_mb: 8000,
    texture_vram_mb: 16000,
    supports_texture: true,
    supports_text_to_3d: false,
    supports_image_to_3d: true,
    low_vram_supported: false,
    low_vram_required_mb: 8000,
    workspace_compatibility: [],
    supports: {
      text_to_3d: false,
      image_to_3d: true,
      texture_generation: true,
      rigging_animation: false,
      detail_enhancement: false,
      part_separation: false,
    },
  },
  {
    id: 'triposg',
    label: 'TripoSG',
    available: false,
    installed: false,
    status: 'not_installed',
    vram_required_mb: 8192,
    shape_vram_mb: 8192,
    texture_vram_mb: 8192,
    supports_texture: false,
    supports_text_to_3d: false,
    supports_image_to_3d: true,
    low_vram_supported: false,
    low_vram_required_mb: 8192,
    workspace_compatibility: [],
    supports: {
      text_to_3d: false,
      image_to_3d: true,
      texture_generation: false,
      rigging_animation: false,
      detail_enhancement: false,
      part_separation: false,
    },
  },
  {
    id: 'triposr',
    label: 'TripoSR',
    available: false,
    installed: false,
    status: 'not_installed',
    vram_required_mb: 8192,
    shape_vram_mb: 6144,
    texture_vram_mb: 2048,
    supports_texture: true,
    supports_text_to_3d: false,
    supports_image_to_3d: true,
    low_vram_supported: true,
    low_vram_required_mb: 4096,
    workspace_compatibility: ['mesh-generation', 'texture-generation'],
    supports: {
      text_to_3d: false,
      image_to_3d: true,
      texture_generation: true,
      rigging_animation: false,
      detail_enhancement: false,
      part_separation: false,
    },
  },
  {
    id: 'triposf',
    label: 'TripoSF',
    available: false,
    installed: false,
    status: 'not_installed',
    vram_required_mb: 16384,
    shape_vram_mb: 0,
    texture_vram_mb: 0,
    supports_texture: false,
    supports_text_to_3d: false,
    supports_image_to_3d: false,
    low_vram_supported: false,
    low_vram_required_mb: 0,
    workspace_compatibility: ['remesh', 'post-processing'],
    supports: {
      text_to_3d: false,
      image_to_3d: false,
      texture_generation: false,
      rigging_animation: false,
      detail_enhancement: true,
      part_separation: false,
    },
  },
  {
    id: 'ardy',
    label: 'ARDY',
    available: false,
    installed: false,
    status: 'not_installed',
    vram_required_mb: 16384,
    shape_vram_mb: 0,
    texture_vram_mb: 0,
    supports_texture: false,
    supports_text_to_3d: false,
    supports_image_to_3d: false,
    low_vram_supported: true,
    low_vram_required_mb: 8192,
    workspace_compatibility: ['animation'],
    supports: {
      text_to_3d: false,
      image_to_3d: false,
      texture_generation: false,
      rigging_animation: true,
      detail_enhancement: false,
      part_separation: false,
    },
  },
];

export interface UseManifestModelsResult {
  meshCapableModels: ManifestModel[];
  textureCapableModels: ManifestModel[];
  animationCapableModels: ManifestModel[];
  remeshCapableModels: ManifestModel[];
  allModels: ManifestModel[];
  loading: boolean;
  error: string | null;
  gpuAvailable: boolean;
  freeVramMb: number;
}

export function useManifestModels(): UseManifestModelsResult {
  const { options, loading, error } = useRuntimeOptions();
  const gpuAvailable = Boolean((options as any)?.gpu_available);
  const freeVramMb = Number((options as any)?.free_vram_mb) || 0;

  const allModels = useMemo<ManifestModel[]>(() => {
    const raw: ManifestModel[] = (options?.three_d_models || []).filter(
      (m: ManifestModel) =>
        m &&
        m.id &&
        !m.id.toLowerCase().includes('mock') &&
        !m.id.toLowerCase().includes('placeholder')
    );

    const backendMap = new Map<string, ManifestModel>();
    for (const m of raw) {
      backendMap.set(m.id.toLowerCase(), m);
    }

    // Merge baseline YAML catalog with live backend status
    const merged: ManifestModel[] = MANIFEST_MODELS_CATALOG.map((base) => {
      const live = backendMap.get(base.id.toLowerCase());
      if (!live) return base;
      const isAvailable = live.available === true;
      const isInstalled = live.installed === true || isAvailable;
      return {
        ...base,
        ...live,
        label: live.label || base.label,
        available: isAvailable,
        installed: isInstalled,
        status: live.status || (isAvailable ? 'ready' : isInstalled ? 'installed' : 'not_installed'),
        vram_required_mb: live.vram_required_mb || base.vram_required_mb,
        shape_vram_mb: live.shape_vram_mb || base.shape_vram_mb,
        texture_vram_mb: live.texture_vram_mb || base.texture_vram_mb,
        supports_texture: live.supports_texture ?? base.supports_texture,
        low_vram_supported: live.low_vram_supported ?? base.low_vram_supported,
        low_vram_required_mb: live.low_vram_required_mb ?? base.low_vram_required_mb,
        supports_text_to_3d: live.supports_text_to_3d ?? base.supports_text_to_3d,
        supports_image_to_3d: live.supports_image_to_3d ?? base.supports_image_to_3d,
        supports: {
          ...base.supports,
          ...(live.supports || {}),
        },
      };
    });

    // Include any additional real models reported by backend
    for (const [id, live] of backendMap.entries()) {
      if (!MANIFEST_MODELS_CATALOG.some((b) => b.id.toLowerCase() === id)) {
        merged.push(live);
      }
    }

    return merged;
  }, [options]);

  const meshCapableModels = useMemo(() => {
    return allModels.filter((m) => {
      // Must support at least one mesh-generation pathway
      const supportsMesh =
        m.supports_image_to_3d === true ||
        m.supports_text_to_3d === true ||
        m.supports?.image_to_3d === true ||
        m.supports?.text_to_3d === true;
      return supportsMesh;
    });
  }, [allModels]);

  const textureCapableModels = useMemo(() => {
    return allModels.filter((m) => {
      // Must explicitly support texture generation
      const supportsTexture =
        m.supports?.texture_generation === true;
      return supportsTexture;
    });
  }, [allModels]);

  const animationCapableModels = useMemo(() => {
    return allModels.filter((m) => {
      return (
        m.workspace_compatibility?.includes('animation') ||
        (m as any).supports_animation === true ||
        (m as any).supports_motion === true ||
        (m as any).category === 'animation' ||
        m.supports?.rigging_animation === true
      );
    });
  }, [allModels]);

  const remeshCapableModels = useMemo(() => {
    return allModels.filter((m) => {
      return (
        m.workspace_compatibility?.includes('remesh') ||
        (m as any).supports_remesh === true ||
        (m as any).category === '3d_reconstruction'
      );
    });
  }, [allModels]);

  return {
    meshCapableModels,
    textureCapableModels,
    animationCapableModels,
    remeshCapableModels,
    allModels,
    loading,
    error,
    gpuAvailable,
    freeVramMb,
  };
}
