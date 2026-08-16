"use client";

/**
 * Shared right-hand "Asset Library" panel host.
 *
 * Render and Texture pages previously had no asset library at all, while the
 * workspace had one. This host centralizes the asset-panel wiring (history
 * fetch + selection → global viewer store) so every page with a 3D viewer uses
 * the SAME logic and the SAME loaded-model source of truth.
 *
 * Drop this into any page that renders a 3D viewer; selecting / uploading an
 * asset flows through `loadModelInViewer`, which updates the global
 * `useViewerStore` so the model appears in ALL viewers (workspace, render,
 * texture) and survives page navigation.
 */
import { useEffect, useMemo } from "react";
import AssetPanel, { type AssetItem } from "@/3D-SPACE/AssetPanel";
import { useGenerationStore } from "@/stores/useGenerationStore";
import { loadModelInViewer } from "@/stores/useViewerStore";
import { toast } from "sonner";

function jobToAsset(job: any): AssetItem {
  const prompt: string = job?.prompt || job?.config?.prompt || "Untitled";
  const result = job?.result || {};
  return {
    id: job.id,
    name: prompt.split(" ").slice(0, 4).join(" ") || "Untitled Asset",
    prompt,
    format: job?.format || "GLB",
    timestamp: new Date(job?.created_at || job?.createdAt || 0).toLocaleDateString(),
    thumbnailUrl: job?.thumbnail_url || result?.thumbnailUrl || result?.thumbnail_url || null,
    modelUrl: job?.model_url || result?.modelUrl || result?.model_url || null,
    isFavorite: !!(job?.is_favorite || job?.isFavorite),
    job,
  };
}

export function AssetPanelHost({ className }: { className?: string }) {
  const { jobHistory, isLoadingHistory, loadHistory } = useGenerationStore();

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const assets = useMemo<AssetItem[]>(
    () => (jobHistory ?? []).map(jobToAsset),
    [jobHistory]
  );

  const handleSelectAsset = (asset: AssetItem) => {
    if (asset.modelUrl) loadModelInViewer(asset.modelUrl, asset.name);
  };

  const handleDeleteAsset = async (id: string) => {
    try {
      await fetch(`/api/v1/jobs/${id}`, { method: "DELETE" });
      toast.success("Asset deleted");
      loadHistory();
    } catch {
      toast.error("Failed to delete asset");
    }
  };

  return (
    <AssetPanel
      className={className}
      assets={assets}
      selectedAssetId={null}
      onSelectAsset={handleSelectAsset}
      onDeleteAsset={handleDeleteAsset}
      onAssetUploaded={loadHistory}
      loading={isLoadingHistory}
    />
  );
}

export default AssetPanelHost;
