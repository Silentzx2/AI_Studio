"use client";

import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Info, AlertTriangle } from 'lucide-react';
import { CompatibilityChecker } from '../components/CompatibilityChecker';

interface AvailableModel {
  id: string;
  name: string;
  description: string;
  version?: string;
  author?: string;
  category?: string;
  downloads?: number;
  size_mb?: number;
  size?: number;
  manifest?: any;
  supported_formats?: string[];
  tags?: string[];
  provider?: string;
  capabilities?: string[];
  min_vram_mb?: number;
  difficulty?: string;
}

export function AvailableModelsTab({ onNavigateToQueue }: { onNavigateToQueue?: () => void } = {}) {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedModel, setSelectedModel] = useState<AvailableModel | null>(null);
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [downloadStatus, setDownloadStatus] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAvailableModels = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (categoryFilter) params.append('category', categoryFilter);
        if (searchTerm) params.append('search', searchTerm);

        // Bug 6b fix: use /api/v1/discover/models (the correct endpoint that exists)
        const queryStr = params.toString();
        const res = await fetch(`/api/v1/discover/models${queryStr ? '?' + queryStr : ''}`);
        const data = await res.json();
        if (data.success && data.data?.models) {
          setModels(data.data.models);
        } else {
          setError(data.error || 'Failed to load models');
          setModels([]);
        }
      } catch (err) {
        console.error('Failed to fetch available models:', err);
        setError('Network error while fetching models');
      } finally {
        setLoading(false);
      }
    };
    fetchAvailableModels();
  }, [categoryFilter, searchTerm]);

  const handleDownload = async (model: AvailableModel) => {
    if (downloading.has(model.id)) return;
    setDownloading(prev => new Set([...prev, model.id]));
    setDownloadStatus(prev => ({ ...prev, [model.id]: 'Starting...' }));

    try {
      const manifest = model.manifest || {};
      const downloadUrl = manifest.download_url || manifest.url || '';
      const filename = manifest.weights_file || manifest.filename || `${model.id}.bin`;
      // total_size must be > 0 per backend validation; default to 1 if unknown
      const totalSize = Math.max((model.size_mb || 0) * 1024 * 1024, 1);

      const res = await fetch(`/api/v1/download/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: model.id,
          model_name: model.name,
          url: downloadUrl,
          filename,
          total_size: totalSize,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setDownloadStatus(prev => ({ ...prev, [model.id]: 'Queued' }));
        // Navigate to queue tab so user can track progress
        onNavigateToQueue?.();
      } else {
        setDownloadStatus(prev => ({ ...prev, [model.id]: `Error: ${data.detail || res.statusText}` }));
      }
    } catch (err) {
      console.error('Download failed:', err);
      setDownloadStatus(prev => ({ ...prev, [model.id]: 'Network error' }));
    } finally {
      setDownloading(prev => {
        const newSet = new Set(prev);
        newSet.delete(model.id);
        return newSet;
      });
    }
  };

  const filteredModels = models.filter(m =>
    (!categoryFilter || m.category === categoryFilter || (m.tags && m.tags.some(t => t.toLowerCase().includes(categoryFilter.toLowerCase()))))
  );

  const categories = [...new Set(models.map(m => m.category).filter(Boolean) as string[])];

  if (loading) {
    return <div className="text-[hsl(var(--foreground))]/60">Loading available models...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Input
          placeholder="Search models..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-white/5 border-white/10"
        />

        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant={categoryFilter === '' ? 'default' : 'outline'}
            onClick={() => setCategoryFilter('')}
          >
            All Models
          </Button>
          {categories.map(cat => (
            <Button
              key={cat}
              size="sm"
              variant={categoryFilter === cat ? 'default' : 'outline'}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[hsl(var(--neon-amber)/0.1)] border border-[hsl(var(--neon-amber)/0.2)] text-[hsl(var(--neon-amber))] text-sm">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {selectedModel && (
        <Card className="bg-white/5 border-white/10 p-4 space-y-4">
          <div>
            <h3 className="font-semibold text-[hsl(var(--foreground))] mb-1">{selectedModel.name}</h3>
            <p className="text-[hsl(var(--foreground))]/60 text-sm">{selectedModel.description}</p>
          </div>

          <CompatibilityChecker modelManifest={selectedModel.manifest} />

          <Button
            onClick={() => handleDownload(selectedModel)}
            disabled={downloading.has(selectedModel.id)}
            className="w-full gap-2"
          >
            <Download className="w-4 h-4" />
            {downloading.has(selectedModel.id) ? 'Starting download...' : 'Download Model'}
          </Button>
          {downloadStatus[selectedModel.id] && (
            <p className={`text-xs text-center ${
              downloadStatus[selectedModel.id].startsWith('Error') ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--neon-green))]'
            }`}>
              {downloadStatus[selectedModel.id]}
            </p>
          )}

          <Button
            variant="outline"
            onClick={() => setSelectedModel(null)}
            className="w-full"
          >
            Close
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredModels.map(model => (
          <Card
            key={model.id}
            className="bg-white/5 border-white/10 p-4 hover:bg-white/10 transition cursor-pointer"
            onClick={() => setSelectedModel(model)}
          >
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-[hsl(var(--foreground))]">{model.name}</h3>
                {model.author && (
                  <p className="text-xs text-[hsl(var(--foreground))]/60 mt-1">by {model.author}</p>
                )}
                {model.provider && (
                  <p className="text-xs text-[hsl(var(--foreground))]/40 mt-0.5">via {model.provider}</p>
                )}
              </div>

              <p className="text-sm text-[hsl(var(--foreground))]/70 line-clamp-2">{model.description}</p>

              <div className="text-xs text-[hsl(var(--foreground))]/60 space-y-1">
                {model.size_mb ? (
                  <p>{(model.size_mb / 1024).toFixed(1)} GB</p>
                ) : model.size ? (
                  <p>{(model.size / (1024 * 1024)).toFixed(1)} MB</p>
                ) : null}
                {model.min_vram_mb && (
                  <p>Min VRAM: {(model.min_vram_mb / 1024).toFixed(1)} GB</p>
                )}
                {model.difficulty && (
                  <p>Difficulty: {model.difficulty}</p>
                )}
              </div>

              {(model.tags || model.capabilities || model.supported_formats) && (
                <div className="flex flex-wrap gap-1">
                  {(model.tags || model.capabilities || []).slice(0, 3).map(tag => (
                    <span key={tag} className="text-xs bg-white/10 text-[hsl(var(--foreground))]/80 px-2 py-1 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(model);
                }}
                disabled={downloading.has(model.id)}
                className="w-full gap-2"
              >
                <Download className="w-3 h-3" />
                {downloading.has(model.id) ? 'Starting...' : 'Download'}
              </Button>
              {downloadStatus[model.id] && (
                <p className={`text-[10px] text-center ${
                  downloadStatus[model.id].startsWith('Error') ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--neon-green))]'
                }`}>{downloadStatus[model.id]}</p>
              )}
            </div>
          </Card>
        ))}
      </div>

      {filteredModels.length === 0 && !error && (
        <div className="text-center text-[hsl(var(--foreground))]/60 py-8">
          No models found matching your search
        </div>
      )}
    </div>
  );
}
