import React from 'react';
import { useGenerationStatus } from '@/hooks/useBackendData';
import { Progress } from '@/components/ui/progress';

interface JobProgressMonitorProps {
  jobId: string | null;
}

export function JobProgressMonitor({ jobId }: JobProgressMonitorProps) {
  const { status, loading, error } = useGenerationStatus(jobId);

  if (!jobId) return null;

  if (error) return <div className="text-red-500 text-sm">Error: {error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium text-foreground">{status?.stage || 'Preparing...'}</span>
        <span className="text-muted-foreground">
          {status?.progress || 0}%
        </span>
      </div>
      <Progress value={status?.progress || 0} className="h-2" />
      {loading && <p className="text-xs text-muted-foreground animate-pulse">Streaming updates...</p>}
      {!loading && status?.status === 'completed' && <p className="text-xs text-green-500">Completed</p>}
    </div>
  );
}
