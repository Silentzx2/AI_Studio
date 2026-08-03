"use client";

import React, { useEffect, useState } from 'react';
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AlertCircle, Pause, Play, X } from 'lucide-react';

interface DownloadItem {
  id: string;
  model_id: string;
  model_name: string;
  progress_percent: number;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed';
  error_message?: string;
  downloaded_size: number;
  total_size: number;
}

export function DownloadProgress() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDownloads();
    const interval = setInterval(fetchDownloads, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchDownloads = async () => {
    try {
      const res = await fetch('/api/v1/download/queue');
      const data = await res.json();
      if (data.success) {
        setDownloads(data.data.queue || []);
      }
    } catch (error) {
      console.error('Failed to fetch downloads:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handlePause = async (downloadId: string) => {
    await fetch(`/api/v1/download/${downloadId}/pause`, { method: 'POST' });
    fetchDownloads();
  };

  const handleResume = async (downloadId: string) => {
    await fetch(`/api/v1/download/${downloadId}/resume`, { method: 'POST' });
    fetchDownloads();
  };

  const handleCancel = async (downloadId: string) => {
    await fetch(`/api/v1/download/${downloadId}/cancel`, { method: 'POST' });
    fetchDownloads();
  };

  if (loading) {
    return <div className="text-white/60">Loading downloads...</div>;
  }

  if (downloads.length === 0) {
    return (
      <div className="text-white/60 text-center py-8">
        No active downloads
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {downloads.map((download) => (
        <Card key={download.id} className="bg-white/5 border-white/10 p-4">
          <div className="space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium text-white">{download.model_name}</h3>
                <p className="text-sm text-white/60">
                  {formatBytes(download.downloaded_size)} / {formatBytes(download.total_size)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-white">
                  {download.progress_percent.toFixed(1)}%
                </p>
              </div>
            </div>

            <Progress 
              value={download.progress_percent} 
              className="h-2"
            />

            {download.status === 'failed' && download.error_message && (
              <div className="flex gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <span>{download.error_message}</span>
              </div>
            )}

            <div className="flex gap-2">
              {download.status === 'downloading' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePause(download.id)}
                  className="gap-1"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </Button>
              )}
              {download.status === 'paused' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleResume(download.id)}
                  className="gap-1"
                >
                  <Play className="w-4 h-4" />
                  Resume
                </Button>
              )}
              {download.status !== 'completed' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCancel(download.id)}
                  className="gap-1"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
