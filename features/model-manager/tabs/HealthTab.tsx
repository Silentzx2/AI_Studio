"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  RefreshCw,
  Heart,
  FileText,
  Package,
  HardDrive,
  Cpu,
  Shield
} from 'lucide-react';

interface HealthCheck {
  status: 'ok' | 'error' | 'warning' | 'skipped';
  message?: string;
  [key: string]: any;
}

interface ModelHealth {
  model_id: string;
  model_name: string;
  status: 'healthy' | 'unhealthy' | 'warning' | 'error';
  timestamp: string;
  checks: Record<string, HealthCheck>;
  summary?: {
    total_checks: number;
    passed: number;
    warnings: number;
    errors: number;
  };
}

interface HealthTabProps {
  modelId?: string;
  autoRefresh?: boolean;
}

export function HealthTab({ modelId, autoRefresh = true }: HealthTabProps) {
  const [healthStatus, setHealthStatus] = useState<Record<string, ModelHealth>>({});
  const [loading, setLoading] = useState(true);
  const [selectedModelHealth, setSelectedModelHealth] = useState<ModelHealth | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch health data
  const fetchHealthStatus = useCallback(async () => {
    try {
      if (modelId) {
        // Single model health check
        const res = await fetch(`/api/v1/models/${modelId}/health`);
        const data = await res.json();
        
        if (data.success && data.data) {
          setSelectedModelHealth(data.data);
          setHealthStatus({ [modelId]: data.data });
        }
      } else {
        // All models health check
        const res = await fetch('/api/v1/models/health/all');
        const data = await res.json();
        
        if (data.success && data.data?.models) {
          setHealthStatus(data.data.models);
          
          // Set first model as selected if none selected
          if (!selectedModelHealth && Object.keys(data.data.models).length > 0) {
            const firstModelId = Object.keys(data.data.models)[0];
            setSelectedModelHealth({
              model_id: firstModelId,
              ...data.data.models[firstModelId]
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch health status:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [modelId]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (autoRefresh) {
      interval = setInterval(fetchHealthStatus, 30000); // 30 seconds
    } else {
      fetchHealthStatus();
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchHealthStatus, autoRefresh]);

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'ok':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'unhealthy':
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-400" />;
    }
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Healthy</Badge>;
      case 'unhealthy':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Unhealthy</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Warning</Badge>;
      case 'error':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Error</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  // Get check icon for individual checks
  const getCheckIcon = (checkName: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      files: <FileText className="w-4 h-4" />,
      dependencies: <Package className="w-4 h-4" />,
      manifest: <Shield className="w-4 h-4" />,
      disk_space: <HardDrive className="w-4 h-4" />,
      gpu: <Cpu className="w-4 h-4" />,
      inference: <Heart className="w-4 h-4" />,
      loading: <RefreshCw className="w-4 h-4" />
    };
    return iconMap[checkName] || <Shield className="w-4 h-4" />;
  };

  // Render health overview stats
  const renderOverviewStats = () => {
    const models = Object.values(healthStatus);
    const healthy = models.filter(m => m.status === 'healthy').length;
    const unhealthy = models.filter(m => m.status === 'unhealthy').length;
    const warnings = models.filter(m => m.status === 'warning').length;

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-white/5 border-white/10 p-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{models.length}</p>
            <p className="text-sm text-white/60">Total Models</p>
          </div>
        </Card>
        <Card className="bg-green-500/10 border-green-500/20 p-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-green-400">{healthy}</p>
            <p className="text-sm text-green-400/80">Healthy</p>
          </div>
        </Card>
        <Card className="bg-yellow-500/10 border-yellow-500/20 p-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-yellow-400">{warnings}</p>
            <p className="text-sm text-yellow-400/80">Warnings</p>
          </div>
        </Card>
        <Card className="bg-red-500/10 border-red-500/20 p-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-red-400">{unhealthy}</p>
            <p className="text-sm text-red-400/80">Unhealthy</p>
          </div>
        </Card>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Heart className={`w-8 h-8 text-pink-400 ${loading ? 'animate-pulse' : ''}`} />
        <span className="ml-3 text-white/60">Checking system health...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Heart className="w-5 h-5 text-pink-400" />
          System Health
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRefreshing(true);
            fetchHealthStatus();
          }}
          disabled={refreshing}
          className="gap-2 border-white/20 text-white hover:bg-white/10"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh Now
        </Button>
      </div>

      {/* Overview Stats (only in multi-model view) */}
      {!modelId && renderOverviewStats()}

      {/* Main Content */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Model List / Selected Model */}
        {modelId && selectedModelHealth ? (
          /* Single Model View */
          <Card className="md:col-span-2 bg-white/5 border-white/10 p-6">
            <SingleModelHealthView health={selectedModelHealth} getCheckIcon={getCheckIcon} getStatusBadge={getStatusBadge} />
          </Card>
        ) : (
          <>
            {/* Model List */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {Object.entries(healthStatus).map(([id, health]) => (
                <Card
                  key={id}
                  className={`bg-white/5 border p-4 cursor-pointer transition-all ${
                    selectedModelHealth?.model_id === id
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-white/10 hover:bg-white/[0.08]'
                  }`}
                  onClick={() => setSelectedModelHealth({ ...health, model_id: id })}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(health.status)}
                      <div>
                        <p className="font-medium text-white">{health.model_name || id}</p>
                        <p className="text-xs text-white/40 font-mono">{id}</p>
                      </div>
                    </div>
                    {getStatusBadge(health.status)}
                  </div>
                </Card>
              ))}
              
              {Object.keys(healthStatus).length === 0 && (
                <Card className="bg-white/5 border-white/10 p-8 text-center">
                  <Heart className="w-12 h-12 mx-auto mb-4 text-white/40" />
                  <p className="text-white/60">No models found</p>
                </Card>
              )}
            </div>

            {/* Selected Model Details */}
            <Card className="bg-white/5 border-white/10 p-6 max-h-[600px] overflow-y-auto">
              {selectedModelHealth ? (
                <SingleModelHealthView 
                  health={selectedModelHealth} 
                  getCheckIcon={getCheckIcon} 
                  getStatusBadge={getStatusBadge} 
                />
              ) : (
                <div className="text-center py-12 text-white/40">
                  Select a model to view details
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

// Sub-component for single model health display
function SingleModelHealthView({ 
  health, 
  getCheckIcon, 
  getStatusBadge 
}: { 
  health: ModelHealth; 
  getCheckIcon: (name: string) => React.ReactNode;
  getStatusBadge: (status: string) => React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {/* Model Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div>
          <h4 className="text-xl font-semibold text-white">{health.model_name}</h4>
          <p className="text-sm text-white/40 font-mono">{health.model_id}</p>
        </div>
        {getStatusBadge(health.status)}
      </div>

      {/* Summary */}
      {health.summary && (
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-black/20 rounded-lg p-2">
            <p className="text-lg font-bold text-white">{health.summary.total_checks}</p>
            <p className="text-xs text-white/50">Checks</p>
          </div>
          <div className="bg-green-500/10 rounded-lg p-2">
            <p className="text-lg font-bold text-green-400">{health.summary.passed}</p>
            <p className="text-xs text-green-400/70">Passed</p>
          </div>
          <div className="bg-yellow-500/10 rounded-lg p-2">
            <p className="text-lg font-bold text-yellow-400">{health.summary.warnings}</p>
            <p className="text-xs text-yellow-400/70">Warnings</p>
          </div>
          <div className="bg-red-500/10 rounded-lg p-2">
            <p className="text-lg font-bold text-red-400">{health.summary.errors}</p>
            <p className="text-xs text-red-400/70">Errors</p>
          </div>
        </div>
      )}

      {/* Individual Checks */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-white/70 uppercase tracking-wider">Detailed Checks</p>
        
        {health.checks && Object.entries(health.checks).map(([checkName, result]) => (
          <div key={checkName} className="bg-black/20 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-white/80">
                {getCheckIcon(checkName)}
                <span className="capitalize font-medium">{checkName.replace('_', ' ')}</span>
              </div>
              <span className={`text-sm ${
                result.status === 'ok' ? 'text-green-400' :
                result.status === 'warning' ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {result.status.toUpperCase()}
              </span>
            </div>
            
            {result.message && (
              <p className="text-sm text-white/50 ml-6">{result.message}</p>
            )}
            
            {/* Additional info based on check type */}
            {result.found_count !== undefined && (
              <p className="text-xs text-white/40 ml-6">
                Found {result.found_count}/{result.required_count || '?'} files
              </p>
            )}
            
            {result.missing_packages && result.missing_packages.length > 0 && (
              <div className="ml-6 mt-2 space-y-1">
                {result.missing_packages.map((pkg: any, idx: number) => (
                  <p key={idx} className="text-xs text-yellow-400/80 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {typeof pkg === 'string' ? pkg : pkg.name}
                  </p>
                ))}
              </div>
            )}
            
            {result.gpus && Array.isArray(result.gpus) && (
              <div className="ml-6 mt-2 space-y-1">
                {result.gpus.map((gpu: any, idx: number) => (
                  <p key={idx} className="text-xs text-white/50">
                    GPU {idx}: {gpu.name} ({gpu.vram_gb || gpu.total_memory_mb ? `${gpu.vram_gb || gpu.total_memory_mb/1024}GB VRAM` : ''})
                  </p>
                ))}
              </div>
            )}
            
            {result.disk_free_gb !== undefined && (
              <p className="text-xs text-white/40 ml-6">
                Free: {result.disk_free_gb}GB
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Timestamp */}
      {health.timestamp && (
        <p className="text-xs text-white/30 pt-4 border-t border-white/10">
          Last checked: {new Date(health.timestamp).toLocaleString()}
        </p>
      )}
    </div>
  );
}
