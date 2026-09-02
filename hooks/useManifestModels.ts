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
      // ponytail: list EVERY mesh-capable model in the selector, installed or
      // not. Previously this filtered on `available` (weights+repo+preflight
      // ready), so a model the user had installed but not yet preflighted, or
      // any model at all before install, was invisible — the selector showed
      // "No model available" forever. Color-coding in the UI now signals
      // readiness; the list itself must be complete.
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
      // ponytail: same completeness rule as mesh-capable — texture models
      // should appear even when not yet installed so the user can see what's
      // available and what needs installing.
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
