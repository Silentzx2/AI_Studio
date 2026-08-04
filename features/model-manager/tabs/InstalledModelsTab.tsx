"use client";

import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Trash2, 
  RefreshCw, 
  Info, 
  Settings,
  Activity,
  AlertTriangle 
} from 'lucide-react';

interface InstalledModel {
  id: string;
  name: string;
  version: string;
  category: string;
  size_mb: number;
  installed_at: string;
  status: 'active' | 'inactive' | 'error';
  capabilities: string[];
}

export function InstalledModelsTab() {
  const [models, setModels] = useState<InstalledModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  useEffect(() => {
    const fetchInstalledModels = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/v1/models/installed');
        const data = await res.json();
        if (data.success) {
          setModels(data.data.models);
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInstalledModels();
  }, []);

  const fetchInstalledModels = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/models/installed');
      const data = await res.json();
      if (data.success) {
        setModels(data.data.models);
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUninstall = async (modelId: string) => {
    if (confirm('Are you sure you want to uninstall this model?')) {
      const res = await fetch(`/api/v1/models/${modelId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchInstalledModels();
      }
    }
  };

  const handleRepair = async (modelId: string) => {
    const res = await fetch(`/api/v1/models/${modelId}/repair`, { method: 'POST' });
    if (res.ok) {
      fetchInstalledModels();
    }
  };

  const filteredModels = models.filter(m =>
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="text-[hsl(var(--foreground))]/60">Loading installed models...</div>;
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search installed models..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="bg-white/5 border-white/10"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredModels.map(model => (
          <Card
            key={model.id}
            className="bg-white/5 border-white/10 p-4 hover:bg-white/10 transition cursor-pointer"
            onClick={() => setSelectedModel(model.id)}
          >
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-[hsl(var(--foreground))]">{model.name}</h3>
                  <p className="text-sm text-[hsl(var(--foreground))]/60">{model.id}</p>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  model.status === 'active' ? 'bg-green-900/30 text-[hsl(var(--neon-green))]' :
                  model.status === 'error' ? 'bg-red-900/30 text-[hsl(var(--destructive))]' :
                  'bg-yellow-900/30 text-[hsl(var(--neon-amber))]'
                }`}>
                  <div className="flex gap-1 items-center">
                    <Activity className="w-3 h-3" />
                    {model.status}
                  </div>
                </div>
              </div>

              <div className="text-sm text-[hsl(var(--foreground))]/60">
                <p>Version: {model.version}</p>
                <p>Size: {(model.size_mb / 1024).toFixed(1)} GB</p>
                <p>Installed: {new Date(model.installed_at).toLocaleDateString()}</p>
              </div>

              {model.capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {model.capabilities.slice(0, 3).map(cap => (
                    <span key={cap} className="text-xs bg-white/10 text-[hsl(var(--foreground))]/80 px-2 py-1 rounded">
                      {cap}
                    </span>
                  ))}
                  {model.capabilities.length > 3 && (
                    <span className="text-xs bg-white/10 text-[hsl(var(--foreground))]/80 px-2 py-1 rounded">
                      +{model.capabilities.length - 3}
                    </span>
                  )}
                </div>
              )}

              {model.status === 'error' && (
                <div className="flex gap-1 text-[hsl(var(--neon-amber))] text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span>Health check failed</span>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-white/10">
                {model.status === 'error' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRepair(model.id);
                    }}
                    className="gap-1 flex-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Repair
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUninstall(model.id);
                  }}
                  className="gap-1 flex-1 text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]"
                >
                  <Trash2 className="w-3 h-3" />
                  Uninstall
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredModels.length === 0 && (
        <div className="text-center text-[hsl(var(--foreground))]/60 py-8">
          No installed models found
        </div>
      )}
    </div>
  );
}
