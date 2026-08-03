import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HardDrive, Loader2, AlertCircle } from 'lucide-react';
import { apiClient } from '@/services/apiClient';

interface StorageInfo {
  total: number;
  used: number;
  available: number;
  models_size: number;
  cache_size: number;
  temp_size: number;
  usage_percent: number;
}

export function StorageTab() {
  const [data, setData] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStorage() {
      try {
        const res = await apiClient.get<{ success: boolean; data: any }>('/api/v1/system/storage');
        const storage = (res as any)?.data ?? (res as any)?.storage;
        if (storage) {
          setData({
            total: storage.total_gb ?? storage.total ?? 0,
            used: storage.used_gb ?? storage.used ?? 0,
            available: storage.free_gb ?? storage.available ?? 0,
            models_size: storage.details?.models?.size_gb ?? storage.models_size ?? 0,
            cache_size: storage.details?.cache?.size_gb ?? storage.cache_size ?? 0,
            temp_size: storage.details?.temp?.size_gb ?? storage.temp_size ?? 0,
            usage_percent: storage.used_percent ?? storage.usage_percent ?? 0,
          });
        }
      } catch (err) {
        setError('Failed to fetch storage info from backend');
      } finally {
        setLoading(false);
      }
    }
    fetchStorage();
  }, []);

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (error) return <div className="p-6 text-destructive flex items-center gap-2"><AlertCircle /> {error}</div>;
  if (!data) return null;

  const formatGB = (gb: number) => Number(gb || 0).toFixed(2);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--neon-amber))]">Storage Management</h2>
        <p className="text-muted-foreground mt-2">View and manage application storage usage</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-[hsl(var(--neon-amber))]" />
            Total Storage
          </CardTitle>
          <CardDescription>Disk usage for the primary volume</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span>{formatGB(data.used)} GB Used</span>
            <span>{formatGB(data.available)} GB Free</span>
          </div>
          <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-[hsl(var(--neon-amber))] transition-all" style={{ width: `${data.usage_percent}%` }} />
          </div>
          <p className="text-xs text-muted-foreground text-right">{formatGB(data.total)} GB Total</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg capitalize">Models</CardTitle>
            <CardDescription className="text-xs truncate">/models</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-[hsl(var(--neon-amber))]">
              {formatGB(data.models_size)} GB
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg capitalize">Cache</CardTitle>
            <CardDescription className="text-xs truncate">/cache</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-[hsl(var(--neon-amber))]">
              {formatGB(data.cache_size)} GB
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg capitalize">Temp Files</CardTitle>
            <CardDescription className="text-xs truncate">/tmp</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-[hsl(var(--neon-amber))]">
              {formatGB(data.temp_size)} GB
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
