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
  version: string;
  author: string;
  category: string;
  downloads: number;
  size_mb: number;
  manifest: any;
  supported_formats: string[];
}

export function AvailableModelsTab() {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedModel, setSelectedModel] = useState<AvailableModel | null>(null);
  const [downloading, setDownloading] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchAvailableModels();
  }, [categoryFilter]);

  const fetchAvailableModels = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);
      
      const res = await fetch(`/api/v1/models/available?${params}`);
      const data = await res.json();
      if (data.success) {
        setModels(data.data.models);
      }
    } catch (error) {
      console.error('Failed to fetch available models:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (modelId: string) => {
    setDownloading(prev => new Set([...prev, modelId]));
    
    try {
      const res = await fetch(`/api/v1/download/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId })
      });
      
      if (res.ok) {
        // Redirect to queue tab or show success
        alert('Download started!');
      }
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to start download');
    } finally {
      setDownloading(prev => {
        const newSet = new Set(prev);
        newSet.delete(modelId);
        return newSet;
      });
    }
  };

  const filteredModels = models.filter(m =>
    (m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
     m.description.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (!categoryFilter || m.category === categoryFilter)
  );

  const categories = [...new Set(models.map(m => m.category))];

  if (loading) {
    return <div className="text-white/60">Loading available models...</div>;
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

      {selectedModel && (
        <Card className="bg-white/5 border-white/10 p-4 space-y-4">
          <div>
            <h3 className="font-semibold text-white mb-1">{selectedModel.name}</h3>
            <p className="text-white/60 text-sm">{selectedModel.description}</p>
          </div>

          <CompatibilityChecker modelManifest={selectedModel.manifest} />

          <Button
            onClick={() => handleDownload(selectedModel.id)}
            disabled={downloading.has(selectedModel.id)}
            className="w-full gap-2"
          >
            <Download className="w-4 h-4" />
            {downloading.has(selectedModel.id) ? 'Downloading...' : 'Download Model'}
          </Button>

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
                <h3 className="font-semibold text-white">{model.name}</h3>
                <p className="text-xs text-white/60 mt-1">by {model.author}</p>
              </div>

              <p className="text-sm text-white/70 line-clamp-2">{model.description}</p>

              <div className="text-xs text-white/60 space-y-1">
                <p>v{model.version} • {(model.size_mb / 1024).toFixed(1)} GB</p>
                <p>{model.downloads.toLocaleString()} downloads</p>
              </div>

              <div className="flex flex-wrap gap-1">
                {model.supported_formats.slice(0, 3).map(fmt => (
                  <span key={fmt} className="text-xs bg-white/10 text-white/80 px-2 py-1 rounded">
                    {fmt}
                  </span>
                ))}
              </div>

              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(model.id);
                }}
                disabled={downloading.has(model.id)}
                className="w-full gap-2"
              >
                <Download className="w-3 h-3" />
                {downloading.has(model.id) ? 'Downloading...' : 'Download'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {filteredModels.length === 0 && (
        <div className="text-center text-white/60 py-8">
          No models found matching your search
        </div>
      )}
    </div>
  );
}
