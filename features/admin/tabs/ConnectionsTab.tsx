import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Network, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getApiClient } from '@/services/apiClient';
import { Button } from '@/components/ui/button';

interface ConnectionInfo {
  status: string;
  ok: boolean;
  error?: string;
}

interface TestResults {
  database: ConnectionInfo;
  redis: ConnectionInfo;
  storage: ConnectionInfo;
}

export function ConnectionsTab() {
  const [data, setData] = useState<TestResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const res = await getApiClient().post<{ success: boolean; data: TestResults }>('/api/v1/system/test/connection');
      if (res.data) {
        setData(res.data);
      }
    } catch (err) {
      setError('Failed to fetch connections info from backend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  if (loading && !data) return <div className="flex h-40 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--neon-amber))]" /></div>;
  if (error) return <div className="p-6 text-destructive flex items-center gap-2"><AlertCircle /> {error}</div>;
  if (!data) return null;

  const renderStatus = (info: ConnectionInfo) => {
    if (info.ok) return <div className="flex items-center gap-2 text-[hsl(var(--neon-green))]"><CheckCircle2 className="w-5 h-5" /> Connected</div>;
    return <div className="flex flex-col gap-1 text-destructive"><div className="flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Error</div><p className="text-xs opacity-80">{info.error}</p></div>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[hsl(var(--neon-amber))]">System Connections</h2>
          <p className="text-muted-foreground mt-2">Database and cache connection status</p>
        </div>
        <Button onClick={fetchConnections} disabled={loading} className="bg-[hsl(var(--neon-amber))] text-black hover:bg-[hsl(var(--neon-amber))]/90 font-bold">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Network className="w-4 h-4 mr-2" />}
          Test Connections
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" /> Database</CardTitle>
            <CardDescription>Primary PostgreSQL relational database</CardDescription>
          </CardHeader>
          <CardContent>
            {renderStatus(data.database)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Network className="w-5 h-5" /> Redis</CardTitle>
            <CardDescription>In-memory cache and message broker</CardDescription>
          </CardHeader>
          <CardContent>
            {renderStatus(data.redis)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
