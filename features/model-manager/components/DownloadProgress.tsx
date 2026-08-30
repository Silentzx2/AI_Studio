"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AlertCircle, Pause, Play, X, Download, Clock, CheckCircle } from 'lucide-react';

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

// Track download speed with history
interface DownloadSpeedTracker {
  previousSize: number;
  previousTime: number;
  currentSpeed: number; // bytes per second
  speedHistory: number[]; // for smoothing
}

const POLL_INTERVAL = 5000; // Reduced from 1s to 5s to prevent UI freezing

export function DownloadProgress() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isActive, setIsActive] = useState(true);
  
  // Speed tracking state
  const speedTrackersRef = useRef<Map<string, DownloadSpeedTracker>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pause polling when tab is hidden to save resources
  useEffect(() => {
    const onVisibility = () => {
      setIsActive(!document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    fetchDownloads();
    // Only poll when tab is active — prevents unnecessary re-renders when hidden
    if (isActive) {
      intervalRef.current = setInterval(fetchDownloads, POLL_INTERVAL);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]);

  // Calculate download speed
  const calculateSpeed = useCallback((downloadId: string, currentSize: number): number => {
    const now = Date.now();
    const tracker = speedTrackersRef.current.get(downloadId);
    
    if (!tracker) {
      speedTrackersRef.current.set(downloadId, {
        previousSize: currentSize,
        previousTime: now,
        currentSpeed: 0,
        speedHistory: []
      });
      return 0;
    }
    
    const timeDiff = (now - tracker.previousTime) / 1000; // seconds
    if (timeDiff < 0.5) return tracker.currentSpeed; // Don't update too frequently
    
    const sizeDiff = currentSize - tracker.previousSize;
    const instantSpeed = sizeDiff > 0 ? sizeDiff / timeDiff : 0;
    
    // Smooth the speed with moving average
    const history = [...tracker.speedHistory, instantSpeed].slice(-5); // Keep last 5 samples
    const smoothedSpeed = history.reduce((a, b) => a + b, 0) / history.length;
    
    speedTrackersRef.current.set(downloadId, {
      previousSize: currentSize,
      previousTime: now,
      currentSpeed: smoothedSpeed,
      speedHistory: history
    });
    
    return smoothedSpeed;
  }, []);

  const fetchDownloads = async () => {
    try {
      const res = await fetch('/api/v1/download/queue', { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (data.success) {
        setDownloads(data.data.queue || []);
        
        // Calculate speeds when data updates
        const queue = data.data.queue || [];
        queue.forEach((item: DownloadItem) => {
          if (item.status === 'downloading') {
            calculateSpeed(item.id, item.downloaded_size);
          }
        });
      }
    } catch (error) {
      // Silently fail — backend might be temporarily unavailable
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

  // Bug 6 Fix: Format speed with proper units
  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond <= 0) return '--';
    if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
  };

  // Bug 6 Fix: Estimate remaining time
  const estimateTimeRemaining = (downloadId: string, downloadedSize: number, totalSize: number): string => {
    const tracker = speedTrackersRef.current.get(downloadId);
    if (!tracker || tracker.currentSpeed <= 0 || totalSize <= 0) return '';
    
    const remaining = totalSize - downloadedSize;
    if (remaining <= 0) return '';
    
    const seconds = remaining / tracker.currentSpeed;
    if (seconds < 60) return `~${Math.ceil(seconds)}s`;
    if (seconds < 3600) return `~${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
    return `~${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
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
    speedTrackersRef.current.delete(downloadId); // Clean up tracker
    fetchDownloads();
  };

  if (loading) {
    return <div className="text-[hsl(var(--foreground))]/60">Loading downloads...</div>;
  }

  if (downloads.length === 0) {
    return (
      <div className="text-[hsl(var(--foreground))]/60 text-center py-8">
        <Download className="w-12 h-12 mx-auto mb-3 opacity-30" />
        No active downloads
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {downloads.map((download) => {
        // Bug 6 Fix: Get current speed for this download
        const speed = speedTrackersRef.current.get(download.id)?.currentSpeed || 0;
        const timeRemaining = estimateTimeRemaining(download.id, download.downloaded_size, download.total_size);
        
        return (
          <Card key={download.id} className="bg-[hsl(var(--surface-2))] border-[hsl(var(--border))]/[0.3] p-4">
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-[hsl(var(--foreground))] truncate">{download.model_name}</h3>
                  <p className="text-sm text-[hsl(var(--foreground))]/60 mt-1">
                    {formatBytes(download.downloaded_size)} / {formatBytes(download.total_size)}
                  </p>
                  {/* Bug 6 Fix: Show speed and ETA */}
                  {(download.status === 'downloading' && speed > 0) && (
                    <p className="text-xs text-[hsl(var(--neon-pink))] mt-1 flex items-center gap-2">
                      <Download className="w-3 h-3" />
                      <span>{formatSpeed(speed)}</span>
                      {timeRemaining && (
                        <>
                          <span className="text-[hsl(var(--foreground))]/30">|</span>
                          <Clock className="w-3 h-3" />
                          <span>{timeRemaining}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="text-right ml-4">
                  <p className={`text-lg font-semibold ${
                    download.status === 'completed' ? 'text-[hsl(var(--neon-green))]' : 
                    download.status === 'failed' ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--foreground))]'
                  }`}>
                    {download.progress_percent.toFixed(1)}%
                  </p>
                  {/* Bug 6 Fix: Status indicator */}
                  <p className="text-xs text-[hsl(var(--foreground))]/40 mt-1 capitalize">{download.status}</p>
                </div>
              </div>

              <Progress 
                value={download.progress_percent} 
                className="h-2"
                /* Bug 6 Fix: Color based on status */
              />

              {download.status === 'failed' && download.error_message && (
                <div className="flex gap-2 text-[hsl(var(--destructive))] text-sm bg-[hsl(var(--destructive)/0.1)] p-2 rounded-md">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{download.error_message}</span>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
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
                    className="gap-1 hover:bg-[hsl(var(--destructive)/0.2)] hover:text-[hsl(var(--destructive))] hover:border-[hsl(var(--destructive)/0.4)]"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </Button>
                )}
                {download.status === 'completed' && (
                  <div className="flex items-center gap-2 text-[hsl(var(--neon-green))] text-sm ml-auto">
                    <CheckIcon className="w-4 h-4" />
                    Download Complete
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// Simple check icon for completed state
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}
