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

export interface UseManifestModelsResult {
    meshCapableModels: ManifestModel[];
    textureCapableModels: ManifestModel[];
    allModels: ManifestModel[];
    loading: boolean;
    error: string | null;
  }

export function useManifestModels(): UseManifestModelsResult {
  const { options, loading, error } = useRuntimeOptions();

  const allModels = useMemo<ManifestModel[]>(() => {
    const raw: ManifestModel[] = options?.three_d_models || [];
    return raw;
  }, [options]);

  const meshCapableModels = useMemo(() => {
    return allModels.filter((m) => {
      // Must be available (manifest + weights + repo present)
      if (!m.available) return false;
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
      // Must be available
      if (!m.available) return false;
      // Must explicitly support texture generation
      const supportsTexture =
        m.supports?.texture_generation === true;
      return supportsTexture;
    });
  }, [allModels]);

  return {
    meshCapableModels,
    textureCapableModels,
    allModels,
    loading,
    error,
  };
}
