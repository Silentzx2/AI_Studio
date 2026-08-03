"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Zap, 
  Clock, 
  HardDrive, 
  Cpu, 
  MonitorPlay,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

interface BenchmarkResult {
  id: string;
  model_id: string;
  model_name: string;
  inference_time_ms: number | null;
  throughput_samples_per_sec: number | null;
  memory_usage_mb: number | null;
  gpu_utilization_percent: number | null;
  timestamp: string | null;
  status: 'completed' | 'running' | 'error' | 'pending' | 'placeholder';
}

interface BenchmarksTabProps {
  modelId?: string;
}

export function BenchmarksTab({ modelId }: BenchmarksTabProps) {
  const [benchmarks, setBenchmarks] = useState<BenchmarkResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningBenchmarks, setRunningBenchmarks] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState<string | undefined>(modelId);

  // Fetch benchmarks data
  const fetchBenchmarks = useCallback(async () => {
    try {
      setLoading(true);
      const url = selectedModel 
        ? `/api/v1/models/${selectedModel}/benchmark`
        : '/api/v1/models/health/all';
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.success) {
        if (selectedModel && data.data) {
          // Single model benchmark
          setBenchmarks([{
            id: data.data.model_id || 'unknown',
            model_id: data.data.model_id || selectedModel,
            model_name: data.data.model_name || selectedModel,
            inference_time_ms: data.data.inference_time_ms,
            throughput_samples_per_sec: data.data.throughput,
            memory_usage_mb: data.data.memory_mb,
            gpu_utilization_percent: data.data.gpu_utilization,
            timestamp: data.data.timestamp,
            status: data.data.status === 'placeholder' ? 'placeholder' : 'completed'
          }]);
        } else if (data.data?.models) {
          // Multiple models health/benchmark data
          const modelBenchmarks = Object.entries(data.data.models).map(
            ([id, info]: [string, any]) => ({
              id,
              model_id: id,
              model_name: info.name || id,
              inference_time_ms: info.benchmark?.inference_time || null,
              throughput_samples_per_sec: info.benchmark?.throughput || null,
              memory_usage_mb: info.benchmark?.memory_mb || null,
              gpu_utilization_percent: info.benchmark?.gpu_utilization || null,
              timestamp: new Date().toISOString(),
              status: (info.status === 'healthy' ? 'completed' : 'error') as BenchmarkResult['status']
            })
          );
          setBenchmarks(modelBenchmarks);
        }
      }
    } catch (error) {
      console.error('Failed to fetch benchmarks:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedModel]);

  useEffect(() => {
    fetchBenchmarks();
    
    // Auto-refresh every 60 seconds when running benchmarks
    if (runningBenchmarks.size > 0) {
      const interval = setInterval(fetchBenchmarks, 10000);
      return () => clearInterval(interval);
    }
  }, [fetchBenchmarks, runningBenchmarks.size]);

  // Run benchmark for a specific model
  const runBenchmark = async (benchmark: BenchmarkResult) => {
    setRunningBenchmarks(prev => new Set([...prev, benchmark.model_id]));
    
    try {
      const res = await fetch(`/api/v1/models/${benchmark.model_id}/benchmark`, {
        method: 'POST'
      });
      
      if (res.ok) {
        // Refresh after a short delay
        setTimeout(() => fetchBenchmarks(), 2000);
      }
    } catch (error) {
      console.error('Benchmark failed:', error);
    } finally {
      setTimeout(() => {
        setRunningBenchmarks(prev => {
          const newSet = new Set(prev);
          newSet.delete(benchmark.model_id);
          return newSet;
        });
      }, 3000);
    }
  };

  // Format timestamp
  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  // Get status badge color
  const getStatusBadge = (status: BenchmarkResult['status']) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
          <CheckCircle className="w-3 h-3 mr-1" /> Completed
        </Badge>;
      case 'running':
        return <Badge variant="default" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Running...
        </Badge>;
      case 'placeholder':
        return <Badge variant="default" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <AlertCircle className="w-3 h-3 mr-1" /> Not Available
        </Badge>;
      case 'error':
        return <Badge variant="default" className="bg-red-500/20 text-red-400 border-red-500/30">
          <AlertCircle className="w-3 h-3 mr-1" /> Error
        </Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-white/60" />
        <span className="ml-2 text-white/60">Loading benchmarks...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Model Benchmarks
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchBenchmarks}
          className="gap-2 border-white/20 text-white hover:bg-white/10"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Benchmarks Grid */}
      <div className="grid gap-4">
        {benchmarks.length === 0 ? (
          <Card className="bg-white/5 border-white/10 p-8 text-center">
            <MonitorPlay className="w-12 h-12 mx-auto mb-4 text-white/40" />
            <p className="text-white/60">No benchmark data available</p>
            <p className="text-sm text-white/40 mt-2">
              Run a benchmark to see performance metrics
            </p>
          </Card>
        ) : (
          benchmarks.map((bench) => (
            <Card 
              key={bench.id} 
              className="bg-white/5 border-white/10 p-4 hover:bg-white/[0.08] transition-colors"
            >
              {/* Model Info */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-semibold text-white">{bench.model_name}</h4>
                  <p className="text-sm text-white/50 font-mono">{bench.model_id}</p>
                </div>
                <div className="flex items-center gap-3">
                  {getStatusBadge(bench.status)}
                  <Button
                    size="sm"
                    onClick={() => runBenchmark(bench)}
                    disabled={runningBenchmarks.has(bench.model_id)}
                    className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Zap className={`w-4 h-4 ${runningBenchmarks.has(bench.model_id) ? 'animate-pulse' : ''}`} />
                    {runningBenchmarks.has(bench.model_id) ? 'Running...' : 'Run Benchmark'}
                  </Button>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Inference Time */}
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-white/50 text-sm mb-1">
                    <Clock className="w-4 h-4" />
                    Inference Time
                  </div>
                  <p className="text-xl font-bold text-white">
                    {bench.inference_time_ms !== null 
                      ? `${bench.inference_time_ms.toFixed(1)}ms` 
                      : '--'}
                  </p>
                </div>

                {/* Throughput */}
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-white/50 text-sm mb-1">
                    <TrendingUp className="w-4 h-4" />
                    Throughput
                  </div>
                  <p className="text-xl font-bold text-white">
                    {bench.throughput_samples_per_sec !== null 
                      ? `${bench.throughput_samples_per_sec.toFixed(1)} /s` 
                      : '--'}
                  </p>
                </div>

                {/* Memory Usage */}
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-white/50 text-sm mb-1">
                    <HardDrive className="w-4 h-4" />
                    Memory Usage
                  </div>
                  <p className="text-xl font-bold text-white">
                    {bench.memory_usage_mb !== null 
                      ? `${bench.memory_usage_mb.toFixed(0)} MB` 
                      : '--'}
                  </p>
                </div>

                {/* GPU Utilization */}
                <div className="bg-black/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-white/50 text-sm mb-1">
                    <Cpu className="w-4 h-4" />
                    GPU Utilization
                  </div>
                  <p className="text-xl font-bold text-white">
                    {bench.gpu_utilization_percent !== null 
                      ? `${bench.gpu_utilization_percent.toFixed(1)}%` 
                      : '--'}
                  </p>
                </div>
              </div>

              {/* Timestamp */}
              {bench.timestamp && (
                <p className="text-xs text-white/40 mt-3">
                  Last run: {formatTime(bench.timestamp)}
                </p>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
